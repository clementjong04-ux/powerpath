// Shared server-only Claude client + trust guards for the AI explanation layer.
//
// THE RULE THIS FILE ENFORCES: AI explains only. It never calculates, never invents
// tariffs, never changes assumptions, never claims approvals. Two deterministic
// guards run on every AI output BEFORE it is returned:
//
//   1. auditNumbers()      — every number in the AI text must already exist in the
//                            deterministic input payload. A new number = rejection.
//   2. auditBannedPhrases() — overclaiming vocabulary ("official tariff", "grid
//                            approval", "guaranteed rate", ...) = rejection.
//
// On any rejection (or when no Claude credentials are available) callers fall back
// to a deterministic template — the app never depends on the AI being right or on
// the API being reachable. The pre-feasibility caveat is appended by CODE, never
// left to the model.

import Anthropic from "@anthropic-ai/sdk";

if (typeof window !== "undefined") {
  throw new Error("src/lib/ai/* is server-only — never import it in client components.");
}

// Default per current Anthropic guidance; override with AI_MODEL in .env.local.
export const AI_MODEL = process.env.AI_MODEL ?? "claude-opus-4-8";

let cached: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  // Zero-arg client: resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an
  // `ant auth login` profile automatically. If none exist, the API call throws
  // and callers fall back to the deterministic template.
  if (!cached) cached = new Anthropic();
  return cached;
}

// ---------------------------------------------------------------------------
// Guard 1: no invented numbers.
// Extract normalized numeric tokens; every number in the AI output must appear
// in the deterministic source payload. Trivial integers 0–10 are allowed (list
// numbering, "two options", years present in the payload anyway).
// ---------------------------------------------------------------------------
function numericTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const normalized = m[0].replace(/,/g, "");
    tokens.add(normalized);
    // Also add the un-decimal-padded form so "8.40" matches "8.4".
    if (normalized.includes(".")) tokens.add(normalized.replace(/0+$/, "").replace(/\.$/, ""));
  }
  return tokens;
}

export function auditNumbers(aiText: string, sourcePayload: unknown): string[] {
  const allowed = numericTokens(JSON.stringify(sourcePayload));
  const violations: string[] = [];
  for (const token of numericTokens(aiText)) {
    const asNumber = Number(token);
    if (Number.isInteger(asNumber) && asNumber >= 0 && asNumber <= 10) continue;
    if (!allowed.has(token)) violations.push(token);
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Guard 2: no overclaiming vocabulary.
// ---------------------------------------------------------------------------
const BANNED_PHRASES = [
  "official tariff",
  "official rate",
  "guaranteed rate",
  "guaranteed tariff",
  "guaranteed saving",
  "grid approval",
  "approved by tnb",
  "approved by st",
  "approved by petra",
  "approved by seda",
  "officially approved",
  "regulatory approval secured",
  "investment-grade",
  "final investment decision has been",
  "no further validation",
];

export function auditBannedPhrases(aiText: string): string[] {
  const lower = aiText.toLowerCase();
  return BANNED_PHRASES.filter((p) => lower.includes(p));
}

// Combined audit — returns null when clean, otherwise the reason to reject.
export function auditAiOutput(aiText: string, sourcePayload: unknown): string | null {
  const numbers = auditNumbers(aiText, sourcePayload);
  if (numbers.length > 0) {
    return `AI output contained numbers not present in the deterministic input (${numbers.slice(0, 5).join(", ")}) — rejected.`;
  }
  const phrases = auditBannedPhrases(aiText);
  if (phrases.length > 0) {
    return `AI output contained banned overclaiming vocabulary ("${phrases[0]}") — rejected.`;
  }
  return null;
}

// Appended by code to every AI-layer response. Never delegated to the model.
export const PRE_FEASIBILITY_CAVEAT =
  "Pre-feasibility only. Demo-grade figures from the deterministic engine — not an official tariff, " +
  "not tariff-grade financial advice, and no grid or regulatory approval is claimed or implied. " +
  "Human approval is required before any final memo or decision.";

// Shared system prompt core (mirrors docs/AI_ENERGY_CONSULTANT_AGENT.md).
export const TRUST_SYSTEM_PROMPT = `You are the Powerpath energy consultant — an explainer, not a calculator.

Hard rules (violations make your output unusable):
- Use ONLY numbers that appear verbatim in the provided data. Never compute, extrapolate, round differently, or introduce any figure of your own.
- Never state or imply official tariffs, guaranteed rates or savings, grid approval, or regulatory approval. These words are banned: "official tariff", "guaranteed rate", "grid approval".
- Never change, question-into-existence, or propose values for assumptions. You may point at an assumption's provenance (approved version / demo fallback / user input) exactly as given.
- Everything is pre-feasibility. Frame recommendations as "what to validate next", never as investment advice.
- Plain English for a CFO: short sentences, no jargon without a one-word gloss, no hedging filler.`;
