// POST /api/scenarios/save — persist one deterministic analysis run into scenario_results.
//
// The table is append-only (updates are rejected by trigger), so every run inserts
// fresh rows keyed by a unique run_id: `${client_id}:${run_id}`. Numbers arrive
// pre-computed from the deterministic engine — this route stores, it never calculates,
// and no LLM is involved anywhere. Results are labeled result_status = 'pre_feasibility'.

import { getSupabaseAdmin, supabaseAdminConfigured } from "@/lib/supabase/admin";
import type { ScenarioResult } from "@/lib/types";

interface SaveBody {
  project_id: string;
  assumption_set_version: string; // 'v0.1' | 'v0.2'
  results: ScenarioResult[];
}

export async function POST(request: Request) {
  const config = supabaseAdminConfigured();
  if (!config.ok) {
    return Response.json(
      { ok: false, status: "not_configured", error: `Missing environment variables: ${config.missing.join(", ")}` },
      { status: 503 },
    );
  }

  let body: SaveBody;
  try {
    body = (await request.json()) as SaveBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body?.project_id || !Array.isArray(body.results) || body.results.length === 0) {
    return Response.json({ ok: false, error: "project_id and non-empty results are required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Results can only reference a persisted project (FK). Local-only studies skip saving.
  const project = await supabase.from("projects").select("id").eq("id", body.project_id).maybeSingle();
  if (project.error) {
    return Response.json({ ok: false, error: project.error.message }, { status: 500 });
  }
  if (!project.data) {
    return Response.json(
      { ok: false, status: "project_not_persisted", error: `Project ${body.project_id} is not saved in Supabase — results kept local.` },
      { status: 409 },
    );
  }

  const runId = new Date().toISOString();

  // Persist only scenarios that are active model outputs for this study — locked
  // frameworks (e.g. CRESS shown as a Malaysia example on non-Malaysia studies)
  // are illustrations, not results, and must not be stored as results.
  const rows = body.results
    .filter((r) => r.available)
    .map((r) => ({
      id: `${r.id}:${runId}`,
      project_id: body.project_id,
      scenario_key: r.scenario_key,
      assumption_set_version: body.assumption_set_version,
      annual_cost: r.annual_cost,
      annual_savings: r.annual_savings,
      renewable_share: r.renewable_share,
      carbon_reduction: r.carbon_reduction,
      capex: r.capex,
      payback: r.payback,
      complexity: r.complexity,
      grid_impact: r.grid_impact,
      confidence: r.confidence,
      calculation_trace: r.calculation_trace, // required non-empty by DB check
      assumption_version_ids: r.assumption_version_ids,
      result_status: "pre_feasibility",
      run_id: runId,
    }));

  const { error } = await supabase.from("scenario_results").insert(rows);
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  // ids are returned so memos can record exactly which result rows they used
  return Response.json({ ok: true, saved: rows.length, run_id: runId, result_ids: rows.map((r) => r.id) });
}
