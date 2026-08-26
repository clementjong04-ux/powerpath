# TRUST_RULES — the rules that keep Powerpath honest

These rules exist to prevent two failure modes that would kill the product in front of a VC, a MAIC panel, or a buyer's finance team:
1. **Hallucination** — the AI inventing numbers, sources, or regulatory facts.
2. **Overclaiming** — presenting estimates as official, approved, or guaranteed.

Every feature, screen, and agent must comply. `trust-qa-agent` enforces this.

## The four roles (memorize this)

| Role | Who/what | May do | May NOT do |
|---|---|---|---|
| **Calculate** | Deterministic code | Produce every number via explicit formulas | Let the LLM produce numbers |
| **Evidence** | Sources + registry | Back every assumption with a source ID + snapshot | Be cited without a real snapshot |
| **Explain** | The LLM | Narrate, summarize, reason over given numbers | Invent numbers, sources, or approvals |
| **Approve** | A human | Approve assumption/recommendation changes | Be bypassed by any automation |

## Hard rules

1. **Deterministic code calculates.** Any number shown to a user comes from code, not the LLM. The LLM may describe a number but never originate one.
2. **Every assumption has a source.** No assumption is used in a calculation unless it has a `source_id` in the registry, a confidence level, and a reviewer status.
3. **The LLM explains, it does not decide.** LLM output is narration on top of deterministic results. It must not change a recommendation, an assumption, or a number.
4. **No silent updates.** A detected source change is flagged "needs review." It never auto-applies. Only human approval creates a new assumption version and triggers a rerun.
5. **Human approval is recorded.** Every approval stores who, when, and what changed (assumption version + reviewer status), and it shows in the evidence drawer.
6. **No fake official tariff claims.** We never present a tariff or rate as official/confirmed. We show it as a referenced assumption with a confidence level.
7. **No official grid-approval claim.** We never claim grid, interconnection, or regulatory approval. Ever.
8. **Pre-feasibility only.** Every recommendation and memo is labeled pre-feasibility, and states what would be required to go further.
9. **Traceability or it doesn't ship.** If a number can't be traced to the demo baseline or a sourced assumption, it does not appear in the UI.
10. **Caveats travel with claims.** A number's caveats and confidence must be visible wherever the number is shown — including in the exported memo.

## Required caveats (use this language)

- "Demo-grade baseline — replace with a real bill or CSV for customer-specific figures."
- "Pre-feasibility estimate — not an official tariff, quote, or approval."
- "Assumption under review — pending human approval; recommendation unchanged until approved."

## Red flags for review (trust-qa-agent checklist)

- A number in the UI with no traceable source or formula.
- LLM text stating a specific figure not present in deterministic output.
- Any wording implying official approval, guaranteed rates, or confirmed tariffs.
- A source change reflected in a recommendation without a recorded human approval.
- A memo claim whose caveat/confidence was dropped on export.
- An assumption used without `source_id`, `confidence`, or `reviewer_status`.
