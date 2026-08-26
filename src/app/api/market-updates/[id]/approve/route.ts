// POST /api/market-updates/[id]/approve — persist a human approval of a market update.
//
// Body (optional): { reviewer?: string, assumption_key?: string }
//
// Flow (all database-backed; audit_logs rows are written automatically by the
// schema's write_audit triggers on market_updates / assumption_versions / human_reviews):
//   1. Load the update; idempotent if already approved.
//   2. TRUST GATE: its source must be verification_status = 'verified_official' and
//      active in source_registry — internal_demo / pending / unverified sources can
//      never create official assumption versions.
//   3. Find (or create) the successor assumption_versions row carrying the update's
//      after_value, linked via created_from_market_update and the verified source_id.
//   4. Deactivate the currently-active version for that key, then activate the
//      successor (order matters: one-active-per-key unique index). The database's
//      active_requires_approval constraint guarantees only approved rows activate.
//   5. Mark the update approved_demo (legacy retry: 'approved' pre-migration-0006)
//      and insert the human_reviews row.
//
// Pending updates never touch calculations — the engine only reads ACTIVE rows, and
// activation only happens here, after the human click. Pre-feasibility only.

import { getSupabaseAdmin, supabaseAdminConfigured } from "@/lib/supabase/admin";

interface ApproveBody {
  reviewer?: string;
  assumption_key?: string; // fallback when migration 0006 (affects_assumption) is pending
}

interface UpdateRow {
  id: string;
  source_id: string;
  country: string;
  after_value: number | string | null;
  unit: string | null;
  update_date: string | null;
  affected_scenarios: string[];
  human_review_status: string;
  affects_assumption?: string | null;
}

interface VersionRow {
  id: string;
  assumption_key: string;
  version: string;
  value: number | string | null;
  human_review_status: string;
  active: boolean;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const config = supabaseAdminConfigured();
  if (!config.ok) {
    return Response.json(
      { ok: false, status: "not_configured", error: `Missing environment variables: ${config.missing.join(", ")}` },
      { status: 503 },
    );
  }

  const { id } = await params;
  let body: ApproveBody = {};
  try {
    body = (await request.json()) as ApproveBody;
  } catch {
    /* empty body is fine */
  }
  const reviewer = body.reviewer?.trim() || "Demo Reviewer";
  const warnings: string[] = [];
  const supabase = getSupabaseAdmin();

  // 1. Load the update
  const updateRes = await supabase.from("market_updates").select("*").eq("id", id).maybeSingle();
  if (updateRes.error) return Response.json({ ok: false, error: updateRes.error.message }, { status: 500 });
  if (!updateRes.data) return Response.json({ ok: false, error: `Market update ${id} not found` }, { status: 404 });
  const update = updateRes.data as UpdateRow;

  // Idempotent: already approved → report current state, write nothing.
  if (update.human_review_status === "approved" || update.human_review_status === "approved_demo") {
    return Response.json({
      ok: true,
      already_approved: true,
      market_update_status: update.human_review_status,
      warnings: ["Update was already approved — no new rows written."],
    });
  }

  // 2. TRUST GATE — verified official sources only.
  const sourceRes = await supabase
    .from("source_registry")
    .select("id, verification_status, active, source_name")
    .eq("id", update.source_id)
    .maybeSingle();
  if (sourceRes.error) return Response.json({ ok: false, error: sourceRes.error.message }, { status: 500 });
  const source = sourceRes.data as { verification_status: string | null; active: boolean; source_name: string } | null;
  if (!source || source.verification_status !== "verified_official" || source.active === false) {
    return Response.json(
      {
        ok: false,
        status: "source_not_verified",
        error: `Blocked: source ${update.source_id} is ${source?.verification_status ?? "unregistered"} — only verified_official sources can create assumption versions.`,
      },
      { status: 403 },
    );
  }

  // 3a. Detection-only updates (no extracted after_value — e.g. live sync content
  // changes) are acknowledged WITHOUT touching assumption_versions: code never
  // invents a number, so there is nothing to version. The value change, if any,
  // must arrive as its own reviewed update.
  if (update.after_value === null || update.after_value === undefined) {
    let ackStatus = "approved_demo";
    let ackRes = await supabase
      .from("market_updates")
      .update({ human_review_status: "approved_demo", reviewed_by: reviewer, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (ackRes.error && /human_review_status/.test(ackRes.error.message)) {
      ackStatus = "approved";
      ackRes = await supabase
        .from("market_updates")
        .update({ human_review_status: "approved", reviewed_by: reviewer, reviewed_at: new Date().toISOString() })
        .eq("id", id);
      warnings.push("Recorded as 'approved' — run supabase/APPLY_PENDING.sql (0006) to enable the 'approved_demo' label.");
    }
    if (ackRes.error) return Response.json({ ok: false, error: ackRes.error.message }, { status: 500 });

    let ackReview = await supabase.from("human_reviews").insert({
      review_type: "market_update",
      target_id: id,
      decision: "approved_demo",
      reviewer_name: reviewer,
      note: "Acknowledged detection (no numeric value in the update) — NO assumption version created or changed.",
    }).select("id").single();
    if (ackReview.error && /decision/.test(ackReview.error.message)) {
      ackReview = await supabase.from("human_reviews").insert({
        review_type: "market_update",
        target_id: id,
        decision: "approved",
        reviewer_name: reviewer,
        note: "Acknowledged detection (no numeric value in the update) — NO assumption version created or changed.",
      }).select("id").single();
    }
    if (ackReview.error) warnings.push(`human_reviews insert failed: ${ackReview.error.message}`);

    return Response.json({
      ok: true,
      market_update_status: ackStatus,
      human_review: { id: ackReview.data?.id ?? null, decision: "approved_demo", reviewer },
      assumption_version: null, // detection-only: nothing to version
      result_status: "pre_feasibility",
      warnings,
    });
  }

  // 3. Resolve the assumption this update versions.
  const assumptionKey = update.affects_assumption ?? body.assumption_key;
  if (!assumptionKey) {
    return Response.json(
      { ok: false, error: "No affects_assumption on the update (run migration 0006) and no assumption_key in the body." },
      { status: 400 },
    );
  }

  const versionsRes = await supabase
    .from("assumption_versions")
    .select("id, assumption_key, version, value, human_review_status, active")
    .eq("country", update.country)
    .eq("assumption_key", assumptionKey);
  if (versionsRes.error) return Response.json({ ok: false, error: versionsRes.error.message }, { status: 500 });
  const versions = (versionsRes.data as VersionRow[]) ?? [];
  const currentActive = versions.find((v) => v.active) ?? null;

  // Reuse an approved successor row carrying the update's value (the seeded demo
  // case: ASM-CRESS-SAC@0.2); otherwise create a new version.
  let target = versions.find(
    (v) => Number(v.value) === Number(update.after_value) && v.human_review_status === "approved" && !v.active,
  );

  let created = false;
  if (!target) {
    const nextVersion = (
      Math.max(0, ...versions.map((v) => Number.parseFloat(v.version) || 0)) + 0.1
    ).toFixed(1);
    const newRow = {
      id: `${assumptionKey}@${nextVersion}`,
      country: update.country,
      assumption_key: assumptionKey,
      version: nextVersion,
      label: `${assumptionKey} (approved from market update)`,
      value: update.after_value,
      unit: update.unit ?? "",
      source_id: update.source_id,
      effective_date: update.update_date ?? new Date().toISOString().slice(0, 10),
      confidence: "medium",
      human_review_status: "approved",
      active: false, // activated below, after the old version is deactivated
      affected_models: update.affected_scenarios ?? [],
      provisional: false,
      caveat:
        "Demo/pre-feasibility figure approved from a verified official source monitor. Not an official published rate.",
      reviewed_by: reviewer,
      created_from_market_update: update.id,
    };
    const insertRes = await supabase
      .from("assumption_versions")
      .insert(newRow)
      .select("id, assumption_key, version, value, human_review_status, active")
      .single();
    if (insertRes.error) return Response.json({ ok: false, error: insertRes.error.message }, { status: 500 });
    target = insertRes.data as VersionRow;
    created = true;
  }

  // 4. Flip activation: deactivate old first (one-active-per-key index), then activate.
  if (currentActive && currentActive.id !== target.id) {
    const deact = await supabase.from("assumption_versions").update({ active: false }).eq("id", currentActive.id);
    if (deact.error) return Response.json({ ok: false, error: deact.error.message }, { status: 500 });
  }
  const act = await supabase
    .from("assumption_versions")
    .update({ active: true, reviewed_by: reviewer })
    .eq("id", target.id);
  if (act.error) {
    // best-effort rollback so the key is never left with no active version
    if (currentActive) await supabase.from("assumption_versions").update({ active: true }).eq("id", currentActive.id);
    return Response.json({ ok: false, error: act.error.message }, { status: 500 });
  }

  // 5. Mark the update approved (approved_demo; legacy retry pre-migration-0006).
  let updateStatus = "approved_demo";
  let statusRes = await supabase
    .from("market_updates")
    .update({ human_review_status: "approved_demo", reviewed_by: reviewer, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (statusRes.error && /human_review_status/.test(statusRes.error.message)) {
    updateStatus = "approved";
    statusRes = await supabase
      .from("market_updates")
      .update({ human_review_status: "approved", reviewed_by: reviewer, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    warnings.push("Recorded as 'approved' — run supabase/APPLY_PENDING.sql (0006) to enable the 'approved_demo' label.");
  }
  if (statusRes.error) return Response.json({ ok: false, error: statusRes.error.message }, { status: 500 });

  // Human review trail (audit_logs row is written automatically by trigger).
  let decision = "approved_demo";
  let reviewRes = await supabase.from("human_reviews").insert({
    review_type: "market_update",
    target_id: id,
    decision: "approved_demo",
    reviewer_name: reviewer,
    note: `Approved ${assumptionKey}: ${target.id} activated${currentActive ? ` (deactivated ${currentActive.id})` : ""}. Demo approval — not a real sign-off.`,
  }).select("id").single();
  if (reviewRes.error && /decision/.test(reviewRes.error.message)) {
    decision = "approved";
    reviewRes = await supabase.from("human_reviews").insert({
      review_type: "market_update",
      target_id: id,
      decision: "approved",
      reviewer_name: reviewer,
      note: `Approved ${assumptionKey}: ${target.id} activated. Demo approval — not a real sign-off.`,
    }).select("id").single();
  }
  if (reviewRes.error) {
    warnings.push(`human_reviews insert failed: ${reviewRes.error.message}`);
  }

  return Response.json({
    ok: true,
    market_update_status: updateStatus,
    human_review: { id: reviewRes.data?.id ?? null, decision, reviewer },
    assumption_version: {
      id: target.id,
      version: target.version,
      active: true,
      created,
      deactivated: currentActive && currentActive.id !== target.id ? currentActive.id : null,
    },
    result_status: "pre_feasibility",
    warnings,
  });
}
