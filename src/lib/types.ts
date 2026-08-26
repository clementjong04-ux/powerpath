// Shared types for Powerpath.
//
// DATABASE-READY CONTRACT: the *Record types below (StudyProject, ScenarioResult,
// MarketUpdateRecord, AssumptionVersionRecord, MemoVersionRecord) are designed to map
// 1:1 onto Supabase tables in the next phase — snake_case column names, stable string
// ids, ISO timestamps. Keep them flat and serializable. UI-only derived fields are
// grouped and commented so the future table migration is a straight copy.
//
// All values are demo-grade / pre-feasibility.

export type ReviewerStatus =
  | "approved"
  | "pending_review"
  | "needs_review"
  | "demo_seed";

export type Confidence = "high" | "medium" | "low" | "demo";

export type ScenarioKey =
  | "baseline_grid"
  | "solar_atap"
  | "cress"
  | "bess"
  | "solar_cress";

export type RiskAppetite = "low" | "medium" | "high";
export type BudgetPreference = "low" | "medium" | "high";
export type ReliabilityRequirement = "standard" | "high" | "critical";
export type MainObjective =
  | "cost_first"
  | "carbon_first"
  | "reliability_first"
  | "expansion_first"
  | "balanced";
export type UserType =
  | "factory"
  | "data_centre"
  | "industrial_park"
  | "commercial_building"
  | "cold_storage"
  | "campus_hospital";
export type DataStatus = "user_entered" | "sample_case" | "demo_grade";

// =====================================================================
// StudyProject — maps to table `study_projects`
// =====================================================================
export interface StudyProject {
  id: string;
  project_name: string;
  country: string;
  business_type: string;
  user_type: UserType;
  site_location: string;
  // ---- tariff context (guided selector; category REFERENCE only, never a rate) ----
  tariff_category: string; // human-readable display name of the selected category
  state?: string; // e.g. "Johor"
  region?: string; // e.g. "Peninsular Malaysia"
  utility?: string; // e.g. "TNB" — never silently applied across regions
  supply_voltage_level?: string; // "LV" | "MV" | "HV"
  tariff_code?: string | null; // tariff_registry id; null = free-text/unvalidated
  tariff_source_id?: string | null; // source_registry id backing the category
  tariff_verification_status?: string | null; // verification of the category reference
  monthly_consumption_kwh: number;
  peak_demand_kw: number;
  monthly_bill: number;
  annual_cost: number;
  average_unit_cost: number | null; // RM/kWh; derived from cost/use when null
  carbon_baseline: number | null; // tCO2e/yr; derived from grid factor when null
  current_re_share: number; // %
  renewable_target_percent: number;
  renewable_target_year: number;
  expansion_load_kw: number;
  budget_preference: BudgetPreference;
  reliability_requirement: ReliabilityRequirement;
  main_objective: MainObjective;
  risk_appetite: RiskAppetite;
  created_at: string; // ISO
  updated_at: string; // ISO
  data_status: DataStatus;
  // ---- UI-derived (not a column) ----
  persisted?: boolean; // true when the study was saved to / loaded from Supabase
}

// Normalized engine input derived from a StudyProject (not a table; pure derivation).
export interface StudyInput {
  project_id: string;
  country: string;
  annual_use_kwh: number;
  annual_cost: number;
  tariff_rm_per_kwh: number;
  peak_demand_kw: number;
  re_target_pct: number;
  re_target_year: number;
  current_re_share_pct: number;
  expansion_load_kw: number;
  carbon_baseline_t: number; // derived if project.carbon_baseline is null
  carbon_derived: boolean;
  tariff_derived: boolean;
}

// =====================================================================
// ScenarioResult — maps to table `scenario_results`
// =====================================================================
export interface TraceStep {
  label: string;
  detail: string;
  assumption_ids: string[];
}

export interface ScenarioInput {
  assumption_id: string;
  label: string;
  value: number | null;
  unit: string;
  provenance: ValueProvenance; // where this value came from
}

export interface ScenarioResult {
  // ---- DB columns ----
  id: string; // `${project_id}:${scenario_key}@${assumption_version}`
  project_id: string;
  scenario_key: ScenarioKey;
  annual_cost: number;
  annual_savings: number;
  renewable_share: number; // %
  carbon_reduction: number; // %
  capex: number;
  payback: number | null; // years
  complexity: "None" | "Low" | "Medium" | "High";
  grid_impact: string;
  confidence: Confidence;
  calculation_trace: TraceStep[]; // jsonb
  assumption_version_ids: string[]; // e.g. "ASM-CRESS-SAC@0.2"
  // ---- UI-derived (not persisted; recomputed on read) ----
  name: string;
  description: string;
  savings_pct: number;
  carbon_tonnes: number;
  meets_target: boolean;
  provisional: boolean;
  provisional_reason?: string;
  available: boolean; // false when the framework doesn't apply to the study country
  unavailable_reason?: string;
  inputs: ScenarioInput[];
}

// =====================================================================
// MarketUpdateRecord — maps to table `market_updates`
// =====================================================================
export interface MarketUpdateRecord {
  id: string;
  source_id: string;
  country: string;
  title: string;
  detected_at: string; // ISO
  update_date: string; // ISO date the source change is effective/observed
  affected_scenarios: ScenarioKey[];
  estimated_impact: number | null; // MYR/yr for the active study; null when not applicable
  confidence: Confidence;
  human_review_status: ReviewerStatus;
  // ---- UI-derived ----
  summary: string;
  before_value: number;
  after_value: number;
  unit: string;
  impact_formula: string | null;
  applies_to_study: boolean; // false for non-Malaysia studies (shown as example only)
  source_verification: VerificationStatus; // from the registry entry it references
  source_verified: boolean; // only verified_official sources may be applied
  source_warning: string | null; // shown when the source must not affect the model
  affects_assumption?: string; // assumption_key this update versions on approval
}

// =====================================================================
// AssumptionVersionRecord — maps to table `assumption_versions`
// =====================================================================
export interface AssumptionVersionRecord {
  id: string; // `${assumption_key}@${version}`
  country: string;
  assumption_key: string; // e.g. ASM-CRESS-SAC
  value: number | null;
  unit: string;
  source_id: string;
  effective_date: string; // ISO
  confidence: Confidence;
  human_review_status: ReviewerStatus;
  active: boolean;
  affected_models: ScenarioKey[];
  // ---- UI-derived ----
  label: string;
  caveat: string;
  version: string; // "0.1" | "0.2"
  provisional: boolean;
  reviewed_by: string | null;
}

// =====================================================================
// MemoVersionRecord — maps to table `memo_versions`
// =====================================================================
export interface MemoSection {
  key: string;
  title: string;
  body: string;
}

export interface MemoVersionRecord {
  id: string;
  project_id: string;
  version: number;
  memo_type: "cfo" | "board" | "ops";
  content: MemoSection[]; // jsonb
  scenario_result_ids: string[]; // stored scenario_results rows this memo was built from
  market_update_ids: string[];
  assumption_version_ids: string[];
  human_review_status: ReviewerStatus; // persisted as 'approved_demo' when approved (demo phase)
  approved_at: string | null; // ISO
  // ---- UI-derived ----
  created_at: string;
  assumption_set_version: string;
  persisted?: boolean;
}

// =====================================================================
// Refinement settings (per-study, human-tunable; not yet a table)
// =====================================================================
export interface RefinementSettings {
  reTargetPct: number;
  bessSizeFactor: number; // 0.5–2.0
  capexBudgetMYR: number;
  paybackThresholdYears: number;
  riskAppetite: RiskAppetite;
}

export type ScenarioTag = "recommended" | "watch" | "not_yet" | "needs_validation";

export interface Recommendation {
  scenario_key: ScenarioKey;
  scenario_name: string;
  rationale: string;
  provisional: boolean;
  provisional_reason?: string;
  target_met: boolean;
  rule: string;
  objective: MainObjective;
  advisories: string[]; // deterministic add-on notes (e.g. reliability pairing)
  excluded: { scenario_key: ScenarioKey; reason: string }[];
}

// =====================================================================
// Raw file shapes (data/*.json|yaml) — unchanged source-of-truth formats
// =====================================================================
export interface Metric {
  value: number;
  unit: string;
  label: string;
}

export interface Baseline {
  id: string;
  grade: string;
  customer: {
    name: string;
    industry: string;
    country: string;
    region: string;
    grid_operator: string;
    notes: string;
  };
  baseline: {
    annual_cost: Metric;
    annual_use: Metric;
    annual_use_kwh: Metric;
    monthly_bill: Metric;
    peak_demand: Metric;
    avg_unit_cost: Metric;
    carbon_baseline: Metric;
  };
  targets: {
    renewable_share: { value: number; unit: string; by_year: number; label: string };
  };
  provenance: {
    trust_grade: string;
    caveat: string;
    replace_with_real_data_when: string;
  };
}

// Where a calculation value came from — shown in every calculation trace.
export type ValueProvenance =
  | "approved_assumption_version" // human-approved row in assumption_versions
  | "demo_fallback" // clearly-labeled demo-grade value (seed or code fallback)
  | "user_input"; // entered by the user in the study wizard

export interface Assumption {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  source_id: string;
  confidence: Confidence;
  reviewer_status: ReviewerStatus;
  affected_scenarios: ScenarioKey[];
  caveat: string;
  provisional?: boolean;
  reviewed_by?: string;
  version?: string; // per-assumption version (e.g. "0.2") when loaded from assumption_versions
}

export interface AssumptionSet {
  meta: {
    country: string;
    version: string;
    grade: string;
    created: string;
    reviewed_by: string | null;
    created_from_market_update?: string;
    supersedes?: string;
    notes: string;
  };
  assumptions: Assumption[];
}

export type VerificationStatus =
  | "verified_official"
  | "pending"
  | "unverified"
  | "not_official_source";

export interface Source {
  id: string;
  name: string;
  authority: string;
  type: string;
  status: string;
  url?: string;
  source_domain?: string;
  official_status?: string; // why it is official (regulator/agency/utility/API) or internal_demo
  verification_status?: VerificationStatus; // absent -> treated as "unverified"
  verified_by?: string;
  verified_at?: string;
  evidence_note?: string;
  active?: boolean;
  covers?: string[];
  trust_note: string;
}

export interface SourceRegistry {
  registry: { country: string; version: string; updated: string };
  sources: Source[];
}

export interface MarketUpdateFixture {
  id: string;
  source_id: string;
  source_name: string;
  detected_at: string;
  status: string;
  summary: string;
  affects_assumption: string;
  affected_scenarios: ScenarioKey[];
  change: {
    field: string;
    unit: string;
    before: { value: number; state: string; reviewer_status: ReviewerStatus };
    after: { value: number; state: string; reviewer_status: ReviewerStatus };
  };
  on_approval: {
    creates_assumption_version: string;
    reruns_scenarios: boolean;
    refreshes_memo: boolean;
  };
  trust_note: string;
}

// Everything loaded from /data on the server and passed to the client shell.
export interface DemoData {
  baseline: Baseline;
  sources: Source[];
  assumptionsV1: AssumptionSet;
  assumptionsV2: AssumptionSet;
  marketUpdate: MarketUpdateFixture;
}
