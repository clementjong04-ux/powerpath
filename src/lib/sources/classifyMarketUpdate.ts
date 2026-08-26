// Deterministic classification of a detected source change (server-only, NO LLM).
//
// Keyword + regex heuristics only. The output NEVER changes an assumption — it
// shapes the pending market_updates row a human reviews. Candidate values found
// by regex are surfaced as evidence for the reviewer, not applied.

export interface UpdateClassification {
  title: string;
  summary: string;
  sac_related: boolean;
  candidate_values: number[]; // RM/kWh candidates found in the text (evidence only)
  affects_assumption: string | null;
}

const SAC_KEYWORDS = ["system access charge", "sac", "cress", "corporate renewable energy supply"];

export function classifyMarketUpdate(params: {
  sourceName: string;
  text: string;
  changed: boolean;
  firstSnapshot: boolean;
}): UpdateClassification {
  const lower = params.text.toLowerCase();
  const content_match = SAC_KEYWORDS.some((k) => lower.includes(k));
  // The registered monitor's purpose counts too — a change on the CRESS/SAC
  // monitor is SAC-related even when the PDF text doesn't extract cleanly.
  const monitor_match = SAC_KEYWORDS.some((k) => params.sourceName.toLowerCase().includes(k));
  const sac_related = content_match || monitor_match;

  // RM x.xx (per kWh style) candidates — plausibility-bounded, deduped.
  const candidates = [...params.text.matchAll(/RM\s?(\d{1,2}(?:\.\d{1,4})?)(?:\s?\/?\s?kWh|\s?sen)?/gi)]
    .map((m) => Number.parseFloat(m[1]))
    .filter((v) => Number.isFinite(v) && v > 0 && v < 2);
  const candidate_values = [...new Set(candidates)].slice(0, 5);

  const changeWord = params.firstSnapshot ? "First snapshot captured" : "Content change detected";
  const title = sac_related
    ? `${changeWord} — CRESS/SAC-related content in ${params.sourceName}`
    : `${changeWord} in ${params.sourceName}`;

  const summary =
    `${changeWord} for "${params.sourceName}". ` +
    (content_match
      ? "The content references CRESS / System Access Charge material. "
      : monitor_match
        ? "Flagged as CRESS/SAC-related because this monitor watches the SAC (keywords not confirmed in extracted text). "
        : "No CRESS/SAC keywords matched; classified as a general content change. ") +
    (candidate_values.length > 0
      ? `Candidate RM/kWh values found in the text (evidence for review, NOT applied): ${candidate_values.join(", ")}. `
      : "") +
    "Pending human review — no assumption or recommendation changes until approved.";

  return {
    title,
    summary,
    sac_related,
    candidate_values,
    affects_assumption: sac_related ? "ASM-CRESS-SAC" : null,
  };
}
