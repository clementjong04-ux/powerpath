// Tariff CATEGORY registry — types, geography helpers, and the code-level demo
// fallback (mirrors data/tariffs/malaysia_tariffs.v0.1.yaml and the DB seed in
// supabase/migrations/0008_tariff_registry.sql — change one, change all three).
//
// TRUST RULES: category references only, NO prices, never tariff-grade billing.
// The engine keeps deriving the average unit cost from the user's own bill.
// Pure TS (no I/O) so it works on the server and in the browser.

export type SupplyVoltageLevel = "LV" | "MV" | "HV";

export interface TariffOption {
  id: string;
  country: string;
  region: string;
  state: string | null; // null = whole region
  utility: string;
  market: string;
  customer_segment: string;
  user_type_hint: "industrial" | "commercial" | "any";
  supply_voltage_level: SupplyVoltageLevel;
  tariff_code: string;
  display_name: string;
  description: string | null;
  legacy_label: string | null;
  source_id: string | null;
  verification_status: string;
  official_status: string;
  active: boolean;
  caveat: string | null;
}

export const VOLTAGE_LEVELS: { value: SupplyVoltageLevel; label: string }[] = [
  { value: "LV", label: "Low Voltage (LV — e.g. 230/400 V)" },
  { value: "MV", label: "Medium Voltage (MV — e.g. 6.6–33 kV)" },
  { value: "HV", label: "High Voltage (HV — e.g. 66 kV and above)" },
];

// ---------------------------------------------------------------------------
// Malaysia geography -> utility. Sabah/Sarawak/Labuan are LIMITED modules:
// they must never silently receive TNB (Peninsular) categories.
// ---------------------------------------------------------------------------
export interface UtilityInfo {
  region: string;
  utility: string;
  utility_label: string;
  supported: boolean; // false = "coming soon" module
}

const PENINSULAR_STATES = [
  "Johor", "Kedah", "Kelantan", "Kuala Lumpur", "Melaka", "Negeri Sembilan",
  "Pahang", "Penang", "Perak", "Perlis", "Putrajaya", "Selangor", "Terengganu",
];

export const MALAYSIA_STATES = [...PENINSULAR_STATES, "Sabah", "Labuan", "Sarawak"];

export function utilityForState(state: string): UtilityInfo | null {
  if (PENINSULAR_STATES.includes(state)) {
    return { region: "Peninsular Malaysia", utility: "TNB", utility_label: "TNB — Peninsular Malaysia grid", supported: true };
  }
  if (state === "Sabah" || state === "Labuan") {
    return { region: "Sabah", utility: "SESB", utility_label: "SESB (Sabah Electricity) — limited module, coming soon", supported: false };
  }
  if (state === "Sarawak") {
    return { region: "Sarawak", utility: "SEB", utility_label: "Sarawak Energy (SEB) — limited module, coming soon", supported: false };
  }
  return null;
}

// Filter the registry for a selection. user_type is a HINT (ordering), not a
// hard filter — a data centre on MV should still see all MV references.
export function filterTariffOptions(
  options: TariffOption[],
  params: { utility: string; voltage: SupplyVoltageLevel | ""; user_type: string },
): TariffOption[] {
  const industrial = ["factory", "industrial_park", "cold_storage", "data_centre"].includes(params.user_type);
  const hint = industrial ? "industrial" : "commercial";
  return options
    .filter((t) => t.active && t.utility === params.utility && (params.voltage === "" || t.supply_voltage_level === params.voltage))
    .sort((a, b) => {
      const score = (t: TariffOption) => (t.user_type_hint === hint ? 0 : t.user_type_hint === "any" ? 1 : 2);
      return score(a) - score(b) || a.display_name.localeCompare(b.display_name);
    });
}

// ---------------------------------------------------------------------------
// Demo fallback registry (when the tariff_registry table is missing/empty).
// ---------------------------------------------------------------------------
const CAVEAT = "Category reference only — not a tariff-grade rate. Average unit cost still comes from your bill.";

const T = (
  id: string,
  voltage: SupplyVoltageLevel,
  hint: TariffOption["user_type_hint"],
  display_name: string,
  description: string,
  legacy_label: string,
): TariffOption => ({
  id,
  country: "Malaysia",
  region: "Peninsular Malaysia",
  state: null,
  utility: "TNB",
  market: "regulated",
  customer_segment: "non_domestic",
  user_type_hint: hint,
  supply_voltage_level: voltage,
  tariff_code: id,
  display_name,
  description,
  legacy_label,
  source_id: "SRC-TNB-TARIFF",
  verification_status: "pending",
  official_status: "pre_feasibility_reference",
  active: true,
  caveat: CAVEAT,
});

export const DEMO_TARIFF_REGISTRY: TariffOption[] = [
  T("MY-TNB-LV-GEN", "LV", "commercial", "Non-Domestic Low Voltage — General (reference)",
    "Low-voltage non-domestic connection (typically shops, offices, small commercial premises).",
    "Context: historically Tariff B / C1 family (pre-2024 labels, reference only)"),
  T("MY-TNB-LV-TOU", "LV", "any", "Non-Domestic Low Voltage — Time-of-Use (reference)",
    "Low-voltage non-domestic with time-of-use structure (peak/off-peak periods).",
    "Context: TOU variants of the LV non-domestic family (reference only)"),
  T("MY-TNB-MV-GEN", "MV", "industrial", "Non-Domestic Medium Voltage — General (reference)",
    "Medium-voltage non-domestic connection (typical for factories and larger commercial sites).",
    "Context: historically E1 / C1 (MV) family (pre-2024 labels, reference only)"),
  T("MY-TNB-MV-TOU", "MV", "industrial", "Non-Domestic Medium Voltage — Time-of-Use (reference)",
    "Medium-voltage non-domestic with time-of-use structure (peak/off-peak demand management).",
    "Context: historically E2 / C2 family (pre-2024 labels, reference only)"),
  T("MY-TNB-HV-GEN", "HV", "industrial", "Non-Domestic High Voltage — General (reference)",
    "High-voltage non-domestic connection (large industrial plants, heavy loads).",
    "Context: historically E3 family (pre-2024 labels, reference only)"),
  T("MY-TNB-HV-TOU", "HV", "industrial", "Non-Domestic High Voltage — Time-of-Use (reference)",
    "High-voltage non-domestic with time-of-use structure.",
    "Context: TOU variants of the HV non-domestic family (reference only)"),
];
