// Objective-aware deterministic ranking + scenario tags + settings seeding.
//
// Eligibility: available + within capex budget + within payback threshold +
// (low risk appetite excludes provisional). Then the study's MAIN OBJECTIVE sets the
// ranking rule — stated verbatim in `rule` so it is never a black box. No LLM.

import type {
  MainObjective,
  Recommendation,
  RefinementSettings,
  ScenarioKey,
  ScenarioResult,
  ScenarioTag,
  StudyInput,
  StudyProject,
} from "@/lib/types";

export const DEFAULT_SETTINGS: RefinementSettings = {
  reTargetPct: 40,
  bessSizeFactor: 1,
  capexBudgetMYR: 15_000_000,
  paybackThresholdYears: 10,
  riskAppetite: "medium",
};

// Seed refinement settings from the study's own goals (deterministic mapping).
const BUDGET_MAP = { low: 5_000_000, medium: 15_000_000, high: 25_000_000 } as const;

export function seedSettings(study: StudyProject): RefinementSettings {
  return {
    reTargetPct: study.renewable_target_percent,
    bessSizeFactor: study.reliability_requirement === "critical" ? 1.5 : 1,
    capexBudgetMYR: BUDGET_MAP[study.budget_preference],
    paybackThresholdYears: study.budget_preference === "low" ? 7 : 10,
    riskAppetite: study.risk_appetite,
  };
}

const OBJECTIVE_RULES: Record<MainObjective, string> = {
  cost_first: "lowest annual cost among target-meeting options",
  carbon_first: "highest carbon reduction among eligible options",
  reliability_first: "peak-relief options first, then lowest cost",
  expansion_first: "zero-capex scalable supply first (headroom for expansion), then lowest cost",
  balanced: "lowest annual cost among target-meeting options, tie-broken on carbon reduction",
};

// Deterministic scalability score used by expansion_first (contract-based supply
// scales without capex; on-site assets do not).
const SCALABILITY: Record<ScenarioKey, number> = {
  cress: 2,
  solar_cress: 1,
  baseline_grid: 0,
  solar_atap: 0,
  bess: 0,
};

export function rankScenarios(
  results: ScenarioResult[],
  input: StudyInput,
  settings: RefinementSettings = DEFAULT_SETTINGS,
  objective: MainObjective = "balanced",
): Recommendation {
  const targetPct = settings.reTargetPct;
  const excluded: { scenario_key: ScenarioKey; reason: string }[] = [];
  const candidates = results.filter((r) => r.scenario_key !== "baseline_grid");

  const eligible = candidates.filter((r) => {
    if (!r.available) {
      excluded.push({ scenario_key: r.scenario_key, reason: r.unavailable_reason ?? "Not available" });
      return false;
    }
    if (r.capex > settings.capexBudgetMYR) {
      excluded.push({ scenario_key: r.scenario_key, reason: `Capex above RM${(settings.capexBudgetMYR / 1e6).toFixed(0)}M budget` });
      return false;
    }
    if (r.payback !== null && r.payback > settings.paybackThresholdYears) {
      excluded.push({ scenario_key: r.scenario_key, reason: `Payback beyond ${settings.paybackThresholdYears} yrs` });
      return false;
    }
    if (settings.riskAppetite === "low" && r.provisional) {
      excluded.push({ scenario_key: r.scenario_key, reason: "Provisional inputs excluded at low risk appetite" });
      return false;
    }
    return true;
  });

  const meeting = eligible.filter((r) => r.meets_target);
  const byCost = (a: ScenarioResult, b: ScenarioResult) => a.annual_cost - b.annual_cost || a.capex - b.capex;

  let pool: ScenarioResult[];
  let sorted: ScenarioResult[];
  switch (objective) {
    case "carbon_first":
      pool = eligible.length > 0 ? eligible : candidates;
      sorted = [...pool].sort((a, b) => b.carbon_reduction - a.carbon_reduction || byCost(a, b));
      break;
    case "reliability_first":
      pool = eligible.length > 0 ? eligible : candidates;
      sorted = [...pool].sort(
        (a, b) => Number(b.scenario_key === "bess") - Number(a.scenario_key === "bess") ||
          Number(b.meets_target) - Number(a.meets_target) || byCost(a, b),
      );
      break;
    case "expansion_first":
      pool = eligible.length > 0 ? eligible : candidates;
      sorted = [...pool].sort(
        (a, b) => SCALABILITY[b.scenario_key] - SCALABILITY[a.scenario_key] ||
          Number(b.meets_target) - Number(a.meets_target) || byCost(a, b),
      );
      break;
    case "balanced":
    case "cost_first":
    default:
      pool = meeting.length > 0 ? meeting : eligible.length > 0 ? eligible : candidates;
      sorted = [...pool].sort(
        (a, b) => byCost(a, b) || (objective === "balanced" ? b.carbon_reduction - a.carbon_reduction : 0),
      );
      break;
  }

  const pick = sorted[0];
  const target_met = pick.meets_target;

  // Deterministic advisories (never change the numbers, only add context).
  const advisories: string[] = [];
  const bess = results.find((r) => r.scenario_key === "bess");
  if (objective === "reliability_first" && pick.scenario_key === "bess" && !pick.meets_target) {
    advisories.push(`BESS alone does not reach the ${targetPct}% renewable target — pair with a supply option in phase two.`);
  }
  if (objective !== "reliability_first" && input.expansion_load_kw > 0) {
    advisories.push(`Expansion load of ${input.expansion_load_kw.toLocaleString()} kW planned — revalidate sizing before contracting.`);
  }
  if (bess && pick.scenario_key !== "bess" && input.expansion_load_kw > 0) {
    advisories.push("Consider BESS peak shaving alongside the pick to manage expanded peak demand.");
  }

  const rule = `Objective ${objective.replace("_", "-")}: ${OBJECTIVE_RULES[objective]}. Constraints: capex ≤ RM${(settings.capexBudgetMYR / 1e6).toFixed(0)}M, payback ≤ ${settings.paybackThresholdYears} yrs${settings.riskAppetite === "low" ? ", no provisional inputs" : ""}, target ${targetPct}%.`;

  const rationale = target_met
    ? `${pick.name} meets the ${targetPct}% renewable target at RM${pick.annual_cost.toLocaleString()}/yr (~${pick.savings_pct.toFixed(0)}% saving) under the ${objective.replace("_", "-")} objective.`
    : `${pick.name} ranks first under the ${objective.replace("_", "-")} objective but does not reach the ${targetPct}% target on current inputs.`;

  return {
    scenario_key: pick.scenario_key,
    scenario_name: pick.name,
    rationale,
    provisional: pick.provisional,
    provisional_reason: pick.provisional_reason,
    target_met,
    rule,
    objective,
    advisories,
    excluded,
  };
}

export function tagFor(s: ScenarioResult, rec: Recommendation): ScenarioTag {
  if (s.scenario_key === rec.scenario_key) return "recommended";
  if (!s.available) return "not_yet";
  if (s.provisional) return "needs_validation";
  if (s.meets_target || s.annual_savings > 0) return "watch";
  return "not_yet";
}
