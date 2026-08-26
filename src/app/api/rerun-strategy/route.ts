// POST /api/rerun-strategy — database-backed strategy rerun after an approved update.
//
// Body: { study: StudyProject, settings?: RefinementSettings }
//
// One server-side chain, deterministic end to end (no LLM anywhere):
//   1. Load the ACTIVE approved assumption set from assumption_versions ("active"
//      mode — after a persisted approval the DB active flags are the truth).
//   2. Run the Study Analysis Agent.
//   3. Save a new scenario_results run (pre_feasibility, calculation_trace and
//      assumption_version_ids on every row).
//   4. Insert an explicit audit_logs event for the rerun.
//   5. Save a refreshed memo_versions DRAFT linked to the new result rows —
//      always pending_review; approval remains a separate human act.
//
// Nothing here runs before human approval: the active set only changes through
// the approve route, and this endpoint is invoked by an explicit user click.

import { getSupabaseAdmin, supabaseAdminConfigured } from "@/lib/supabase/admin";
import { saveMemoDraft, saveScenarioRun } from "@/lib/supabase/persist";
import { loadActiveAssumptions } from "@/lib/energy/loadActiveAssumptions";
import { analyzeStudy, StudyValidationError } from "@/lib/energy/analyzeStudy";
import { loadDemoData } from "@/lib/data";
import { adaptMarketUpdate, buildMemoSections } from "@/lib/study";
import type { RefinementSettings, StudyProject } from "@/lib/types";

interface RerunBody {
  study: StudyProject;
  settings?: RefinementSettings;
}

export async function POST(request: Request) {
  const config = supabaseAdminConfigured();
  if (!config.ok) {
    return Response.json(
      { ok: false, status: "not_configured", error: `Missing environment variables: ${config.missing.join(", ")}` },
      { status: 503 },
    );
  }

  let body: RerunBody;
  try {
    body = (await request.json()) as RerunBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body?.study) return Response.json({ ok: false, error: "study is required" }, { status: 400 });

  const warnings: string[] = [];
  const supabase = getSupabaseAdmin();

  // 1. ACTIVE approved assumptions — the database's post-approval truth.
  const loaded = await loadActiveAssumptions("Malaysia", "active");
  warnings.push(...loaded.warnings);

  // 2. Deterministic engine.
  let output;
  try {
    output = analyzeStudy(body.study, loaded.set, body.settings);
  } catch (e) {
    if (e instanceof StudyValidationError) {
      return Response.json({ ok: false, status: "invalid_study", problems: e.problems }, { status: 400 });
    }
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  warnings.push(...output.warnings);
  const setVersion = `v${loaded.set.meta.version}`;

  // 3. Persist the run.
  const save = await saveScenarioRun(supabase, body.study.id, setVersion, output.scenarios);
  if (save.warning) warnings.push(save.warning);

  // 4. Explicit audit event for the rerun (append-only; actor recorded).
  if (save.run_id) {
    const audit = await supabase.from("audit_logs").insert({
      actor: "Demo Reviewer",
      action: "rerun_strategy",
      entity_type: "scenario_run",
      entity_id: save.run_id,
      details: {
        project_id: body.study.id,
        assumption_set_version: setVersion,
        assumption_source: loaded.source,
        result_count: save.ids.length,
        trigger: "post_approval_rerun",
      },
    });
    if (audit.error) warnings.push(`audit_logs insert failed: ${audit.error.message}`);
  }

  // 5. Refreshed memo DRAFT linked to the new rows (always pending_review).
  const demo = loadDemoData();
  const muStatus = await supabase
    .from("market_updates")
    .select("id, human_review_status")
    .eq("id", demo.marketUpdate.id)
    .maybeSingle();
  const updateApproved = ["approved", "approved_demo"].includes(
    (muStatus.data as { human_review_status?: string } | null)?.human_review_status ?? "",
  );
  const marketUpdate = adaptMarketUpdate(demo.marketUpdate, body.study, output.input, updateApproved, demo.sources);
  const sections = buildMemoSections(body.study, output.input, output.scenarios, output.recommendation, marketUpdate);

  let memo = null;
  if (save.ids.length > 0) {
    const memoRes = await saveMemoDraft(supabase, {
      project_id: body.study.id,
      content: sections,
      scenario_result_ids: save.ids,
      market_update_ids: marketUpdate.applies_to_study ? [marketUpdate.id] : [],
      assumption_version_ids: [...new Set(output.scenarios.flatMap((s) => s.assumption_version_ids))],
      assumption_set_version: setVersion,
    });
    if (memoRes.warning) warnings.push(memoRes.warning);
    memo = memoRes.id
      ? {
          id: memoRes.id,
          version: memoRes.version,
          memo_type: "cfo" as const,
          content: sections,
          scenario_result_ids: save.ids,
          market_update_ids: marketUpdate.applies_to_study ? [marketUpdate.id] : [],
          assumption_version_ids: [...new Set(output.scenarios.flatMap((s) => s.assumption_version_ids))],
          human_review_status: "pending_review" as const,
          approved_at: null,
          created_at: new Date().toISOString(),
          assumption_set_version: setVersion,
          persisted: true,
        }
      : null;
  } else {
    warnings.push("Memo draft not created — no persisted scenario rows to link (local-mode study?).");
  }

  return Response.json({
    ok: true,
    result_status: "pre_feasibility",
    assumption_source: loaded.source,
    assumption_set_version: setVersion,
    scenarios: output.scenarios,
    recommendation: output.recommendation,
    settings: output.settings,
    persisted_result_ids: save.ids,
    run_id: save.run_id,
    memo,
    warnings,
  });
}
