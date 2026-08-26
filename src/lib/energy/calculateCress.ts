// Scenario: CRESS (Malaysia's third-party renewable supply framework).
//
// COUNTRY RULE: only available for Malaysia studies. For other countries the result
// is still computed (so it can be shown as a Malaysia EXAMPLE) but is marked
// unavailable and is excluded from ranking and persistence.
//
// Also exports deriveCress() — the effective-rate derivation shared with the hybrid.

import type { ScenarioResult, StudyInput } from "@/lib/types";
import type { CountryModule } from "./loadCountryModule";
import type { BaselineDerived } from "./calculateBaseline";
import { confFrom, inp, num, provisionalFrom, round, step, versionIdOf } from "./createCalculationTrace";

export interface CressDerived {
  ppa: number; // RM/kWh energy rate (indicative, never an official rate)
  sac: number; // RM/kWh System Access Charge (provisional until approved)
  effective: number; // ppa + sac
}

export function deriveCress(module: CountryModule): CressDerived {
  const m = module.assumptions;
  const ppa = num(m, "ASM-CRESS-PPA-RATE");
  const sac = num(m, "ASM-CRESS-SAC");
  return { ppa, sac, effective: ppa + sac };
}

export function calculateCress(
  input: StudyInput,
  module: CountryModule,
  base: BaselineDerived,
  targetPct: number,
): ScenarioResult {
  const m = module.assumptions;
  const ver = module.assumption_set_version;
  const vid = (key: string) => versionIdOf(m, key, ver);
  const useKwh = base.annual_use_kwh;
  const rates = deriveCress(module);

  const cressShare = targetPct / 100; // CRESS sized to the active renewable target
  const cressReKwh = useKwh * cressShare;
  const gridKwh = useKwh - cressReKwh;
  const cost = gridKwh * base.tariff + cressReKwh * rates.effective;
  const savings = base.base_cost - cost;
  const re = cressShare * 100;
  const carbon = base.carbonFromGrid(gridKwh);
  const reason = provisionalFrom(m, ["ASM-CRESS-SAC", "ASM-CRESS-PPA-RATE"]);

  return {
    id: `${input.project_id}:cress@${ver}`,
    project_id: input.project_id,
    scenario_key: "cress",
    annual_cost: round(cost),
    annual_savings: round(savings),
    renewable_share: re,
    carbon_reduction: (1 - carbon / base.base_carbon_t) * 100,
    capex: 0,
    payback: null,
    complexity: "Medium",
    grid_impact: "Uses grid access (SAC applies)",
    confidence: confFrom(m, ["ASM-CRESS-SAC", "ASM-CRESS-PPA-RATE"]),
    calculation_trace: [
      step("Renewable volume", `${useKwh.toLocaleString()} kWh × ${(cressShare * 100).toFixed(0)}% = ${cressReKwh.toLocaleString()} kWh`, ["ASM-CRESS-RE-SHARE"]),
      step("Effective rate", `RM${rates.ppa}/kWh PPA + RM${rates.sac}/kWh SAC = RM${rates.effective.toFixed(3)}/kWh`, ["ASM-CRESS-PPA-RATE", "ASM-CRESS-SAC"]),
      step("Annual cost", `${gridKwh.toLocaleString()} kWh × RM${base.tariff.toFixed(3)} + ${cressReKwh.toLocaleString()} kWh × RM${rates.effective.toFixed(3)} = RM${round(cost).toLocaleString()}`, ["ASM-CRESS-SAC"]),
    ],
    assumption_version_ids: ["ASM-CRESS-PPA-RATE", "ASM-CRESS-SAC", "ASM-CRESS-RE-SHARE"].map(vid),
    name: "CRESS",
    description: "Renewable energy via Malaysia's CRESS third-party supply, paying the System Access Charge.",
    savings_pct: (savings / base.base_cost) * 100,
    carbon_tonnes: round(carbon),
    meets_target: re >= targetPct,
    provisional: Boolean(reason),
    provisional_reason: reason,
    available: module.cress_available,
    unavailable_reason: module.cress_available
      ? undefined
      : `CRESS is a Malaysia framework — not available for ${input.country} in this demo.`,
    inputs: [inp(m, "ASM-CRESS-RE-SHARE"), inp(m, "ASM-CRESS-PPA-RATE"), inp(m, "ASM-CRESS-SAC")],
  };
}
