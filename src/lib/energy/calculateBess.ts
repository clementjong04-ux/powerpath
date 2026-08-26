// Scenario: BESS (battery peak shaving).
//
// Honest by design: improves the demand profile and reliability, adds NO renewable
// energy, so it can never meet the renewable target by itself.

import type { RefinementSettings, ScenarioResult, StudyInput } from "@/lib/types";
import type { CountryModule } from "./loadCountryModule";
import type { BaselineDerived } from "./calculateBaseline";
import { confFrom, inp, num, round, step, versionIdOf } from "./createCalculationTrace";

export function calculateBess(
  input: StudyInput,
  module: CountryModule,
  base: BaselineDerived,
  settings: RefinementSettings,
): ScenarioResult {
  const m = module.assumptions;
  const ver = module.assumption_set_version;
  const vid = (key: string) => versionIdOf(m, key, ver);

  const sizeFactor = settings.bessSizeFactor;
  const capex = num(m, "ASM-BESS-CAPEX") * sizeFactor;
  const savePct = (num(m, "ASM-BESS-BILL-SAVING") / 100) * sizeFactor;
  const savings = base.base_cost * savePct;
  const cost = base.base_cost - savings;

  return {
    id: `${input.project_id}:bess@${ver}`,
    project_id: input.project_id,
    scenario_key: "bess",
    annual_cost: round(cost),
    annual_savings: round(savings),
    renewable_share: input.current_re_share_pct,
    carbon_reduction: 0,
    capex: round(capex),
    payback: savings > 0 ? capex / savings : null,
    complexity: "Medium",
    grid_impact: "Reduces peak draw",
    confidence: confFrom(m, ["ASM-BESS-CAPEX", "ASM-BESS-BILL-SAVING"]),
    calculation_trace: [
      step("Bill saving", `RM${round(base.base_cost).toLocaleString()} × ${(savePct * 100).toFixed(1)}% (size ${sizeFactor}×) = RM${round(savings).toLocaleString()}/yr`, ["ASM-BESS-BILL-SAVING"]),
      step("Payback", `RM${round(capex).toLocaleString()} / RM${round(savings).toLocaleString()} = ${(capex / savings).toFixed(1)} yrs`, ["ASM-BESS-CAPEX"]),
      step("Renewable share", "Storage shifts load; adds no renewable energy", []),
    ],
    assumption_version_ids: ["ASM-BESS-CAPEX", "ASM-BESS-BILL-SAVING"].map(vid),
    name: "BESS",
    description: "Battery storage for peak shaving. Improves demand profile and reliability; adds no renewable energy by itself.",
    savings_pct: savePct * 100,
    carbon_tonnes: round(base.base_carbon_t),
    meets_target: false,
    provisional: false,
    available: true,
    inputs: [inp(m, "ASM-BESS-CAPEX"), inp(m, "ASM-BESS-BILL-SAVING")],
  };
}
