// POST /api/market-updates/[id]/ignore — persist an "ignore for now" decision.
//
// Records the human decision (market_updates status + human_reviews row; audit_logs
// via trigger) and deliberately creates NO assumption_versions row — an ignored
// update never touches the model. Idempotent if already ignored.

import { getSupabaseAdmin, supabaseAdminConfigured } from "@/lib/supabase/admin";

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
  let reviewer = "Demo Reviewer";
  try {
    const body = (await request.json()) as { reviewer?: string };
    if (body?.reviewer?.trim()) reviewer = body.reviewer.trim();
  } catch {
    /* empty body is fine */
  }
  const warnings: string[] = [];
  const supabase = getSupabaseAdmin();

  const updateRes = await supabase.from("market_updates").select("id, human_review_status").eq("id", id).maybeSingle();
  if (updateRes.error) return Response.json({ ok: false, error: updateRes.error.message }, { status: 500 });
  if (!updateRes.data) return Response.json({ ok: false, error: `Market update ${id} not found` }, { status: 404 });

  const current = (updateRes.data as { human_review_status: string }).human_review_status;
  if (current === "ignored") {
    return Response.json({ ok: true, already_ignored: true, market_update_status: "ignored", warnings: [] });
  }
  if (current === "approved" || current === "approved_demo") {
    return Response.json(
      { ok: false, error: "Update is already approved — an approved update cannot be ignored." },
      { status: 409 },
    );
  }

  // Mark ignored (legacy retry pre-migration-0006: 'rejected' is the closest original status).
  let status = "ignored";
  let statusRes = await supabase
    .from("market_updates")
    .update({ human_review_status: "ignored", reviewed_by: reviewer, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (statusRes.error && /human_review_status/.test(statusRes.error.message)) {
    status = "rejected";
    statusRes = await supabase
      .from("market_updates")
      .update({ human_review_status: "rejected", reviewed_by: reviewer, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    warnings.push("Recorded as 'rejected' — run supabase/APPLY_PENDING.sql (0006) to enable the 'ignored' label.");
  }
  if (statusRes.error) return Response.json({ ok: false, error: statusRes.error.message }, { status: 500 });

  // Review trail (audit_logs written by trigger). No assumption_versions row — by design.
  let decision = "ignored";
  let reviewRes = await supabase.from("human_reviews").insert({
    review_type: "market_update",
    target_id: id,
    decision: "ignored",
    reviewer_name: reviewer,
    note: "Update ignored for now — no assumption version created; model unchanged.",
  }).select("id").single();
  if (reviewRes.error && /decision/.test(reviewRes.error.message)) {
    decision = "needs_changes";
    reviewRes = await supabase.from("human_reviews").insert({
      review_type: "market_update",
      target_id: id,
      decision: "needs_changes",
      reviewer_name: reviewer,
      note: "Update ignored for now (legacy decision label) — no assumption version created; model unchanged.",
    }).select("id").single();
  }
  if (reviewRes.error) warnings.push(`human_reviews insert failed: ${reviewRes.error.message}`);

  return Response.json({
    ok: true,
    market_update_status: status,
    human_review: { id: reviewRes.data?.id ?? null, decision, reviewer },
    assumption_version: null, // deliberately none
    warnings,
  });
}
