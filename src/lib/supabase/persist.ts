// Shared server-side persistence for deterministic outputs.
//
// Used by /api/analyze and /api/rerun-strategy so both save runs identically:
//  * scenario_results rows are append-only immutable snapshots keyed by run_id,
//    labeled pre_feasibility, each carrying its calculation_trace (required
//    non-empty by the DB) and the exact assumption_version_ids used.
//  * memo drafts are versioned server-side (max+1 per project) and always land
//    as pending_review — approval is a separate human act.
// Legacy retries keep everything working until APPLY_PENDING.sql is run.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemoSection, ScenarioResult } from "@/lib/types";

export interface SaveRunResult {
  ids: string[];
  run_id: string | null;
  warning?: string;
}

export async function saveScenarioRun(
  supabase: SupabaseClient,
  projectId: string,
  assumptionSetVersion: string,
  scenarios: ScenarioResult[],
): Promise<SaveRunResult> {
  const project = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle();
  if (project.error || !project.data) {
    return { ids: [], run_id: null, warning: `Results not persisted — project ${projectId} not found in Supabase.` };
  }

  const runId = new Date().toISOString();
  // Only active model outputs are stored — locked frameworks (e.g. CRESS on
  // non-Malaysia studies) are illustrations, not results.
  const baseRows = scenarios
    .filter((r) => r.available)
    .map((r) => ({
      id: `${r.id}:${runId}`,
      project_id: projectId,
      scenario_key: r.scenario_key,
      assumption_set_version: assumptionSetVersion,
      annual_cost: r.annual_cost,
      annual_savings: r.annual_savings,
      renewable_share: r.renewable_share,
      carbon_reduction: r.carbon_reduction,
      capex: r.capex,
      payback: r.payback,
      complexity: r.complexity,
      grid_impact: r.grid_impact,
      confidence: r.confidence,
      calculation_trace: r.calculation_trace,
      assumption_version_ids: r.assumption_version_ids,
    }));

  // Preferred shape (after migration 0003): explicit pre_feasibility label + run_id.
  const full = await supabase
    .from("scenario_results")
    .insert(baseRows.map((r) => ({ ...r, result_status: "pre_feasibility", run_id: runId })));
  if (!full.error) {
    return { ids: baseRows.map((r) => r.id), run_id: runId };
  }

  // Legacy retry: migration 0003 not applied yet (row ids stay unique via runId suffix).
  if (/result_status|run_id/.test(full.error.message)) {
    const legacy = await supabase.from("scenario_results").insert(baseRows);
    if (!legacy.error) {
      return {
        ids: baseRows.map((r) => r.id),
        run_id: runId,
        warning:
          "Results saved without result_status/run_id — run supabase/APPLY_PENDING.sql to complete migration 0003.",
      };
    }
    return { ids: [], run_id: null, warning: `Results not persisted — ${legacy.error.message}` };
  }

  return { ids: [], run_id: null, warning: `Results not persisted — ${full.error.message}` };
}

export interface SaveMemoDraftParams {
  project_id: string;
  content: MemoSection[];
  scenario_result_ids: string[];
  market_update_ids: string[];
  assumption_version_ids: string[];
  assumption_set_version: string;
}

export interface SaveMemoDraftResult {
  id: string | null;
  version: number | null;
  human_review_status: "pending_review";
  warning?: string;
}

export async function saveMemoDraft(
  supabase: SupabaseClient,
  params: SaveMemoDraftParams,
): Promise<SaveMemoDraftResult> {
  const latest = await supabase
    .from("memo_versions")
    .select("version")
    .eq("project_id", params.project_id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) {
    return { id: null, version: null, human_review_status: "pending_review", warning: latest.error.message };
  }
  const version = ((latest.data as { version: number } | null)?.version ?? 0) + 1;

  const base = {
    project_id: params.project_id,
    version,
    memo_type: "cfo",
    content: params.content,
    market_update_ids: params.market_update_ids,
    assumption_version_ids: params.assumption_version_ids,
    assumption_set_version: params.assumption_set_version,
    human_review_status: "pending_review",
    approved_by: null,
    approved_at: null,
  };

  // Preferred shape (after migration 0004): scenario result links.
  let res = await supabase
    .from("memo_versions")
    .insert({ ...base, scenario_result_ids: params.scenario_result_ids })
    .select("id")
    .single();
  let warning: string | undefined;
  if (res.error && /scenario_result_ids/.test(res.error.message)) {
    res = await supabase.from("memo_versions").insert(base).select("id").single();
    warning =
      "Memo draft saved without scenario_result_ids — run supabase/APPLY_PENDING.sql to complete migration 0004.";
  }
  if (res.error) {
    return { id: null, version: null, human_review_status: "pending_review", warning: res.error.message };
  }

  return {
    id: (res.data as { id: string }).id,
    version,
    human_review_status: "pending_review",
    warning,
  };
}
