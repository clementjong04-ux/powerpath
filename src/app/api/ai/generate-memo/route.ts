// POST /api/ai/generate-memo — AI memo DRAFT for CFO / board / sustainability lead.
//
// Body: { study: StudyProject, memo_type?: "cfo"|"board"|"sustainability",
//         assumption_version?: "0.1"|"0.2", settings? }
//
// The deterministic memo template (buildMemoSections) is the skeleton and the source
// of every figure; the AI only rewrites prose for the audience. Structural and
// numeric audits reject any deviation. The draft returns human_review_status =
// "pending_review" and is NOT persisted — human approval first, then the existing
// /api/memos/save flow stores it.

import { runDeterministicPipeline, type AiRouteBody } from "../pipeline";
import { generateMemoDraft, type MemoAudience } from "@/lib/ai/generateMemoDraft";
import { buildMemoSections } from "@/lib/study";

interface MemoBody extends AiRouteBody {
  memo_type?: MemoAudience;
}

const AUDIENCES: MemoAudience[] = ["cfo", "board", "sustainability"];

export async function POST(request: Request) {
  let body: MemoBody;
  try {
    body = (await request.json()) as MemoBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const audience: MemoAudience = AUDIENCES.includes(body.memo_type as MemoAudience)
    ? (body.memo_type as MemoAudience)
    : "cfo";

  const pipeline = await runDeterministicPipeline(body);
  if (!pipeline.ok) {
    return Response.json(
      { ok: false, error: pipeline.error, problems: pipeline.problems },
      { status: pipeline.status },
    );
  }

  // Deterministic skeleton — the source of every figure in the draft.
  const template = buildMemoSections(
    pipeline.out.study,
    pipeline.out.input,
    pipeline.out.scenarios,
    pipeline.out.recommendation,
    pipeline.out.marketUpdate,
  );

  const draft = await generateMemoDraft(template, audience, pipeline.out.payload);

  return Response.json({
    ok: true,
    result_status: "pre_feasibility",
    memo_type: draft.memo_type,
    human_review_status: draft.human_review_status, // always "pending_review"
    sections: draft.sections,
    draft_source: draft.source, // "ai" | "deterministic_template"
    caveat: draft.caveat,
    warnings: [...pipeline.out.warnings, ...draft.warnings],
  });
}
