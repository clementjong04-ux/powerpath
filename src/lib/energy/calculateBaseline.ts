// Baseline derivation shared by every scenario calculation.
//
// Produces the quantities each scenario compares against: annual grid cost, carbon
// baseline, and the tariff provenance note used in traces. Pure and deterministic.

import type { StudyInput } from "@/lib/types";
import { num, type AssumptionMap } from "./createCalculationTrace";

export interface BaselineDerived {
  annual_use_kwh: number;
  tariff: number; // RM/kWh — from the STUDY's own bill data, not a Malaysia assumption
  base_cost: number; // RM/yr on grid-only supply
  base_carbon_t: number; // tCO2e/yr
  ef_per_mwh: number; // grid emission factor assumption
  tariff_trace: string; // provenance sentence for calculation traces
  carbonFromGrid: (gridKwh: number) => number;
}

export function calculateBaseline(input: StudyInput, m: AssumptionMap): BaselineDerived {
  const annual_use_kwh = input.annual_use_kwh;
  const tariff = input.tariff_rm_per_kwh;
  const ef_per_mwh = num(m, "ASM-GRID-EMISSION-FACTOR");
  const base_cost = annual_use_kwh * tariff;
  const base_carbon_t = input.carbon_baseline_t;
  return {
    annual_use_kwh,
    tariff,
    base_cost,
    base_carbon_t,
    ef_per_mwh,
    tariff_trace: input.tariff_derived
      ? "annual cost ÷ annual use (derived from your entries)"
      : "average unit cost as entered",
    carbonFromGrid: (gridKwh: number) => (gridKwh / 1000) * ef_per_mwh,
  };
}
