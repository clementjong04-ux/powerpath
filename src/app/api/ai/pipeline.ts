// Shared deterministic pipeline for the AI routes (server-only, not a route file).
//
// SEQUENCE MATTERS: the deterministic engine runs FIRST and produces every number;
// the AI layer only receives its output. Nothing here calculates in the AI.

import { loadDemoData } from "@/lib/data";
import { loadActiveAssumptions } from "@/lib/energy/loadActiveAssumptions";
import { analyzeStudy, StudyValidationError } from "@/lib/energy/analyzeStudy";
import { provenanceOf } from "@/lib/energy/createCalculationTrace";
import { adaptMarketUpdate } from "@/lib/study";
import { buildExplainPayload, type ExplainPayload } from "@/lib/ai/explainScenarioResults";
import type {
  MarketUpdateRecord,
  Recommendation,
  RefinementSettings,
  ScenarioResult,
  StudyInput,
  StudyProject,
} from "@/lib/types";

export interface AiRouteBody {
  study: StudyProject;
  assumption_version?: string; // '0.1' | '0.2' (default '0.1')
  settings?: RefinementSettings;
}

export interface PipelineOutput {
  study: StudyProject;
  input: StudyInput;
  scenarios: ScenarioResult[];
  recommendation: Recommendation;
  marketUpdate: MarketUpdateRecord;
  payload: ExplainPayload;
  warnings: string[];
}

export async function runDeterministicPipeline(body: AiRouteBody): Promise<
  | { ok: true; out: PipelineOutput }
  | { ok: false; status: number; error: string; problems?: string[] }
> {
  if (!body?.study) {
    return { ok: false, status: 400, error: "study is required" };
  }
  const version = body.assumption_version ?? "0.1";

  const loaded = await loadActiveAssumptions("Malaysia", version);

  let analysis;
  try {
    analysis = analyzeStudy(body.study, loaded.set, body.settings);
  } catch (e) {
    if (e instanceof StudyValidationError) {
      return { ok: false, status: 400, error: "invalid_study", problems: e.problems };
    }
    return { ok: false, status: 500, error: e instanceof Error ? e.message : String(e) };
  }

  const demo = loadDemoData();
  const marketUpdate = adaptMarketUpdate(
    demo.marketUpdate,
    body.study,
    analysis.input,
    version === "0.2",
    demo.sources,
  );

  const payload = buildExplainPayload({
    study: body.study,
    input: analysis.input,
    scenarios: analysis.scenarios,
    recommendation: analysis.recommendation,
    marketUpdate,
    assumptions: loaded.set.assumptions.map((a) => ({
      key: a.id,
      label: a.label,
      value: a.value,
      unit: a.unit,
      source_id: a.source_id,
      confidence: a.confidence,
      reviewer_status: a.reviewer_status,
      provenance: provenanceOf(a),
    })),
    sources: demo.sources,
  });

  return {
    ok: true,
    out: {
      study: body.study,
      input: analysis.input,
      scenarios: analysis.scenarios,
      recommendation: analysis.recommendation,
      marketUpdate,
      payload,
      warnings: [...loaded.warnings, ...analysis.warnings],
    },
  };
}
