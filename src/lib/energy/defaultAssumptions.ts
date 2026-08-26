// Demo fallback assumptions — used when Supabase has no active assumption rows
// (empty table, unreachable, or not configured).
//
// EVERY value here is demo_grade: reviewer_status is 'demo_seed' (or the sanctioned
// approved CRESS overlay for the in-session v0.2 view), confidence is demo/low, and
// each carries its caveat. Values mirror data/assumptions/malaysia_assumptions.v0.1.yaml
// — if you change one, change both. Pure TS so the same fallback works on the server
// and in the browser. No official tariff or rate is claimed anywhere in this file.
//
// Mapping to common industry names: grid_emission_factor -> ASM-GRID-EMISSION-FACTOR,
// solar capacity/yield -> ASM-SOLAR-RESOURCE-JOHOR, solar_capex_per_kw ->
// ASM-SOLAR-CAPEX, BESS capex -> ASM-BESS-CAPEX (system total), CRESS SAC ->
// ASM-CRESS-SAC, PPA price -> ASM-CRESS-PPA-RATE, Solar ATAP cap -> the 0.625×peak
// sizing heuristic in calculateSolarAtap.ts. Self-consumption is modeled implicitly
// (generation is capped at annual use = no export / no curtailment assumed); a
// dedicated self_consumption_rate / export_curtailment assumption arrives with the
// interval-data phase.

import type { Assumption, AssumptionSet } from "@/lib/types";

const A = (a: Assumption): Assumption => a;

const DEMO_ASSUMPTIONS: Assumption[] = [
  A({ id: "ASM-GRID-TARIFF-AVG", label: "Average grid tariff (from demo bill)", value: 0.452, unit: "MYR/kWh", source_id: "SRC-DEMO-SEED", confidence: "demo", reviewer_status: "demo_seed", affected_scenarios: ["baseline_grid", "solar_atap", "cress", "bess", "solar_cress"], caveat: "Derived from the demo baseline bill. Demo-grade until a real bill/CSV is uploaded." }),
  A({ id: "ASM-GRID-EMISSION-FACTOR", label: "Grid emission factor (Peninsular Malaysia)", value: 0.74, unit: "tCO2e/MWh", source_id: "SRC-DEMO-SEED", confidence: "demo", reviewer_status: "demo_seed", affected_scenarios: ["baseline_grid", "solar_atap", "cress", "bess", "solar_cress"], caveat: "Pre-feasibility estimate. Replace with an authoritative factor before any customer claim." }),
  A({ id: "ASM-SOLAR-RESOURCE-JOHOR", label: "Solar resource / specific yield (Johor)", value: 1400, unit: "kWh/kWp/year", source_id: "SRC-NASA-POWER", confidence: "medium", reviewer_status: "demo_seed", affected_scenarios: ["solar_atap", "solar_cress"], caveat: "Demo placeholder until fetched from NASA POWER for the actual site (live-data phase)." }),
  A({ id: "ASM-SOLAR-ATAP-SIZE", label: "On-site rooftop solar size (indicative)", value: 3000, unit: "kWp", source_id: "SRC-TNB-SOLAR-ATAP", confidence: "demo", reviewer_status: "demo_seed", affected_scenarios: ["solar_atap", "solar_cress"], caveat: "Indicative rooftop capacity. Requires a roof/structural survey to confirm." }),
  A({ id: "ASM-SOLAR-CAPEX", label: "On-site solar capex (indicative)", value: 3200, unit: "MYR/kWp", source_id: "SRC-DEMO-SEED", confidence: "demo", reviewer_status: "demo_seed", affected_scenarios: ["solar_atap", "solar_cress"], caveat: "Indicative only. Not a quote." }),
  A({ id: "ASM-SOLAR-LIFETIME", label: "Solar asset lifetime (levelised cost)", value: 25, unit: "years", source_id: "SRC-DEMO-SEED", confidence: "demo", reviewer_status: "demo_seed", affected_scenarios: ["solar_atap", "solar_cress"], caveat: "Planning assumption for pre-feasibility levelised cost only." }),
  A({ id: "ASM-SOLAR-OM-UPLIFT", label: "Solar O&M + degradation uplift", value: 15, unit: "%", source_id: "SRC-DEMO-SEED", confidence: "demo", reviewer_status: "demo_seed", affected_scenarios: ["solar_atap", "solar_cress"], caveat: "Simplified uplift for pre-feasibility. Not a detailed financial model." }),
  A({ id: "ASM-CRESS-PPA-RATE", label: "Renewable PPA energy rate (indicative)", value: 0.38, unit: "MYR/kWh", source_id: "SRC-DEMO-SEED", confidence: "low", reviewer_status: "demo_seed", affected_scenarios: ["cress", "solar_cress"], caveat: "Indicative pre-feasibility figure. NOT an official or guaranteed PPA rate." }),
  A({ id: "ASM-CRESS-SAC", label: "CRESS System Access Charge (provisional)", value: 0.08, unit: "MYR/kWh", source_id: "SRC-CRESS-SAC", confidence: "low", reviewer_status: "demo_seed", provisional: true, affected_scenarios: ["cress", "solar_cress"], caveat: "PROVISIONAL placeholder pending the CRESS SAC source monitor. Not an official charge." }),
  A({ id: "ASM-CRESS-RE-SHARE", label: "Renewable share sourced via CRESS (target-aligned)", value: 40, unit: "% of annual use", source_id: "SRC-CRESS-GUIDELINE", confidence: "demo", reviewer_status: "demo_seed", affected_scenarios: ["cress"], caveat: "Illustrative allocation to meet the renewable target. Pre-feasibility only." }),
  A({ id: "ASM-BESS-CAPEX", label: "Battery energy storage capex (indicative)", value: 4000000, unit: "MYR", source_id: "SRC-DEMO-SEED", confidence: "demo", reviewer_status: "demo_seed", affected_scenarios: ["bess"], caveat: "Indicative system cost. Not a quote." }),
  A({ id: "ASM-BESS-BILL-SAVING", label: "BESS bill saving from peak shaving (indicative)", value: 4, unit: "% of annual bill", source_id: "SRC-DEMO-SEED", confidence: "demo", reviewer_status: "demo_seed", affected_scenarios: ["bess"], caveat: "Indicative peak-shaving saving. Requires interval/demand data to confirm." }),
  A({ id: "ASM-TARIFF-ESCALATION", label: "Grid tariff escalation (planning assumption)", value: 3.0, unit: "%/year", source_id: "SRC-DEMO-SEED", confidence: "demo", reviewer_status: "demo_seed", affected_scenarios: ["baseline_grid", "solar_atap", "cress", "bess", "solar_cress"], caveat: "Planning assumption only. Not a forecast." }),
];

// The sanctioned in-session approved CRESS overlay (mirrors ASM-CRESS-SAC@0.2).
const APPROVED_SAC_02: Assumption = {
  id: "ASM-CRESS-SAC",
  label: "CRESS System Access Charge (approved from source update)",
  value: 0.045,
  unit: "MYR/kWh",
  source_id: "SRC-CRESS-SAC",
  confidence: "medium",
  reviewer_status: "approved",
  provisional: false,
  reviewed_by: "Demo Reviewer",
  version: "0.2",
  affected_scenarios: ["cress", "solar_cress"],
  caveat: "Demo/pre-feasibility figure approved from the source monitor for illustration. Not an official published charge.",
};

export function demoFallbackSet(version: string): AssumptionSet {
  const assumptions: Assumption[] = DEMO_ASSUMPTIONS.map((a) => ({ ...a, version: a.version ?? "0.1" }));
  if (version === "0.2") {
    const i = assumptions.findIndex((a) => a.id === "ASM-CRESS-SAC");
    assumptions[i] = { ...APPROVED_SAC_02 };
  }
  return {
    meta: {
      country: "Malaysia",
      version,
      grade: "demo",
      created: "2026-07-01",
      reviewed_by: version === "0.2" ? "Demo Reviewer" : null,
      notes:
        "DEMO FALLBACK assumption set (code-level, demo_grade) — used because no active assumption versions were available from Supabase. Pre-feasibility only.",
    },
    assumptions,
  };
}
