// AI memo draft — audience-tailored wording on top of the deterministic template.
//
// The deterministic template (buildMemoSections in src/lib/study.ts) remains the
// skeleton and the source of every figure. The AI may only REWRITE THE PROSE of each
// section for the requested audience (CFO / board / sustainability lead); it may not
// add, remove, or renumber sections, and the number-audit rejects any figure that
// doesn't already exist in the deterministic input. Disclaimers are appended by code.
//
// Drafts are returned with human_review_status = "pending_review" and are NOT
// persisted here — human approval comes first; the existing /api/memos/save flow
// stores the approved memo.

import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  AI_MODEL,
  PRE_FEASIBILITY_CAVEAT,
  TRUST_SYSTEM_PROMPT,
  auditAiOutput,
  getAnthropic,
} from "./anthropic";
import type { MemoSection } from "@/lib/types";
import type { ExplainPayload } from "./explainScenarioResults";

export type MemoAudience = "cfo" | "board" | "sustainability";

const AUDIENCE_BRIEF: Record<MemoAudience, string> = {
  cfo: "The reader is the CFO: lead with cost, savings, payback, and financial risk. Crisp and quantitative.",
  board: "The reader is the board: lead with the strategic decision, risk posture, and what approval is being sought. Minimal technical detail.",
  sustainability: "The reader is the sustainability lead: lead with renewable share, carbon reduction, and target progress. Keep financial context brief.",
};

const MemoDraftSchema = z.object({
  sections: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      body: z.string(),
    }),
  ),
});

export interface MemoDraftResult {
  memo_type: MemoAudience;
  sections: MemoSection[];
  human_review_status: "pending_review";
  source: "ai" | "deterministic_template";
  caveat: string;
  warnings: string[];
}

export async function generateMemoDraft(
  templateSections: MemoSection[],
  audience: MemoAudience,
  payload: ExplainPayload,
): Promise<MemoDraftResult> {
  const warnings: string[] = [];
  const fallback = (): MemoDraftResult => ({
    memo_type: audience,
    sections: templateSections,
    human_review_status: "pending_review",
    source: "deterministic_template",
    caveat: PRE_FEASIBILITY_CAVEAT,
    warnings,
  });

  try {
    const client = getAnthropic();
    const response = await client.messages.parse({
      model: AI_MODEL,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system: TRUST_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content:
            `Rewrite the BODY text of each memo section below for this audience. ${AUDIENCE_BRIEF[audience]}\n` +
            `Rules: keep every section (same keys, same order, same count). Keep every figure exactly as written — ` +
            `you may drop a figure but never alter or add one. Improve clarity and flow only.\n\n` +
            `<memo_sections>\n${JSON.stringify(templateSections, null, 2)}\n</memo_sections>\n\n` +
            `<supporting_data>\n${JSON.stringify(payload, null, 2)}\n</supporting_data>`,
        },
      ],
      output_config: { format: zodOutputFormat(MemoDraftSchema) },
    });

    const parsed = response.parsed_output;
    if (!parsed) {
      warnings.push("AI memo draft could not be parsed — using deterministic template.");
      return fallback();
    }

    // Structural guard: identical section keys, same order.
    const expectedKeys = templateSections.map((s) => s.key).join("|");
    const gotKeys = parsed.sections.map((s) => s.key).join("|");
    if (expectedKeys !== gotKeys) {
      warnings.push("AI memo draft altered the section structure — using deterministic template.");
      return fallback();
    }

    // Trust audits: no new numbers (vs template + payload), no banned vocabulary.
    const rejection = auditAiOutput(JSON.stringify(parsed), { templateSections, payload });
    if (rejection) {
      warnings.push(`${rejection} Using deterministic template.`);
      return fallback();
    }

    return {
      memo_type: audience,
      sections: parsed.sections,
      human_review_status: "pending_review",
      source: "ai",
      caveat: PRE_FEASIBILITY_CAVEAT,
      warnings,
    };
  } catch (e) {
    warnings.push(
      `AI unavailable (${e instanceof Error ? e.message.slice(0, 120) : "error"}) — using deterministic template.`,
    );
    return fallback();
  }
}
