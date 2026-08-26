// Study validation + unit normalization.
//
// Turns a StudyProject (whatever the user typed, monthly figures, blanks allowed)
// into the engine's normalized StudyInput (annual figures, derived tariff/carbon,
// each derivation flagged so the UI can label it honestly). Pure — no I/O, no LLM.

import type { StudyInput, StudyProject } from "@/lib/types";

// Required fields for a meaningful pre-feasibility analysis. Returns human-readable
// problems; an empty array means the study is analyzable.
export function validateStudy(study: StudyProject): string[] {
  const problems: string[] = [];
  if (!study.project_name?.trim()) problems.push("Project name is required.");
  if (!study.country?.trim()) problems.push("Country is required.");
  if (!(study.monthly_consumption_kwh > 0)) problems.push("Monthly electricity consumption must be greater than 0 kWh.");
  if (!(study.peak_demand_kw > 0)) problems.push("Peak demand must be greater than 0 kW.");
  if (!(study.annual_cost > 0) && !(study.monthly_bill > 0)) {
    problems.push("Either annual electricity cost or monthly bill must be greater than 0.");
  }
  if (!(study.renewable_target_percent >= 0 && study.renewable_target_percent <= 100)) {
    problems.push("Renewable target must be between 0 and 100%.");
  }
  return problems;
}

// Normalization rules (all deterministic, all surfaced in the UI):
//   annual use    = monthly consumption × 12
//   annual cost   = as entered, else monthly bill × 12
//   tariff        = average unit cost as entered, else annual cost ÷ annual use  (tariff_derived)
//   carbon        = as entered, else (annual kWh ÷ 1000) × grid emission factor  (carbon_derived)
export function normalizeStudy(study: StudyProject, gridEmissionFactor: number): StudyInput {
  const annual_use_kwh = study.monthly_consumption_kwh * 12;
  const annual_cost = study.annual_cost > 0 ? study.annual_cost : study.monthly_bill * 12;
  const tariff_derived = study.average_unit_cost === null;
  const tariff_rm_per_kwh = study.average_unit_cost ?? annual_cost / annual_use_kwh;
  const carbon_derived = study.carbon_baseline === null;
  const carbon_baseline_t =
    study.carbon_baseline ?? (annual_use_kwh / 1000) * gridEmissionFactor;
  return {
    project_id: study.id,
    country: study.country,
    annual_use_kwh,
    annual_cost,
    tariff_rm_per_kwh,
    peak_demand_kw: study.peak_demand_kw,
    re_target_pct: study.renewable_target_percent,
    re_target_year: study.renewable_target_year,
    current_re_share_pct: study.current_re_share,
    expansion_load_kw: study.expansion_load_kw,
    carbon_baseline_t,
    carbon_derived,
    tariff_derived,
  };
}
