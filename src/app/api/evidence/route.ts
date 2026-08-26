// GET /api/evidence?source_id=SRC-CRESS-SAC&assumption_key=ASM-CRESS-SAC&project_id=study-johor-sample
//
// Assembles the full live evidence chain for the Evidence Drawer:
//   source_registry → source_snapshot → market_update (+ human_review)
//   → assumption_version → scenario_result → memo_version
//
// Read-only. This is the product's answer to "how do you prevent hallucination
// and wrong tariff assumptions": every stage is a database row a human can audit,
// and every number traces back through this chain. Missing stages return null —
// the UI says "not yet recorded" instead of inventing anything.

import { getSupabaseAdmin, supabaseAdminConfigured } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const config = supabaseAdminConfigured();
  if (!config.ok) {
    return Response.json({ ok: false, status: "not_configured", error: "Supabase not configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  let sourceId = url.searchParams.get("source_id");
  const assumptionKey = url.searchParams.get("assumption_key");
  const projectId = url.searchParams.get("project_id") ?? "study-johor-sample";
  if (!sourceId && !assumptionKey) {
    return Response.json({ ok: false, error: "source_id or assumption_key is required" }, { status: 400 });
  }

  const warnings: string[] = [];
  const supabase = getSupabaseAdmin();

  // Assumption versions first — they also resolve the source when only a key is given.
  let versionsQuery = supabase
    .from("assumption_versions")
    .select("id, assumption_key, version, value, unit, active, confidence, human_review_status, reviewed_by, source_id, created_from_market_update")
    .eq("country", "Malaysia")
    .order("version", { ascending: true });
  versionsQuery = assumptionKey ? versionsQuery.eq("assumption_key", assumptionKey) : versionsQuery.eq("source_id", sourceId);
  const versionsRes = await versionsQuery;
  if (versionsRes.error) warnings.push(`assumption_versions: ${versionsRes.error.message}`);
  const assumption_versions = versionsRes.data ?? [];
  if (!sourceId) {
    sourceId = (assumption_versions.find((v) => v.active)?.source_id ?? assumption_versions[0]?.source_id ?? null) as string | null;
  }

  const [sourceRes, snapshotRes, updatesRes, resultsRes, memoRes] = await Promise.all([
    sourceId
      ? supabase
          .from("source_registry")
          .select("id, source_name, authority, url, source_domain, official_status, verification_status, verified_at, evidence_note, active")
          .eq("id", sourceId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sourceId
      ? supabase
          .from("source_snapshots")
          .select("id, fetched_at, content_hash, http_status, raw_content")
          .eq("source_id", sourceId)
          .order("fetched_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sourceId
      ? supabase
          .from("market_updates")
          .select("id, title, detected_at, human_review_status, affected_scenarios, reviewed_by")
          .eq("source_id", sourceId)
          .order("detected_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("scenario_results")
      .select("id, scenario_key, assumption_set_version, assumption_version_ids, calculation_trace, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("memo_versions")
      .select("id, version, market_update_ids, assumption_version_ids, human_review_status, created_at")
      .eq("project_id", projectId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  for (const [label, r] of [
    ["source_registry", sourceRes],
    ["source_snapshots", snapshotRes],
    ["market_updates", updatesRes],
    ["scenario_results", resultsRes],
    ["memo_versions", memoRes],
  ] as const) {
    if (r.error) warnings.push(`${label}: ${r.error.message}`);
  }

  // Human reviews for the listed updates (the approval trail).
  const updates = updatesRes.data ?? [];
  let human_reviews: unknown[] = [];
  if (updates.length > 0) {
    const reviewsRes = await supabase
      .from("human_reviews")
      .select("id, review_type, target_id, decision, reviewer_name, note, reviewed_at")
      .eq("review_type", "market_update")
      .in("target_id", updates.map((u) => u.id))
      .order("reviewed_at", { ascending: false });
    if (reviewsRes.error) warnings.push(`human_reviews: ${reviewsRes.error.message}`);
    human_reviews = reviewsRes.data ?? [];
  }

  // Snapshot excerpt lives in raw_content; trim for the drawer.
  const snap = snapshotRes.data as
    | { id: string; fetched_at: string; content_hash: string | null; http_status: number | null; raw_content: { title?: string; excerpt?: string; extraction_note?: string; content_type?: string } | null }
    | null;
  const snapshot = snap
    ? {
        id: snap.id,
        checked_at: snap.fetched_at,
        content_hash: snap.content_hash,
        http_status: snap.http_status,
        title: snap.raw_content?.title ?? null,
        excerpt: snap.raw_content?.excerpt ? snap.raw_content.excerpt.slice(0, 400) : null,
        extraction_note: snap.raw_content?.extraction_note ?? null,
      }
    : null;

  // The latest persisted run (rows share a created_at batch); trace trimmed to
  // labels+details — the numbers themselves stay in the deterministic engine.
  const scenario_results = (resultsRes.data ?? []).map((r) => ({
    id: r.id,
    scenario_key: r.scenario_key,
    assumption_set_version: r.assumption_set_version,
    assumption_version_ids: r.assumption_version_ids,
    calculation_trace: r.calculation_trace,
    created_at: r.created_at,
  }));

  return Response.json({
    ok: true,
    trail: {
      source: sourceRes.data ?? null,
      snapshot,
      market_updates: updates,
      human_reviews,
      assumption_versions,
      scenario_results,
      memo_version: memoRes.data ?? null,
    },
    warnings,
  });
}
