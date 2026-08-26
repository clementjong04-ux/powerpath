// AI explanation of deterministic scenario results — explanation only, no calculation.
//
// Input: the FULL deterministic output (study summary, scenario_results with traces,
// active assumptions with provenance, market updates, verified sources, disclaimers).
// Output: plain-English sections for the requested structure:
//   why the top strategy ranks first, why BESS may be "not yet", which assumptions
//   matter most, what data needs validation, and suggested questions for EPC / PPA
//   supplier / utility.
//
// Every AI response passes the deterministic audits in ./anthropic.ts (no invented
// numbers, no banned vocabulary). On audit failure, missing credentials, or API
// error, a deterministic template built purely from engine outputs is returned
// instead — the endpoint always answers.

import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  AI_MODEL,
  PRE_FEASIBILITY_CAVEAT,
  TRUST_SYSTEM_PROMPT,
  auditAiOutput,
  getAnthropic,
} from "./anthropic";
import type {
  MarketUpdateRecord,
  Recommendation,
  ScenarioResult,
  Source,
  StudyInput,
  StudyProject,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Deterministic input payload (assembled by the route, given to the model verbatim)
// ---------------------------------------------------------------------------
export interface ExplainPayload {
  study: {
    project_name: string;
    country: string;
    business_type: string;
    user_type: string;
    main_objective: string;
    renewable_target: string;
  };
  baseline: {
    annual_use_kwh: number;
    annual_cost_rm: number;
    tariff_rm_per_kwh: number;
    peak_demand_kw: number;
    carbon_baseline_t: number;
  };
  scenarios: Array<{
    scenario_key: string;
    name: string;
    available: boolean;
    unavailable_reason?: string;
    annual_cost_rm: number;
    annual_savings_rm: number;
    renewable_share_pct: number;
    carbon_reduction_pct: number;
    capex_rm: number;
    payback_years: number | null;
    confidence: string;
    provisional: boolean;
    provisional_reason?: string;
    calculation_trace: Array<{ label: string; detail: string }>;
  }>;
  recommendation: Recommendation;
  assumptions: Array<{
    key: string;
    label: string;
    value: number | null;
    unit: string;
    source_id: string;
    confidence: string;
    reviewer_status: string;
    provenance: string;
  }>;
  market_updates: Array<{
    title: string;
    status: string;
    applies_to_study: boolean;
    before: number;
    after: number;
    unit: string;
  }>;
  sources: Array<{ id: string; name: string; verification_status: string; url?: string }>;
  disclaimers: string[];
}

export function buildExplainPayload(params: {
  study: StudyProject;
  input: StudyInput;
  scenarios: ScenarioResult[];
  recommendation: Recommendation;
  marketUpdate: MarketUpdateRecord | null;
  assumptions: ExplainPayload["assumptions"];
  sources: Source[];
}): ExplainPayload {
  const { study, input, scenarios, recommendation, marketUpdate, assumptions, sources } = params;
  return {
    study: {
      project_name: study.project_name,
      country: study.country,
      business_type: study.business_type,
      user_type: study.user_type,
      main_objective: study.main_objective,
      renewable_target: `${study.renewable_target_percent}% by ${study.renewable_target_year}`,
    },
    baseline: {
      annual_use_kwh: input.annual_use_kwh,
      annual_cost_rm: input.annual_cost,
      tariff_rm_per_kwh: input.tariff_rm_per_kwh,
      peak_demand_kw: input.peak_demand_kw,
      carbon_baseline_t: Math.round(input.carbon_baseline_t),
    },
    scenarios: scenarios.map((s) => ({
      scenario_key: s.scenario_key,
      name: s.name,
      available: s.available,
      unavailable_reason: s.unavailable_reason,
      annual_cost_rm: s.annual_cost,
      annual_savings_rm: s.annual_savings,
      renewable_share_pct: Math.round(s.renewable_share * 10) / 10,
      carbon_reduction_pct: Math.round(Math.max(s.carbon_reduction, 0) * 10) / 10,
      capex_rm: s.capex,
      payback_years: s.payback === null ? null : Math.round(s.payback * 10) / 10,
      confidence: s.confidence,
      provisional: s.provisional,
      provisional_reason: s.provisional_reason,
      calculation_trace: s.calculation_trace.map((t) => ({ label: t.label, detail: t.detail })),
    })),
    recommendation,
    assumptions,
    market_updates: marketUpdate
      ? [{
          title: marketUpdate.title,
          status: marketUpdate.human_review_status,
          applies_to_study: marketUpdate.applies_to_study,
          before: marketUpdate.before_value,
          after: marketUpdate.after_value,
          unit: marketUpdate.unit,
        }]
      : [],
    sources: sources.map((s) => ({
      id: s.id,
      name: s.name,
      verification_status: s.verification_status ?? "unverified",
      url: s.url || undefined,
    })),
    disclaimers: [PRE_FEASIBILITY_CAVEAT],
  };
}

// ---------------------------------------------------------------------------
// Output structure
// ---------------------------------------------------------------------------
const ExplanationSchema = z.object({
  why_top_strategy: z.string(),
  why_bess_not_yet: z.string(),
  assumptions_that_matter_most: z.array(
    z.object({ assumption: z.string(), why_it_matters: z.string() }),
  ),
  data_needing_validation: z.array(z.string()),
  questions_for_epc: z.array(z.string()),
  questions_for_ppa_supplier: z.array(z.string()),
  questions_for_utility: z.array(z.string()),
});

export type Explanation = z.infer<typeof ExplanationSchema>;

export interface ExplainResult {
  explanation: Explanation;
  source: "ai" | "deterministic_template";
  caveat: string;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Deterministic template — the always-available fallback, built purely from
// engine outputs (rationale/rule/advisories are engine strings, not AI).
// ---------------------------------------------------------------------------
export function deterministicExplanation(payload: ExplainPayload): Explanation {
  const rec = payload.recommendation;
  const bess = payload.scenarios.find((s) => s.scenario_key === "bess");
  const provisional = payload.assumptions.filter(
    (a) => a.provenance !== "approved_assumption_version" && a.provenance !== "user_input",
  );
  return {
    why_top_strategy: `${rec.rationale} Ranking rule: ${rec.rule}${rec.advisories.length > 0 ? ` Advisories: ${rec.advisories.join(" ")}` : ""}`,
    why_bess_not_yet: bess
      ? `BESS trims the bill through peak shaving but adds no renewable energy, so it cannot meet the renewable target on its own${bess.payback_years !== null ? `; its simple payback on current demo inputs also needs validation against interval data` : ""}. It remains a candidate add-on rather than the lead strategy.`
      : "BESS was not part of this analysis run.",
    assumptions_that_matter_most: provisional.slice(0, 4).map((a) => ({
      assumption: `${a.label} (${a.value ?? "—"} ${a.unit})`,
      why_it_matters: `Demo-grade input (${a.provenance}, ${a.confidence} confidence) — replacing it with a verified value can change scenario ranking.`,
    })),
    data_needing_validation: [
      "12 months of real electricity bills (replaces the demo/entered baseline)",
      "Roof structural survey and usable area for the solar sizing heuristic",
      "Interval / half-hourly demand data for the BESS saving estimate",
      "Actual supplier pricing for PPA and CRESS charges",
    ],
    questions_for_epc: [
      "What installed cost per kWp can you commit to for this roof type and size?",
      "What system lifetime and degradation profile do you warrant?",
    ],
    questions_for_ppa_supplier: [
      "What energy rate and tenor can you offer for the required renewable volume?",
      "Which charges (access, imbalance) apply on top of the energy rate?",
    ],
    questions_for_utility: [
      "What is the connection-study process and timeline for this capacity?",
      "Which tariff category and demand charges would apply after the change?",
    ],
  };
}

// ---------------------------------------------------------------------------
// AI path with audits + fallback
// ---------------------------------------------------------------------------
export async function explainScenarioResults(payload: ExplainPayload): Promise<ExplainResult> {
  const warnings: string[] = [];

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
            `Explain these deterministic pre-feasibility results in plain English for a CFO. ` +
            `Use only values present in the data below.\n\n` +
            `<deterministic_data>\n${JSON.stringify(payload, null, 2)}\n</deterministic_data>`,
        },
      ],
      output_config: { format: zodOutputFormat(ExplanationSchema) },
    });

    const parsed = response.parsed_output;
    if (!parsed) {
      warnings.push("AI response could not be parsed — using deterministic template.");
      return { explanation: deterministicExplanation(payload), source: "deterministic_template", caveat: PRE_FEASIBILITY_CAVEAT, warnings };
    }

    // Deterministic trust audits on the full rendered text.
    const rejection = auditAiOutput(JSON.stringify(parsed), payload);
    if (rejection) {
      warnings.push(`${rejection} Using deterministic template.`);
      return { explanation: deterministicExplanation(payload), source: "deterministic_template", caveat: PRE_FEASIBILITY_CAVEAT, warnings };
    }

    return { explanation: parsed, source: "ai", caveat: PRE_FEASIBILITY_CAVEAT, warnings };
  } catch (e) {
    warnings.push(
      `AI unavailable (${e instanceof Error ? e.message.slice(0, 120) : "error"}) — using deterministic template.`,
    );
    return { explanation: deterministicExplanation(payload), source: "deterministic_template", caveat: PRE_FEASIBILITY_CAVEAT, warnings };
  }
}
