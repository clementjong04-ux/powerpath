// Scenario: Solar + CRESS hybrid (solar-led, CRESS tops up to the renewable target).
//
// Uses the exact same solar math as Solar ATAP (deriveSolar) and the same CRESS rates
// as the CRESS scenario (deriveCress), so the hybrid can never disagree with its parts.
// Unavailable outside Malaysia (it depends on the CRESS framework).

import type { ScenarioResult, StudyInput } from "@/lib/types";
import type { CountryModule } from "./loadCountryModule";
import type { BaselineDerived } from "./calculateBaseline";
import { confFrom, inp, provisionalFrom, round, step, versionIdOf } from "./createCalculationTrace";
import { deriveSolar } from "./calculateSolarAtap";
import { deriveCress } from "./calculateCress";

export function calculateHybrid(
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
  const rates = deriveCress(module);

  const totalReKwh = useKwh * (targetPct / 100);
  const cressTopUp = Math.max(totalReKwh - solar.gen_kwh, 0);
  const gridKwh = useKwh - solar.gen_kwh - cressTopUp;
  const cost = gridKwh * base.tariff + solar.gen_kwh * solar.lcoe + cressTopUp * rates.effective;
  const savings = base.base_cost - cost;
  const re = ((solar.gen_kwh + cressTopUp) / useKwh) * 100;
  const carbon = base.carbonFromGrid(gridKwh);
  const reason = provisionalFrom(m, ["ASM-CRESS-SAC", "ASM-CRESS-PPA-RATE"]);

  return {
    id: `${input.project_id}:solar_cress@${ver}`,
    project_id: input.project_id,
    scenario_key: "solar_cress",
    annual_cost: round(cost),
    annual_savings: round(savings),
    renewable_share: re,
    carbon_reduction: (1 - carbon / base.base_carbon_t) * 100,
    capex: round(solar.capex),
    payback: savings > 0 ? solar.capex / savings : null,
    complexity: "High",
    grid_impact: "Behind the meter + grid access",
    confidence: confFrom(m, ["ASM-SOLAR-RESOURCE-JOHOR", "ASM-CRESS-SAC"]),
    calculation_trace: [
      step("Solar generation", `${solar.size_kwp.toLocaleString()} kWp × ${solar.yield_kwh_per_kwp} kWh/kWp = ${solar.gen_kwh.toLocaleString()} kWh (${((solar.gen_kwh / useKwh) * 100).toFixed(1)}%)`, ["ASM-SOLAR-RESOURCE-JOHOR"]),
      step(`CRESS top-up to ${targetPct}%`, `${totalReKwh.toLocaleString()} kWh target − ${solar.gen_kwh.toLocaleString()} kWh solar = ${cressTopUp.toLocaleString()} kWh`, ["ASM-CRESS-RE-SHARE"]),
      step("Annual cost", `grid ${gridKwh.toLocaleString()} kWh + solar @ RM${solar.lcoe.toFixed(3)} + CRESS @ RM${rates.effective.toFixed(3)} = RM${round(cost).toLocaleString()}`, ["ASM-CRESS-SAC"]),
      step("Renewable share", `(${solar.gen_kwh.toLocaleString()} + ${cressTopUp.toLocaleString()}) / ${useKwh.toLocaleString()} = ${re.toFixed(1)}%`, ["ASM-SOLAR-RESOURCE-JOHOR", "ASM-CRESS-RE-SHARE"]),
    ],
    assumption_version_ids: ["ASM-SOLAR-RESOURCE-JOHOR", "ASM-SOLAR-CAPEX", "ASM-CRESS-PPA-RATE", "ASM-CRESS-SAC"].map(vid),
    name: "Solar + CRESS",
    description: "Solar-led hybrid: on-site solar plus a CRESS top-up to reach the renewable target.",
    savings_pct: (savings / base.base_cost) * 100,
    carbon_tonnes: round(carbon),
    meets_target: re >= targetPct - 0.5,
    provisional: Boolean(reason),
    provisional_reason: reason,
    available: module.cress_available,
    unavailable_reason: module.cress_available
      ? undefined
      : `Hybrid uses Malaysia's CRESS framework — not available for ${input.country} in this demo.`,
    inputs: [inp(m, "ASM-SOLAR-RESOURCE-JOHOR"), inp(m, "ASM-SOLAR-CAPEX"), inp(m, "ASM-CRESS-PPA-RATE"), inp(m, "ASM-CRESS-SAC")],
  };
}
