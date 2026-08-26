// Study Analysis Agent — deterministic orchestrator.
//
// Pipeline (no I/O, no LLM; works for ANY StudyProject, not just the Johor sample):
//   1. validate required fields
//   2. normalize units (monthly -> annual, derive tariff/carbon where blank)
//   3. load the country module (Malaysia = full; others = limited + warning)
//   4. calculate the baseline
//   5. calculate all five scenarios, each with a calculation_trace
//   6. rank by the study's main objective under its constraints
//
// Persistence and transport live elsewhere (/api/analyze); this file is pure so the
// exact same engine runs server-side (normal path) and client-side (offline fallback).
// All outputs are demo-grade / pre-feasibility. No official tariff or grid-approval
// claims are ever produced here.

import type {
  AssumptionSet,
  Recommendation,
  RefinementSettings,
  ScenarioResult,
  StudyInput,
  StudyProject,
} from "@/lib/types";
import { normalizeStudy, validateStudy } from "./normalizeStudy";
import { loadCountryModule, type CountryModule } from "./loadCountryModule";
import { calculateBaseline } from "./calculateBaseline";
import { calculateGridOnly } from "./calculateGridOnly";
import { calculateSolarAtap } from "./calculateSolarAtap";
import { calculateCress } from "./calculateCress";
import { calculateBess } from "./calculateBess";
import { calculateHybrid } from "./calculateHybrid";
import { rankScenarios, seedSettings } from "./rankScenarios";
import { num } from "./createCalculationTrace";

export interface AnalysisOutput {
  input: StudyInput;
  module: {
    country: string;
    module_country: string;
    module_status: CountryModule["module_status"];
    frameworks: string[];
    assumption_set_version: string;
  };
  settings: RefinementSettings;
  scenarios: ScenarioResult[];
  recommendation: Recommendation;
  warnings: string[]; // e.g. limited-module notice for non-Malaysia studies
}

export class StudyValidationError extends Error {
  constructor(public problems: string[]) {
    super(`Study is not analyzable: ${problems.join(" ")}`);
    this.name = "StudyValidationError";
  }
}

export function analyzeStudy(
  study: StudyProject,
  assumptions: AssumptionSet,
  settings?: RefinementSettings,
): AnalysisOutput {
  // 1. validate
  const problems = validateStudy(study);
  if (problems.length > 0) throw new StudyValidationError(problems);

  // 2 + 3. load module first (normalization needs the grid emission factor from it)
  const countryModule = loadCountryModule(study.country, assumptions);
  const ef = num(countryModule.assumptions, "ASM-GRID-EMISSION-FACTOR");
  const input = normalizeStudy(study, ef);

  // 4. baseline
  const base = calculateBaseline(input, countryModule.assumptions);

  // 5. scenarios (settings default to the study's own goals)
  const effective = settings ?? seedSettings(study);
  const targetPct = effective.reTargetPct;
  const scenarios: ScenarioResult[] = [
    calculateGridOnly(input, countryModule, base, targetPct),
    calculateSolarAtap(input, countryModule, base, targetPct),
    calculateCress(input, countryModule, base, targetPct),
    calculateBess(input, countryModule, base, effective),
    calculateHybrid(input, countryModule, base, targetPct),
  ];

  // 6. rank by the study's main objective
  const recommendation = rankScenarios(scenarios, input, effective, study.main_objective);

  return {
    input,
    module: {
      country: countryModule.country,
      module_country: countryModule.module_country,
      module_status: countryModule.module_status,
      frameworks: countryModule.frameworks,
      assumption_set_version: countryModule.assumption_set_version,
    },
    settings: effective,
    scenarios,
    recommendation,
    warnings: countryModule.warnings,
  };
}
