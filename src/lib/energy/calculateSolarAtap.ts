// Scenario: Solar ATAP (on-site rooftop solar, self-consumption).
//
// Also exports deriveSolar() — the sizing/generation/levelised-cost derivation shared
// with the hybrid scenario, so both always use identical solar math.

import type { ScenarioResult, StudyInput } from "@/lib/types";
import type { CountryModule } from "./loadCountryModule";
import type { BaselineDerived } from "./calculateBaseline";
import { confFrom, inp, num, round, step, versionIdOf } from "./createCalculationTrace";

// Rooftop sizing heuristic: 62.5% of peak demand as installable kWp.
// Demo heuristic — must be confirmed by a roof survey. (Johor sample: 4,800 kW -> 3,000 kWp.)
export const SOLAR_KWP_PER_PEAK_KW = 0.625;

export interface SolarDerived {
  size_kwp: number;
  yield_kwh_per_kwp: number;
  gen_kwh: number;
  capex: number;
  lifetime_years: number;
  om_uplift: number; // fraction
  lcoe: number; // RM/kWh
}

export function deriveSolar(input: StudyInput, module: CountryModule): SolarDerived {
  const m = module.assumptions;
  const size_kwp = Math.round(input.peak_demand_kw * SOLAR_KWP_PER_PEAK_KW);
  const yield_kwh_per_kwp = num(m, "ASM-SOLAR-RESOURCE-JOHOR");
  const gen_kwh = Math.min(size_kwp * yield_kwh_per_kwp, input.annual_use_kwh);
  const capex = size_kwp * num(m, "ASM-SOLAR-CAPEX");
  const lifetime_years = num(m, "ASM-SOLAR-LIFETIME");
  const om_uplift = num(m, "ASM-SOLAR-OM-UPLIFT") / 100;
  const lcoe = (capex / (lifetime_years * gen_kwh)) * (1 + om_uplift);
  return { size_kwp, yield_kwh_per_kwp, gen_kwh, capex, lifetime_years, om_uplift, lcoe };
}

export function calculateSolarAtap(
  input: StudyInput,
  module: CountryModule,
  base: BaselineDerived,
  targetPct: number,
): ScenarioResult {
  const m = module.assumptions;
  const ver = module.assumption_set_version;
  const vid = (key: string) => versionIdOf(m, key, ver);
  const useKwh = base.annual_use_kwh;
  const solar = deriveSolar(input, module);

  const gridKwh = useKwh - solar.gen_kwh;
  const cost = gridKwh * base.tariff + solar.gen_kwh * solar.lcoe;
  const savings = base.base_cost - cost;
  const re = (solar.gen_kwh / useKwh) * 100;
  const carbon = base.carbonFromGrid(gridKwh);

  return {
    id: `${input.project_id}:solar_atap@${ver}`,
    project_id: input.project_id,
    scenario_key: "solar_atap",
    annual_cost: round(cost),
    annual_savings: round(savings),
    renewable_share: re,
    carbon_reduction: (1 - carbon / base.base_carbon_t) * 100,
    capex: round(solar.capex),
    payback: savings > 0 ? solar.capex / savings : null,
    complexity: "Medium",
    grid_impact: "Behind the meter — low",
    confidence: confFrom(m, ["ASM-SOLAR-RESOURCE-JOHOR", "ASM-SOLAR-CAPEX"]),
    calculation_trace: [
      step("Solar sizing", `${input.peak_demand_kw.toLocaleString()} kW peak × ${SOLAR_KWP_PER_PEAK_KW} = ${solar.size_kwp.toLocaleString()} kWp (demo heuristic — confirm with roof survey)`, []),
      step("Solar generation", `${solar.size_kwp.toLocaleString()} kWp × ${solar.yield_kwh_per_kwp} kWh/kWp = ${solar.gen_kwh.toLocaleString()} kWh/yr`, ["ASM-SOLAR-RESOURCE-JOHOR"]),
      step("Levelised cost", `(RM${solar.capex.toLocaleString()} / (${solar.lifetime_years}yr × ${solar.gen_kwh.toLocaleString()} kWh)) × ${(1 + solar.om_uplift)} = RM${solar.lcoe.toFixed(3)}/kWh`, ["ASM-SOLAR-CAPEX", "ASM-SOLAR-LIFETIME", "ASM-SOLAR-OM-UPLIFT"]),
      step("Annual cost", `${gridKwh.toLocaleString()} kWh × RM${base.tariff.toFixed(3)} + ${solar.gen_kwh.toLocaleString()} kWh × RM${solar.lcoe.toFixed(3)} = RM${round(cost).toLocaleString()}`, []),
      step("Renewable share", `${solar.gen_kwh.toLocaleString()} / ${useKwh.toLocaleString()} = ${re.toFixed(1)}%`, ["ASM-SOLAR-RESOURCE-JOHOR"]),
    ],
    assumption_version_ids: ["ASM-SOLAR-RESOURCE-JOHOR", "ASM-SOLAR-CAPEX", "ASM-SOLAR-LIFETIME", "ASM-SOLAR-OM-UPLIFT"].map(vid),
    name: "Solar ATAP",
    description: "Rooftop solar for self-consumption under a Solar ATAP-style arrangement.",
    savings_pct: (savings / base.base_cost) * 100,
    carbon_tonnes: round(carbon),
    meets_target: re >= targetPct,
    provisional: false,
    available: true,
    inputs: [inp(m, "ASM-SOLAR-RESOURCE-JOHOR"), inp(m, "ASM-SOLAR-CAPEX"), inp(m, "ASM-SOLAR-LIFETIME"), inp(m, "ASM-SOLAR-OM-UPLIFT")],
  };
}
