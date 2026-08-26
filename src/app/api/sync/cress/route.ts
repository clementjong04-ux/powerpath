// GET /api/sync/cress — real public source sync for Malaysia CRESS.
//
// The first live-data connection. Flow (deterministic, NO LLM):
//   1. Read SRC-CRESS-SAC from source_registry.
//   2. REFUSE unless verification_status = 'verified_official' (and active).
//   3. Fetch the official URL. 4. Extract title + readable excerpt.
//   5. Hash the bytes. 6. Save an immutable source_snapshots row.
//   7. If the hash is new or changed vs the previous snapshot, create a PENDING
//      market_updates row (human_review_status = pending_review,
//      affected_scenarios = cress + solar_cress [the hybrid]).
//   8. Record sync_runs (if the table exists) + an audit_logs event.
//
// HARD LIMITS BY DESIGN: never creates assumption_versions, never reruns strategy,
// never changes a recommendation. Detection only — approval is a human act via the
// existing /api/market-updates/[id]/approve flow. Pre-feasibility only.

import { getSupabaseAdmin, supabaseAdminConfigured } from "@/lib/supabase/admin";
import { fetchSource } from "@/lib/sources/fetchSource";
import { extractSourceText } from "@/lib/sources/extractSourceText";
import { hashContent } from "@/lib/sources/hashContent";
import { classifyMarketUpdate } from "@/lib/sources/classifyMarketUpdate";

const SOURCE_ID = "SRC-CRESS-SAC";

export async function GET() {
  const config = supabaseAdminConfigured();
  if (!config.ok) {
    return Response.json(
      { ok: false, status: "not_configured", error: `Missing environment variables: ${config.missing.join(", ")}` },
      { status: 503 },
    );
  }

  const warnings: string[] = [];
  const supabase = getSupabaseAdmin();
  const startedAt = new Date().toISOString();

  // 1. Load the registered source.
  const sourceRes = await supabase.from("source_registry").select("*").eq("id", SOURCE_ID).maybeSingle();
  if (sourceRes.error) return Response.json({ ok: false, error: sourceRes.error.message }, { status: 500 });
  const source = sourceRes.data as
    | { id: string; source_name: string; url: string | null; verification_status: string | null; active: boolean; country: string }
    | null;
  if (!source) return Response.json({ ok: false, error: `${SOURCE_ID} not found in source_registry` }, { status: 404 });

  // 2. TRUST GATE — verified official sources only.
  if (source.verification_status !== "verified_official" || source.active === false) {
    await recordSyncRun(supabase, warnings, {
      source_id: SOURCE_ID, started_at: startedAt, status: "blocked",
      error: `verification_status=${source.verification_status ?? "null"}`,
    });
    return Response.json(
      {
        ok: false,
        status: "source_not_verified",
        error: `Sync refused: ${SOURCE_ID} is ${source.verification_status ?? "unverified"} — only verified_official sources can be synced.`,
      },
      { status: 403 },
    );
  }
  if (!source.url) {
    return Response.json({ ok: false, error: `${SOURCE_ID} has no URL registered.` }, { status: 400 });
  }

  // 3-5. Fetch, extract, hash.
  const fetched = await fetchSource(source.url);
  if (!fetched.ok) {
    await recordSyncRun(supabase, warnings, {
      source_id: SOURCE_ID, started_at: startedAt, status: "failed",
      http_status: fetched.status || null, error: fetched.error ?? "fetch failed",
    });
    await auditSync(supabase, warnings, "sync_failed", { source_id: SOURCE_ID, url: source.url, error: fetched.error });
    return Response.json(
      { ok: false, status: "fetch_failed", error: `Could not fetch ${source.url}: ${fetched.error}`, warnings },
      { status: 502 },
    );
  }
  const extracted = extractSourceText(fetched.bytes, fetched.contentType, source.url);
  const contentHash = hashContent(fetched.bytes);

  // Previous snapshot -> change detection.
  const prevRes = await supabase
    .from("source_snapshots")
    .select("id, content_hash, fetched_at")
    .eq("source_id", SOURCE_ID)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (prevRes.error) warnings.push(`previous-snapshot lookup failed: ${prevRes.error.message}`);
  const prev = prevRes.data as { id: string; content_hash: string | null } | null;
  const firstSnapshot = !prev;
  const changed = firstSnapshot || prev?.content_hash !== contentHash;

  // 6. Immutable snapshot (always stored — this is the source evidence).
  const snapshotRes = await supabase
    .from("source_snapshots")
    .insert({
      source_id: SOURCE_ID,
      content_hash: contentHash,
      http_status: fetched.status,
      raw_content: {
        url: source.url,
        final_url: fetched.finalUrl,
        content_type: fetched.contentType,
        bytes: fetched.bytes.length,
        kind: extracted.kind,
        title: extracted.title,
        excerpt: extracted.excerpt,
        extraction_note: extracted.extraction_note,
      },
    })
    .select("id, fetched_at")
    .single();
  if (snapshotRes.error) {
    return Response.json({ ok: false, error: `snapshot insert failed: ${snapshotRes.error.message}`, warnings }, { status: 500 });
  }
  const snapshot = snapshotRes.data as { id: string; fetched_at: string };

  // 7. Pending market update on new/changed content (never auto-applied).
  let marketUpdateId: string | null = null;
  let marketUpdateRow: Record<string, unknown> | null = null;
  if (changed) {
    const cls = classifyMarketUpdate({
      sourceName: source.source_name,
      text: `${extracted.title} ${extracted.excerpt}`,
      changed,
      firstSnapshot,
    });

    const base = {
      source_id: SOURCE_ID,
      snapshot_id: snapshot.id,
      country: source.country,
      title: cls.title,
      summary: cls.summary,
      detected_at: snapshot.fetched_at,
      update_date: snapshot.fetched_at.slice(0, 10),
      // "hybrid" in the product model is the solar_cress scenario key.
      affected_scenarios: ["cress", "solar_cress"],
      before_value: null,
      after_value: null,
      unit: cls.candidate_values.length === 1 ? "MYR/kWh" : null,
      estimated_impact: null,
      confidence: "low",
      human_review_status: "pending_review",
    };

    const RETURNED = "id, source_id, title, summary, detected_at, affected_scenarios, human_review_status";

    // Preferred shape (after migration 0006): link the assumption it would version.
    let ins = await supabase
      .from("market_updates")
      .insert({ ...base, affects_assumption: cls.affects_assumption })
      .select(RETURNED)
      .single();
    if (ins.error && /affects_assumption/.test(ins.error.message)) {
      ins = await supabase.from("market_updates").insert(base).select(RETURNED).single();
      warnings.push("Update saved without affects_assumption — run supabase/APPLY_PENDING.sql (0006).");
    }
    if (ins.error) {
      warnings.push(`market_updates insert failed: ${ins.error.message}`);
    } else {
      marketUpdateRow = ins.data as Record<string, unknown>;
      marketUpdateId = marketUpdateRow.id as string;
    }
  }

  // 8. sync_runs (optional table) + audit event.
  await recordSyncRun(supabase, warnings, {
    source_id: SOURCE_ID, started_at: startedAt, status: "succeeded",
    http_status: fetched.status, content_hash: contentHash, changed,
    snapshot_id: snapshot.id, market_update_id: marketUpdateId,
  });
  await auditSync(supabase, warnings, "source_sync", {
    source_id: SOURCE_ID,
    url: source.url,
    http_status: fetched.status,
    content_hash: contentHash,
    changed,
    first_snapshot: firstSnapshot,
    snapshot_id: snapshot.id,
    market_update_id: marketUpdateId,
  });

  return Response.json({
    ok: true,
    result_status: "pre_feasibility",
    source: { id: SOURCE_ID, name: source.source_name, url: source.url, verification_status: "verified_official" },
    snapshot: {
      id: snapshot.id,
      fetched_at: snapshot.fetched_at,
      http_status: fetched.status,
      content_type: fetched.contentType,
      bytes: fetched.bytes.length,
      content_hash: contentHash,
      title: extracted.title,
      extraction_note: extracted.extraction_note,
    },
    changed,
    first_snapshot: firstSnapshot,
    market_update_id: marketUpdateId, // null when content unchanged
    market_update: marketUpdateRow, // the pending row created (never auto-applied)
    assumptions_changed: false, // ALWAYS false here — approval is a separate human act
    strategy_rerun: false, // ALWAYS false here
    warnings,
  });
}

// ---- helpers -------------------------------------------------------------
type Sb = ReturnType<typeof getSupabaseAdmin>;

async function recordSyncRun(
  supabase: Sb,
  warnings: string[],
  run: {
    source_id: string; started_at: string; status: string;
    http_status?: number | null; content_hash?: string; changed?: boolean;
    snapshot_id?: string; market_update_id?: string | null; error?: string;
  },
): Promise<void> {
  const { error } = await supabase.from("sync_runs").insert({
    source_id: run.source_id,
    started_at: run.started_at,
    finished_at: new Date().toISOString(),
    status: run.status,
    http_status: run.http_status ?? null,
    content_hash: run.content_hash ?? null,
    changed: run.changed ?? null,
    snapshot_id: run.snapshot_id ?? null,
    market_update_id: run.market_update_id ?? null,
    error: run.error ?? null,
  });
  if (error) {
    if (/sync_runs/.test(error.message) || /schema cache/.test(error.message)) {
      warnings.push("sync_runs not recorded — table missing; run supabase/migrations/0007_sync_runs.sql.");
    } else {
      warnings.push(`sync_runs insert failed: ${error.message}`);
    }
  }
}

async function auditSync(supabase: Sb, warnings: string[], action: string, details: object): Promise<void> {
  const { error } = await supabase.from("audit_logs").insert({
    actor: "source-monitor",
    action,
    entity_type: "source_sync",
    entity_id: SOURCE_ID,
    details,
  });
  if (error) warnings.push(`audit_logs insert failed: ${error.message}`);
}
