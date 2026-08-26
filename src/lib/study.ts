// Study repository / adapters for Powerpath.
//
// SUPABASE-READY SEAM: every state transition in the app goes through the functions in
// this file (createStudy, loadSampleStudy, updateStudy, runAnalysis, approveMarketUpdate,
// rerunStrategy, generateMemo). They are async and return the DB-shaped records from
// types.ts. In the next phase, their bodies swap local computation for supabase-js
// calls (insert/select) without touching any component.
//
// No network. No persistence. Demo-grade / pre-feasibility only.

import type {
  Assumption,
  AssumptionSet,
  AssumptionVersionRecord,
  Baseline,
  MarketUpdateFixture,
  MarketUpdateRecord,
  MemoSection,
  MemoVersionRecord,
  Recommendation,
  RefinementSettings,
  ScenarioResult,
  Source,
  StudyInput,
  StudyProject,
} from "./types";
import { analyzeStudy } from "./energy/analyzeStudy";
import { assertUpdateSourceVerified, canDriveUpdates, sourceWarning, verificationOf } from "./sourcePolicy";

// The engine's normalizer, re-exported under the name existing callers use.
export { normalizeStudy as toStudyInput } from "./energy/normalizeStudy";
import { fmtMYR, fmtPct } from "./format";

const SAMPLE_ID = "study-johor-sample";

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------
// Persistence helper: POST the study to the server route. Returns the saved
// study (persisted: true) or null when Supabase is unavailable/not configured —
// callers fall back to local state so the app always works offline.
// ---------------------------------------------------------------------
async function persistStudy(study: StudyProject): Promise<StudyProject | null> {
  try {
    const res = await fetch("/api/projects/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(study),
    });
    if (!res.ok) {
      console.warn(`[powerpath] study not persisted (HTTP ${res.status}) — using local state`);
      return null;
    }
    const json = (await res.json()) as { ok: boolean; study?: StudyProject; warning?: string };
    if (json.warning) console.warn("[powerpath]", json.warning);
    return json.ok && json.study ? json.study : null;
  } catch (e) {
    console.warn("[powerpath] study not persisted (network) — using local state", e);
    return null;
  }
}

// ---------------------------------------------------------------------
// listStudies / openStudy — read saved studies back. Empty list / null when
// Supabase is unavailable (the UI treats that as "local mode").
// ---------------------------------------------------------------------
export async function listStudies(): Promise<StudyProject[]> {
  try {
    const res = await fetch("/api/projects/list");
    if (!res.ok) return [];
    const json = (await res.json()) as { ok: boolean; studies?: StudyProject[] };
    return json.ok && json.studies ? json.studies : [];
  } catch {
    return [];
  }
}

export async function openStudy(id: string): Promise<StudyProject | null> {
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { ok: boolean; study?: StudyProject };
    return json.ok && json.study ? json.study : null;
  } catch {
    return null;
  }
}

function newId(prefix: string): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}-${uuid}`;
}

// ---------------------------------------------------------------------
// createStudy — future: INSERT INTO study_projects
// ---------------------------------------------------------------------
export async function createStudy(
  fields: Omit<StudyProject, "id" | "created_at" | "updated_at" | "data_status">,
): Promise<StudyProject> {
  const ts = nowIso();
  const local: StudyProject = {
    ...fields,
    id: newId("study"),
    created_at: ts,
    updated_at: ts,
    data_status: "user_entered",
    persisted: false,
  };
  // Save to Supabase when configured; otherwise the local object is the study.
  const saved = await persistStudy(local);
  return saved ?? local;
}

// ---------------------------------------------------------------------
// updateStudy — future: UPDATE study_projects SET ... WHERE id
// ---------------------------------------------------------------------
export async function updateStudy(
  study: StudyProject,
  patch: Partial<StudyProject>,
): Promise<StudyProject> {
  return { ...study, ...patch, id: study.id, created_at: study.created_at, updated_at: nowIso() };
}

// ---------------------------------------------------------------------
// loadSampleStudy — Johor demo JSON converted into a StudyProject
// ---------------------------------------------------------------------
export async function loadSampleStudy(baseline: Baseline): Promise<StudyProject> {
  const b = baseline.baseline;
  const ts = nowIso();
  const sample: StudyProject = {
    id: SAMPLE_ID,
    project_name: "Johor Electronics Plant (sample)",
    country: "Malaysia",
    business_type: "Electronics manufacturing",
    user_type: "factory",
    site_location: "Johor, Malaysia",
    tariff_category: "Non-Domestic Medium Voltage — General (reference)",
    state: "Johor",
    region: "Peninsular Malaysia",
    utility: "TNB",
    supply_voltage_level: "MV",
    tariff_code: "MY-TNB-MV-GEN",
    tariff_source_id: "SRC-TNB-TARIFF",
    tariff_verification_status: "pending",
    monthly_consumption_kwh: b.annual_use_kwh.value / 12, // 1,550,000
    peak_demand_kw: b.peak_demand.value * 1000, // 4,800
    monthly_bill: b.monthly_bill.value,
    annual_cost: b.annual_cost.value,
    average_unit_cost: b.avg_unit_cost.value,
    carbon_baseline: b.carbon_baseline.value,
    current_re_share: 0,
    renewable_target_percent: baseline.targets.renewable_share.value,
    renewable_target_year: baseline.targets.renewable_share.by_year,
    expansion_load_kw: 0,
    budget_preference: "medium",
    reliability_requirement: "high",
    main_objective: "balanced",
    risk_appetite: "medium",
    created_at: ts,
    updated_at: ts,
    data_status: "sample_case",
    persisted: false,
  };
  // Optionally save the sample too — fixed ids make this an idempotent upsert,
  // so loading it repeatedly never duplicates rows.
  const saved = await persistStudy(sample);
  return saved ?? sample;
}

export function isSample(study: StudyProject): boolean {
  return study.id === SAMPLE_ID;
}

export function isMalaysia(study: StudyProject): boolean {
  return study.country.trim().toLowerCase() === "malaysia";
}

// (Normalization now lives in src/lib/energy/normalizeStudy.ts — re-exported above
// as toStudyInput for existing callers.)

// ---------------------------------------------------------------------
// Assumption versions: YAML sets -> AssumptionVersionRecord[]
// ---------------------------------------------------------------------
function toAssumptionRecord(a: Assumption, set: AssumptionSet, active: boolean): AssumptionVersionRecord {
  return {
    id: `${a.id}@${set.meta.version}`,
    country: set.meta.country,
    assumption_key: a.id,
    value: a.value,
    unit: a.unit,
    source_id: a.source_id,
    effective_date: set.meta.created,
    confidence: a.confidence,
    human_review_status: a.reviewer_status,
    active,
    affected_models: a.affected_scenarios,
    label: a.label,
    caveat: a.caveat,
    version: set.meta.version,
    provisional: Boolean(a.provisional),
    reviewed_by: a.reviewed_by ?? set.meta.reviewed_by,
  };
}

export function assumptionRecords(set: AssumptionSet, active: boolean): AssumptionVersionRecord[] {
  return set.assumptions.map((a) => toAssumptionRecord(a, set, active));
}

// ---------------------------------------------------------------------
// Market update: fixture -> MarketUpdateRecord scoped to the active study
// ---------------------------------------------------------------------
export function adaptMarketUpdate(
  fixture: MarketUpdateFixture,
  study: StudyProject,
  input: StudyInput,
  approved: boolean,
  sources: Source[],
): MarketUpdateRecord {
  const applies = isMalaysia(study);
  // Verification gate: a market update may only be applied when its source is
  // verified official in the registry.
  const source = sources.find((s) => s.id === fixture.source_id);
  const source_verification = verificationOf(source);
  const source_verified = canDriveUpdates(source);
  const source_warning = sourceWarning(source);
  const delta = fixture.change.before.value - fixture.change.after.value;
  // Impact = renewable volume at the study's target share x SAC delta (deterministic).
  const affectedKwh = input.annual_use_kwh * (input.re_target_pct / 100);
  const impact = applies ? affectedKwh * delta : null;
  return {
    id: fixture.id,
    source_id: fixture.source_id,
    country: "Malaysia",
    title: "Lower SAC improves CRESS economics",
    detected_at: fixture.detected_at,
    update_date: fixture.detected_at.slice(0, 10),
    affected_scenarios: fixture.affected_scenarios,
    estimated_impact: impact,
    confidence: "low",
    human_review_status: approved ? "approved" : "needs_review",
    summary: fixture.summary,
    before_value: fixture.change.before.value,
    after_value: fixture.change.after.value,
    unit: fixture.change.unit,
    impact_formula: applies
      ? `${(affectedKwh / 1e6).toFixed(2)} GWh/yr × RM${delta.toFixed(3)}/kWh`
      : null,
    applies_to_study: applies,
    source_verification,
    source_verified,
    source_warning,
    affects_assumption: fixture.affects_assumption,
  };
}

// ---------------------------------------------------------------------
// runAnalysis — future: compute server-side, INSERT INTO scenario_results
// ---------------------------------------------------------------------
export interface AnalysisResult {
  scenarios: ScenarioResult[];
  recommendation: Recommendation;
  settings: RefinementSettings;
  persisted_result_ids: string[]; // scenario_results row ids saved for this run ([] in local mode)
}

export async function runAnalysis(
  study: StudyProject,
  assumptions: AssumptionSet,
  settings?: RefinementSettings,
): Promise<AnalysisResult> {
  // Preferred path: the server-side Study Analysis Agent (/api/analyze) — it runs
  // the same deterministic engine AND persists the run to scenario_results.
  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        study,
        assumption_version: assumptions.meta.version,
        settings,
      }),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        ok: boolean;
        scenarios?: ScenarioResult[];
        recommendation?: Recommendation;
        settings?: RefinementSettings;
        warnings?: string[];
        persisted_result_ids?: string[];
      };
      if (json.ok && json.scenarios && json.recommendation && json.settings) {
        for (const w of json.warnings ?? []) console.warn("[powerpath]", w);
        return {
          scenarios: json.scenarios,
          recommendation: json.recommendation,
          settings: json.settings,
          persisted_result_ids: json.persisted_result_ids ?? [],
        };
      }
    }
    console.warn(`[powerpath] analyze API HTTP ${res.status} — falling back to local engine`);
  } catch (e) {
    console.warn("[powerpath] analyze API unreachable — falling back to local engine", e);
  }

  // Fallback: identical deterministic engine, run locally (no persistence).
  const out = analyzeStudy(study, assumptions, settings);
  for (const w of out.warnings) console.warn("[powerpath]", w);
  return {
    scenarios: out.scenarios,
    recommendation: out.recommendation,
    settings: out.settings,
    persisted_result_ids: [],
  };
}

// ---------------------------------------------------------------------
// approveMarketUpdate — DATABASE-BACKED: POST /api/market-updates/[id]/approve
// updates market_updates, inserts human_reviews, creates/activates the linked
// assumption_versions row (audit_logs via trigger). Only valid for Malaysia
// studies; callers must gate on applies_to_study.
//
// Fallback policy: infrastructure failures (network / DB unconfigured) degrade to
// the local in-session approval so the demo keeps working; POLICY rejections
// (unverified source) are thrown and never bypassed.
// ---------------------------------------------------------------------
export async function approveMarketUpdate(
  update: MarketUpdateRecord,
  source: Source | undefined,
): Promise<MarketUpdateRecord> {
  if (!update.applies_to_study) {
    throw new Error("CRESS update is a Malaysia example — it cannot be applied to this study.");
  }
  // TRUST GATE (client-side pre-check; the route enforces it again server-side).
  assertUpdateSourceVerified(source, update.source_id);

  try {
    const res = await fetch(`/api/market-updates/${encodeURIComponent(update.id)}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewer: "Demo Reviewer", assumption_key: update.affects_assumption }),
    });
    const json = (await res.json()) as {
      ok: boolean;
      status?: string;
      error?: string;
      assumption_version?: { id: string; active: boolean };
      warnings?: string[];
    };
    if (res.status === 403 || json.status === "source_not_verified") {
      // Policy rejection — never fall back around the trust gate.
      throw new Error(json.error ?? "Approval blocked: source not verified.");
    }
    if (res.ok && json.ok) {
      for (const w of json.warnings ?? []) console.warn("[powerpath]", w);
      if (json.assumption_version) {
        console.warn(`[powerpath] approval persisted — ${json.assumption_version.id} is now the active assumption`);
      }
      return { ...update, human_review_status: "approved" };
    }
    console.warn(`[powerpath] approval not persisted (HTTP ${res.status}: ${json.error ?? "?"}) — applied in-session only`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Approval blocked")) throw e;
    console.warn("[powerpath] approval not persisted (network) — applied in-session only", e);
  }
  return { ...update, human_review_status: "approved" };
}

// ---------------------------------------------------------------------
// ignoreMarketUpdate — DATABASE-BACKED: records the decision, creates NO
// assumption version. Same infrastructure-only fallback policy.
// ---------------------------------------------------------------------
export async function ignoreMarketUpdate(update: MarketUpdateRecord): Promise<void> {
  try {
    const res = await fetch(`/api/market-updates/${encodeURIComponent(update.id)}/ignore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewer: "Demo Reviewer" }),
    });
    const json = (await res.json()) as { ok: boolean; error?: string; warnings?: string[] };
    if (res.ok && json.ok) {
      for (const w of json.warnings ?? []) console.warn("[powerpath]", w);
      return;
    }
    console.warn(`[powerpath] ignore not persisted (HTTP ${res.status}: ${json.error ?? "?"}) — recorded in-session only`);
  } catch (e) {
    console.warn("[powerpath] ignore not persisted (network) — recorded in-session only", e);
  }
}

// ---------------------------------------------------------------------
// fetchMarketUpdateStatus — read the persisted review state so a fresh session
// reflects database truth (an approval survives reloads). null on any failure.
// ---------------------------------------------------------------------
export async function fetchMarketUpdateStatus(
  updateId: string,
): Promise<{ human_review_status: string; reviewed_by: string | null } | null> {
  try {
    const res = await fetch(`/api/market-updates/${encodeURIComponent(updateId)}`);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      ok: boolean;
      market_update?: { human_review_status: string; reviewed_by: string | null };
    };
    return json.ok && json.market_update ? json.market_update : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// syncCressSource — trigger the live source sync (/api/sync/cress): fetches the
// verified ST/PETRA source, snapshots it, and creates a PENDING market_updates
// row when content is new/changed. NEVER changes assumptions or reruns strategy —
// approval stays a separate human act.
// ---------------------------------------------------------------------
export interface LiveUpdateSource {
  source_name: string;
  authority: string | null;
  url: string | null;
  source_domain: string | null;
  verification_status: string | null;
  official_status: string | null;
}

export interface LiveUpdateSnapshot {
  fetched_at: string;
  content_hash: string | null;
}

export interface LiveMarketUpdate {
  id: string;
  source_id: string;
  title: string;
  summary: string;
  detected_at: string;
  affected_scenarios: string[];
  human_review_status: string;
  before_value: number | null;
  after_value: number | null;
  unit: string | null;
  reviewed_by: string | null;
  source: LiveUpdateSource | null; // joined from source_registry
  snapshot: LiveUpdateSnapshot | null; // joined from source_snapshots
}

export interface SourceSyncResult {
  ok: boolean;
  changed: boolean;
  first_snapshot: boolean;
  snapshot: { id: string; fetched_at: string; content_hash: string; http_status: number; title: string } | null;
  market_update: LiveMarketUpdate | null;
  error: string | null;
}

export async function syncCressSource(): Promise<SourceSyncResult> {
  try {
    const res = await fetch("/api/sync/cress");
    const json = (await res.json()) as {
      ok: boolean;
      error?: string;
      changed?: boolean;
      first_snapshot?: boolean;
      snapshot?: SourceSyncResult["snapshot"];
      market_update?: LiveMarketUpdate | null;
      warnings?: string[];
    };
    for (const w of json.warnings ?? []) console.warn("[powerpath]", w);
    return {
      ok: json.ok,
      changed: json.changed ?? false,
      first_snapshot: json.first_snapshot ?? false,
      snapshot: json.snapshot ?? null,
      market_update: json.market_update ?? null,
      error: json.ok ? null : (json.error ?? `HTTP ${res.status}`),
    };
  } catch (e) {
    return {
      ok: false, changed: false, first_snapshot: false, snapshot: null, market_update: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// listLiveMarketUpdates — read recent updates (with joined source + snapshot
// evidence) so the UI reflects database truth. Empty list on any failure (local mode).
export async function listLiveMarketUpdates(sourceId?: string): Promise<LiveMarketUpdate[]> {
  try {
    const qs = sourceId ? `?source_id=${encodeURIComponent(sourceId)}` : "";
    const res = await fetch(`/api/market-updates${qs}`);
    if (!res.ok) return [];
    const json = (await res.json()) as { ok: boolean; market_updates?: LiveMarketUpdate[] };
    return json.ok && json.market_updates ? json.market_updates : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------
// listRegistrySources — the live source_registry (with each source's latest
// snapshot) for the monitor cards. null on failure -> UI keeps local fixtures.
// ---------------------------------------------------------------------
export interface RegistrySource {
  id: string;
  source_name: string;
  authority: string | null;
  url: string | null;
  source_domain: string | null;
  verification_status: string | null;
  official_status: string | null;
  active: boolean;
  latest_snapshot: LiveUpdateSnapshot | null;
}

export async function listRegistrySources(): Promise<RegistrySource[] | null> {
  try {
    const res = await fetch("/api/sources");
    if (!res.ok) return null;
    const json = (await res.json()) as { ok: boolean; sources?: RegistrySource[]; warning?: string };
    if (json.warning) console.warn("[powerpath]", json.warning);
    return json.ok && json.sources && json.sources.length > 0 ? json.sources : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// AI explanation layer adapters (/api/ai/*). AI EXPLAINS ONLY: the routes run
// the deterministic engine first, the model narrates that output, and code-side
// audits reject invented numbers or overclaiming vocabulary — any failure (or a
// missing key) answers with the deterministic template instead. The `source`
// field reports which path produced the text.
// ---------------------------------------------------------------------
export interface AiExplanation {
  why_top_strategy: string;
  why_bess_not_yet: string;
  assumptions_that_matter_most: { assumption: string; why_it_matters: string }[];
  data_needing_validation: string[];
  questions_for_epc: string[];
  questions_for_ppa_supplier: string[];
  questions_for_utility: string[];
}

export type AiTextSource = "ai" | "deterministic_template";

export interface AiExplanationResult {
  ok: boolean;
  source: AiTextSource | null;
  explanation: AiExplanation | null;
  caveat: string | null;
  error: string | null;
}

export async function fetchAiExplanation(
  study: StudyProject,
  assumptionVersion: "0.1" | "0.2",
  settings?: RefinementSettings,
): Promise<AiExplanationResult> {
  try {
    const res = await fetch("/api/ai/explain-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ study, assumption_version: assumptionVersion, settings }),
    });
    const json = (await res.json()) as {
      ok: boolean;
      explanation?: AiExplanation;
      explanation_source?: AiTextSource;
      caveat?: string;
      error?: string;
      warnings?: string[];
    };
    for (const w of json.warnings ?? []) console.warn("[powerpath]", w);
    if (res.ok && json.ok && json.explanation) {
      return { ok: true, source: json.explanation_source ?? null, explanation: json.explanation, caveat: json.caveat ?? null, error: null };
    }
    return { ok: false, source: null, explanation: null, caveat: null, error: json.error ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, source: null, explanation: null, caveat: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface AiMemoDraftResult {
  ok: boolean;
  source: AiTextSource | null;
  sections: MemoSection[];
  human_review_status: string | null; // always "pending_review" from the route
  caveat: string | null;
  error: string | null;
}

export async function fetchAiMemoDraft(
  study: StudyProject,
  assumptionVersion: "0.1" | "0.2",
  memoType: "cfo" | "board" | "sustainability" = "cfo",
  settings?: RefinementSettings,
): Promise<AiMemoDraftResult> {
  try {
    const res = await fetch("/api/ai/generate-memo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ study, assumption_version: assumptionVersion, memo_type: memoType, settings }),
    });
    const json = (await res.json()) as {
      ok: boolean;
      sections?: MemoSection[];
      draft_source?: AiTextSource;
      human_review_status?: string;
      caveat?: string;
      error?: string;
      warnings?: string[];
    };
    for (const w of json.warnings ?? []) console.warn("[powerpath]", w);
    if (res.ok && json.ok && json.sections) {
      return {
        ok: true,
        source: json.draft_source ?? null,
        sections: json.sections,
        human_review_status: json.human_review_status ?? "pending_review",
        caveat: json.caveat ?? null,
        error: null,
      };
    }
    return { ok: false, source: null, sections: [], human_review_status: null, caveat: null, error: json.error ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, source: null, sections: [], human_review_status: null, caveat: null, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------
// fetchEvidenceTrail — the full live chain for the Evidence Drawer:
// source_registry → source_snapshot → market_update (+ human_review)
// → assumption_version → scenario_result → memo_version.
// null on any failure — the drawer falls back to fixture evidence.
// ---------------------------------------------------------------------
export interface EvidenceTrail {
  source: {
    id: string;
    source_name: string;
    authority: string | null;
    url: string | null;
    source_domain: string | null;
    official_status: string | null;
    verification_status: string | null;
    verified_at: string | null;
    evidence_note: string | null;
  } | null;
  snapshot: {
    id: string;
    checked_at: string;
    content_hash: string | null;
    http_status: number | null;
    title: string | null;
    excerpt: string | null;
    extraction_note: string | null;
  } | null;
  market_updates: {
    id: string;
    title: string;
    detected_at: string;
    human_review_status: string;
    affected_scenarios: string[];
    reviewed_by: string | null;
  }[];
  human_reviews: {
    id: string;
    target_id: string;
    decision: string;
    reviewer_name: string;
    note: string | null;
    reviewed_at: string;
  }[];
  assumption_versions: {
    id: string;
    assumption_key: string;
    version: string;
    value: number | string | null;
    unit: string | null;
    active: boolean;
    confidence: string;
    human_review_status: string;
    reviewed_by: string | null;
    created_from_market_update: string | null;
  }[];
  scenario_results: {
    id: string;
    scenario_key: string;
    assumption_set_version: string;
    assumption_version_ids: string[];
    calculation_trace: { label: string; detail: string }[];
    created_at: string;
  }[];
  memo_version: {
    id: string;
    version: number;
    market_update_ids: string[];
    assumption_version_ids: string[];
    human_review_status: string;
    created_at: string;
  } | null;
}

export async function fetchEvidenceTrail(params: {
  sourceId?: string;
  assumptionKey?: string;
  projectId?: string;
}): Promise<EvidenceTrail | null> {
  try {
    const qs = new URLSearchParams();
    if (params.sourceId) qs.set("source_id", params.sourceId);
    if (params.assumptionKey) qs.set("assumption_key", params.assumptionKey);
    if (params.projectId) qs.set("project_id", params.projectId);
    const res = await fetch(`/api/evidence?${qs}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { ok: boolean; trail?: EvidenceTrail; warnings?: string[] };
    for (const w of json.warnings ?? []) console.warn("[powerpath]", w);
    return json.ok && json.trail ? json.trail : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// reviewLiveUpdate — approve/ignore a DB market update by id (the same trust-gated
// routes the fixture card uses). Returns the outcome; never throws for the UI.
// ---------------------------------------------------------------------
export async function reviewLiveUpdate(
  id: string,
  decision: "approve" | "ignore",
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const res = await fetch(`/api/market-updates/${encodeURIComponent(id)}/${decision}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewer: "Demo Reviewer" }),
    });
    const json = (await res.json()) as { ok: boolean; error?: string; warnings?: string[] };
    for (const w of json.warnings ?? []) console.warn("[powerpath]", w);
    return { ok: res.ok && json.ok, error: res.ok && json.ok ? null : (json.error ?? `HTTP ${res.status}`) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------
// fetchSolarResource — live NASA POWER solar resource lookup (/api/solar-resource).
// Evidence only: the value never changes scenario results or assumptions; it is
// shown so a human can compare it against the seeded solar assumption. Returns a
// safe error shape on any failure so the UI never breaks.
// ---------------------------------------------------------------------
export interface SolarResourceResult {
  ok: boolean;
  source: string;
  provenance: "live_nasa_power" | "demo_fallback" | "unavailable";
  average_daily_solar_radiation: number | null; // kWh/m²/day
  estimated_annual_solar_resource: number | null; // kWh/m²/year
  data_points: number;
  fetched_at: string | null;
  disclaimer: string;
  caveat: string | null;
  error: string | null;
}

export async function fetchSolarResource(params?: {
  lat?: number;
  lon?: number;
  start?: string;
  end?: string;
}): Promise<SolarResourceResult> {
  try {
    const qs = new URLSearchParams();
    if (params?.lat !== undefined) qs.set("lat", String(params.lat));
    if (params?.lon !== undefined) qs.set("lon", String(params.lon));
    if (params?.start) qs.set("start", params.start);
    if (params?.end) qs.set("end", params.end);
    const res = await fetch(`/api/solar-resource${qs.size > 0 ? `?${qs}` : ""}`);
    const json = (await res.json()) as Partial<SolarResourceResult> & { ok: boolean; warnings?: string[] };
    for (const w of json.warnings ?? []) console.warn("[powerpath]", w);
    if (res.ok && json.ok) {
      return {
        ok: true,
        source: json.source ?? "NASA POWER",
        provenance: json.provenance ?? "live_nasa_power",
        average_daily_solar_radiation: json.average_daily_solar_radiation ?? null,
        estimated_annual_solar_resource: json.estimated_annual_solar_resource ?? null,
        data_points: json.data_points ?? 0,
        fetched_at: json.fetched_at ?? null,
        disclaimer: json.disclaimer ?? "Not final PV engineering yield",
        caveat: json.caveat ?? null,
        error: null,
      };
    }
    return unavailableSolarResource(json.error ?? `HTTP ${res.status}`);
  } catch (e) {
    return unavailableSolarResource(e instanceof Error ? e.message : String(e));
  }
}

function unavailableSolarResource(error: string): SolarResourceResult {
  return {
    ok: false,
    source: "unavailable",
    provenance: "unavailable",
    average_daily_solar_radiation: null,
    estimated_annual_solar_resource: null,
    data_points: 0,
    fetched_at: null,
    disclaimer: "Not final PV engineering yield",
    caveat: null,
    error,
  };
}

// ---------------------------------------------------------------------
// rerunStrategy — recompute + INSERT new scenario_results rows (via /api/analyze)
// ---------------------------------------------------------------------
export async function rerunStrategy(
  study: StudyProject,
  assumptions: AssumptionSet,
  settings: RefinementSettings,
): Promise<AnalysisResult> {
  return runAnalysis(study, assumptions, settings);
}

// ---------------------------------------------------------------------
// rerunStrategyDb — DATABASE-BACKED rerun (/api/rerun-strategy): recomputes from
// the ACTIVE approved assumption set, saves a new scenario_results run, writes an
// audit_logs event, and refreshes the memo draft (pending_review) in one call.
// Falls back to the local engine path on infrastructure failure.
// ---------------------------------------------------------------------
export interface DbRerunResult extends AnalysisResult {
  memo: MemoVersionRecord | null;
  assumption_set_version: string | null;
}

export async function rerunStrategyDb(
  study: StudyProject,
  fallbackAssumptions: AssumptionSet,
  settings?: RefinementSettings,
): Promise<DbRerunResult> {
  try {
    const res = await fetch("/api/rerun-strategy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ study, settings }),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        ok: boolean;
        scenarios?: ScenarioResult[];
        recommendation?: Recommendation;
        settings?: RefinementSettings;
        persisted_result_ids?: string[];
        memo?: MemoVersionRecord | null;
        assumption_set_version?: string;
        warnings?: string[];
      };
      if (json.ok && json.scenarios && json.recommendation && json.settings) {
        for (const w of json.warnings ?? []) console.warn("[powerpath]", w);
        return {
          scenarios: json.scenarios,
          recommendation: json.recommendation,
          settings: json.settings,
          persisted_result_ids: json.persisted_result_ids ?? [],
          memo: json.memo ?? null,
          assumption_set_version: json.assumption_set_version ?? null,
        };
      }
    }
    console.warn(`[powerpath] db rerun HTTP ${res.status} — falling back to local engine`);
  } catch (e) {
    console.warn("[powerpath] db rerun unreachable — falling back to local engine", e);
  }
  const local = await runAnalysis(study, fallbackAssumptions, settings);
  return { ...local, memo: null, assumption_set_version: null };
}

// ---------------------------------------------------------------------
// generateMemo — future: INSERT INTO memo_versions
// ---------------------------------------------------------------------
export function buildMemoSections(
  study: StudyProject,
  input: StudyInput,
  scenarios: ScenarioResult[],
  rec: Recommendation,
  update: MarketUpdateRecord,
): MemoSection[] {
  const pick = scenarios.find((s) => s.scenario_key === rec.scenario_key)!;
  const options = scenarios.filter((s) => s.scenario_key !== "baseline_grid" && s.available);
  return [
    {
      key: "executive_recommendation",
      title: "Executive recommendation",
      body: `Pursue ${rec.scenario_name}: ~${fmtMYR(pick.annual_savings, { compact: true })}/yr saving, ${fmtPct(pick.renewable_share, 0)} renewable, carbon −${fmtPct(pick.carbon_reduction, 0)}. ${rec.rationale}`,
    },
    {
      key: "baseline",
      title: "Current energy baseline",
      body: `${fmtMYR(input.annual_cost, { compact: true })}/yr · ${(input.annual_use_kwh / 1e6).toFixed(1)} GWh · ${(input.peak_demand_kw / 1000).toFixed(1)} MW peak · RM${input.tariff_rm_per_kwh.toFixed(3)}/kWh · ~${Math.round(input.carbon_baseline_t).toLocaleString()} tCO₂e/yr (${study.data_status === "sample_case" ? "sample data" : "user-entered data"}).`,
    },
    {
      key: "market_updates",
      title: "Market updates considered",
      body: update.applies_to_study
        ? `CRESS SAC ${update.before_value} → ${update.after_value} ${update.unit} — ${update.human_review_status === "approved" ? "approved and applied" : "detected, awaiting approval"}.`
        : `Malaysia CRESS SAC update shown as example only — not applied (study country: ${study.country}).`,
    },
    {
      key: "scenarios",
      title: "Scenarios compared",
      body: options
        .map((s) => `${s.name}: ${fmtMYR(s.annual_cost, { compact: true })}/yr, ${fmtPct(s.renewable_share, 0)} RE`)
        .join(" · "),
    },
    {
      key: "pathway",
      title: "Recommended pre-feasibility pathway",
      body: `Phase 1: validation (survey, quotes, interval data). Phase 2: contract & build toward ${input.re_target_pct}% renewable by ${input.re_target_year}.`,
    },
    {
      key: "adjusted_assumptions",
      title: "Human-adjusted assumptions",
      body: `Objective: ${study.main_objective.replace("_", "-")} · budget preference: ${study.budget_preference} · risk appetite: ${study.risk_appetite} · reliability: ${study.reliability_requirement}.`,
    },
    {
      key: "benchmark",
      title: "Similar asset benchmark",
      body: "Comparable sites pursuing solar-led strategies typically target 20–40% RE in phase one. Illustrative demo benchmark — not verified market data.",
    },
    {
      key: "validation",
      title: "Validation checklist",
      body: "Roof/structural survey · supplier pricing quotes · 12 months of interval data · grid connection study (no approval claimed) · detailed financial model.",
    },
    {
      key: "next_actions",
      title: "Next actions",
      body: "Approve memo internally · commission surveys and quotes · upload real bills to replace estimates.",
    },
  ];
}

export async function generateMemo(params: {
  study: StudyProject;
  input: StudyInput;
  scenarios: ScenarioResult[];
  recommendation: Recommendation;
  update: MarketUpdateRecord;
  assumptionRecords: AssumptionVersionRecord[];
  previousVersion: number;
  assumptionSetVersion: string;
  scenarioResultIds: string[]; // stored scenario_results rows this memo is built from
}): Promise<MemoVersionRecord> {
  const { study, input, scenarios, recommendation, update, previousVersion } = params;
  const approved = update.applies_to_study && update.human_review_status === "approved";
  const memo: MemoVersionRecord = {
    id: newId("memo"),
    project_id: study.id,
    version: previousVersion + 1,
    memo_type: "cfo",
    content: buildMemoSections(study, input, scenarios, recommendation, update),
    scenario_result_ids: params.scenarioResultIds,
    market_update_ids: update.applies_to_study ? [update.id] : [],
    assumption_version_ids: params.assumptionRecords.filter((a) => a.active).map((a) => a.id),
    human_review_status: approved ? "approved" : "pending_review",
    approved_at: approved ? nowIso() : null,
    created_at: nowIso(),
    assumption_set_version: params.assumptionSetVersion,
    persisted: false,
  };

  // Persist (future: this whole function moves server-side). Local fallback keeps
  // the memo usable when the study is local-only or the database is unreachable.
  if (study.persisted) {
    try {
      const res = await fetch("/api/memos/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(memo),
      });
      if (res.ok) {
        const json = (await res.json()) as { ok: boolean; version?: number; warning?: string };
        if (json.ok) {
          if (json.warning) console.warn("[powerpath]", json.warning);
          return { ...memo, version: json.version ?? memo.version, persisted: true };
        }
      }
      console.warn(`[powerpath] memo not persisted (HTTP ${res.status}) — kept local`);
    } catch (e) {
      console.warn("[powerpath] memo not persisted (network) — kept local", e);
    }
  }
  return memo;
}
