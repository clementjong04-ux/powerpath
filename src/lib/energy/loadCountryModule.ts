// Country module loader.
//
// COUNTRY RULE: Malaysia has the (demo) full module — CRESS + Solar ATAP frameworks
// and the Malaysia assumption set. Every other country gets a LIMITED module: the
// generic scenarios still compute, CRESS-based scenarios are marked unavailable, and
// a warning is attached. We never silently apply Malaysia rules elsewhere and never
// claim country-specific accuracy we don't have.

import type { AssumptionSet } from "@/lib/types";
import type { AssumptionMap } from "./createCalculationTrace";

export interface CountryModule {
  country: string; // the study's country
  module_country: string; // whose assumption set is loaded (Malaysia in demo)
  module_status: "full" | "limited";
  frameworks: string[];
  cress_available: boolean;
  assumption_set_version: string; // '0.1' | '0.2'
  assumptions: AssumptionMap;
  warnings: string[];
}

export function loadCountryModule(country: string, set: AssumptionSet): CountryModule {
  const isMalaysia = country.trim().toLowerCase() === "malaysia";
  const assumptions: AssumptionMap = new Map();
  for (const a of set.assumptions) assumptions.set(a.id, a);

  const warnings: string[] = [];
  if (!isMalaysia) {
    warnings.push(
      `Limited demo module — country-specific rules for ${country} are not fully connected yet. ` +
        "CRESS scenarios are shown as a Malaysia example only, and no country-specific accuracy is claimed.",
    );
  }

  return {
    country,
    module_country: set.meta.country,
    module_status: isMalaysia ? "full" : "limited",
    frameworks: isMalaysia ? ["CRESS", "SOLAR_ATAP"] : [],
    cress_available: isMalaysia,
    assumption_set_version: set.meta.version,
    assumptions,
    warnings,
  };
}
