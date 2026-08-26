// Scenario: Grid only (the "do nothing" baseline everyone is compared against).

import type { ScenarioResult, StudyInput } from "@/lib/types";
import type { CountryModule } from "./loadCountryModule";
import type { BaselineDerived } from "./calculateBaseline";
import { inp, round, step, userInput, versionIdOf } from "./createCalculationTrace";

export function calculateGridOnly(
  input: StudyInput,
  module: CountryModule,
  base: BaselineDerived,
  targetPct: number,
): ScenarioResult {
  const m = module.assumptions;
  const ver = module.assumption_set_version;
  const useKwh = base.annual_use_kwh;

  return {
    id: `${input.project_id}:baseline_grid@${ver}`,
    project_id: input.project_id,
    scenario_key: "baseline_grid",
    annual_cost: round(base.base_cost),
    annual_savings: 0,
    renewable_share: input.current_re_share_pct,
    carbon_reduction: 0,
    capex: 0,
    payback: null,
    complexity: "None",
    grid_impact: "No change",
    confidence: "demo",
    calculation_trace: [
      step("Tariff", `RM${base.tariff.toFixed(3)}/kWh — ${base.tariff_trace}`, []),
      step("Annual cost", `${useKwh.toLocaleString()} kWh × RM${base.tariff.toFixed(3)}/kWh = RM${round(base.base_cost).toLocaleString()}`, []),
      step(
        "Carbon",
        input.carbon_derived
          ? `${(useKwh / 1000).toLocaleString()} MWh × ${base.ef_per_mwh} tCO2e/MWh = ${round(base.base_carbon_t).toLocaleString()} tCO2e (derived)`
          : `${round(base.base_carbon_t).toLocaleString()} tCO2e — as entered`,
        ["ASM-GRID-EMISSION-FACTOR"],
      ),
    ],
    assumption_version_ids: [versionIdOf(m, "ASM-GRID-EMISSION-FACTOR", ver)],
    name: "Grid only",
    description: "No change. Continue buying all electricity from the grid.",
    savings_pct: 0,
    carbon_tonnes: round(base.base_carbon_t),
    meets_target: input.current_re_share_pct >= targetPct,
    provisional: false,
    available: true,
    inputs: [
      userInput("Grid tariff (from your bill)", base.tariff, "MYR/kWh"),
      inp(m, "ASM-GRID-EMISSION-FACTOR"),
    ],
  };
}
