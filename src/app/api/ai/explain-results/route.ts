// POST /api/ai/explain-results — AI explanation layer (never AI calculation).
//
// Body: { study: StudyProject, assumption_version?: "0.1"|"0.2", settings? }
//
// 1. Deterministic engine runs first (assumptions from Supabase, demo fallback).
// 2. The AI receives ONLY that output and explains it in plain English.
// 3. Deterministic audits reject invented numbers / banned vocabulary; on any
//    failure a deterministic template answers instead. Caveat appended by code.

import { runDeterministicPipeline, type AiRouteBody } from "../pipeline";
import { explainScenarioResults } from "@/lib/ai/explainScenarioResults";

export async function POST(request: Request) {
  let body: AiRouteBody;
  try {
    body = (await request.json()) as AiRouteBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const pipeline = await runDeterministicPipeline(body);
  if (!pipeline.ok) {
    return Response.json(
      { ok: false, error: pipeline.error, problems: pipeline.problems },
      { status: pipeline.status },
    );
  }

  const result = await explainScenarioResults(pipeline.out.payload);

  return Response.json({
    ok: true,
    result_status: "pre_feasibility",
    explanation: result.explanation,
    explanation_source: result.source, // "ai" | "deterministic_template"
    caveat: result.caveat,
    recommendation: pipeline.out.recommendation,
    warnings: [...pipeline.out.warnings, ...result.warnings],
  });
}
