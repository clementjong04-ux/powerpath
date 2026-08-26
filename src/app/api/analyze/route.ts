// POST /api/analyze — the Study Analysis Agent endpoint.
//
// Body: { study: StudyProject, assumption_version: "0.1" | "0.2", settings?: RefinementSettings }
//
// Pipeline: validate -> normalize -> country module -> baseline -> 5 scenarios (each
// with calculation_trace) -> objective ranking -> persist to scenario_results ->
// return UI-ready results. Deterministic only — no LLM, no live APIs, no official
// tariff or grid-approval claims; everything is labeled pre_feasibility.
//
// Persistence is resilient: if the study isn't saved in Supabase (local mode) the
// analysis still returns; if the 0003 migration (result_status/run_id columns) hasn't
// been applied yet, it retries a legacy-shape insert and reports a warning.

import { getSupabaseAdmin, supabaseAdminConfigured } from "@/lib/supabase/admin";
import { saveScenarioRun } from "@/lib/supabase/persist";
import { loadActiveAssumptions } from "@/lib/energy/loadActiveAssumptions";
import { analyzeStudy, StudyValidationError } from "@/lib/energy/analyzeStudy";
import type { RefinementSettings, StudyProject } from "@/lib/types";

interface AnalyzeBody {
  study: StudyProject;
  assumption_version: string; // '0.1' | '0.2'
  settings?: RefinementSettings;
}

export async function POST(request: Request) {
  let body: AnalyzeBody;
  try {
    body = (await request.json()) as AnalyzeBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body?.study || !body.assumption_version) {
    return Response.json({ ok: false, error: "study and assumption_version are required" }, { status: 400 });
  }

  // ---- assumptions: active approved set from Supabase, YAML fallback ----
  // (The demo assumption modules are Malaysia's; non-Malaysia studies run the
  // limited module against the same set, clearly warned by loadCountryModule.)
  let loaded;
  try {
    loaded = await loadActiveAssumptions("Malaysia", body.assumption_version);
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
  const assumptions = loaded.set;

  // ---- deterministic analysis ----
  let output;
  try {
    output = analyzeStudy(body.study, assumptions, body.settings);
  } catch (e) {
    if (e instanceof StudyValidationError) {
      return Response.json({ ok: false, status: "invalid_study", problems: e.problems }, { status: 400 });
    }
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  // ---- persistence (best-effort; analysis result is returned regardless) ----
  const warnings = [...loaded.warnings, ...output.warnings];
  let persisted_result_ids: string[] = [];
  let run_id: string | null = null;

  const config = supabaseAdminConfigured();
  if (config.ok && body.study.persisted) {
    const save = await saveScenarioRun(getSupabaseAdmin(), body.study.id, `v${body.assumption_version}`, output.scenarios);
    persisted_result_ids = save.ids;
    run_id = save.run_id;
    if (save.warning) warnings.push(save.warning);
  } else if (!config.ok) {
    warnings.push("Results not persisted — Supabase is not configured (local mode).");
  } else {
    warnings.push("Results not persisted — this study is not saved in Supabase (local mode).");
  }

  return Response.json({
    ok: true,
    scenarios: output.scenarios,
    recommendation: output.recommendation,
    settings: output.settings,
    input: output.input,
    module: output.module,
    warnings,
    persisted_result_ids,
    run_id,
    result_status: "pre_feasibility",
    assumption_source: loaded.source, // "supabase" | "yaml_fallback"
  });
}
