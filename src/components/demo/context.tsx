"use client";

// App state for Powerpath.
//
// Every state transition goes through the Supabase-ready adapters in src/lib/study.ts
// (createStudy, loadSampleStudy, updateStudy, runAnalysis, approveMarketUpdate,
// rerunStrategy, generateMemo). This context only holds the returned records in local
// React state — swapping the adapters to Supabase later does not change this file's
// consumers.

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type {
  AssumptionSet,
  AssumptionVersionRecord,
  BudgetPreference,
  DemoData,
  MainObjective,
  MarketUpdateRecord,
  MemoVersionRecord,
  Recommendation,
  RefinementSettings,
  ReliabilityRequirement,
  RiskAppetite,
  ScenarioKey,
  ScenarioResult,
  ScenarioTag,
  StudyInput,
  StudyProject,
  UserType,
} from "@/lib/types";
import { tagFor } from "@/lib/energy/rankScenarios";
import { utilityForState } from "@/lib/tariffs";
import {
  adaptMarketUpdate,
  approveMarketUpdate,
  assumptionRecords,
  createStudy,
  fetchMarketUpdateStatus,
  generateMemo,
  ignoreMarketUpdate,
  isMalaysia,
  listLiveMarketUpdates,
  listStudies,
  loadSampleStudy,
  openStudy,
  rerunStrategy,
  rerunStrategyDb,
  runAnalysis,
  syncCressSource,
  toStudyInput,
} from "@/lib/study";
import type { LiveMarketUpdate, SourceSyncResult } from "@/lib/study";

export type EvidenceRef =
  | { type: "assumption"; id: string }
  | { type: "scenario"; id: ScenarioKey }
  | { type: "source"; id: string }
  | { type: "trust" };

export type Phase = "landing" | "wizard" | "workspace";

// Before/after row for the rerun-impact panel (deterministic diff of two runs).
export interface RerunImpactRow {
  scenario_key: ScenarioKey;
  name: string;
  before_cost: number | null;
  after_cost: number;
  delta_cost: number | null;
}

export const NAV = [
  { n: 1, key: "setup", label: "Study Setup" },
  { n: 2, key: "baseline", label: "Baseline" },
  { n: 3, key: "scenarios", label: "Scenarios" },
  { n: 4, key: "market", label: "Market Intelligence" },
  { n: 5, key: "refine", label: "Refinement" },
  { n: 6, key: "recommend", label: "Recommendation" },
  { n: 7, key: "memo", label: "Memo" },
] as const;

// Wizard draft — string fields so inputs stay controlled; validated on submit.
export interface StudyDraft {
  project_name: string;
  country: string;
  business_type: string;
  user_type: UserType;
  site_location: string;
  // Guided tariff selector (category REFERENCE only — never a rate)
  state: string;
  supply_voltage_level: string;
  tariff_category: string; // display name (selected or free-text fallback)
  tariff_code: string; // "" = free-text/unvalidated
  tariff_source_id: string;
  tariff_verification_status: string;
  monthly_consumption_kwh: string;
  peak_demand_kw: string;
  annual_cost: string;
  monthly_bill: string;
  average_unit_cost: string;
  carbon_baseline: string;
  current_re_share: string;
  renewable_target_percent: string;
  renewable_target_year: string;
  expansion_load_kw: string;
  budget_preference: BudgetPreference;
  reliability_requirement: ReliabilityRequirement;
  main_objective: MainObjective;
  risk_appetite: RiskAppetite;
}

export const EMPTY_DRAFT: StudyDraft = {
  project_name: "",
  country: "Malaysia",
  business_type: "",
  user_type: "factory",
  site_location: "",
  state: "",
  supply_voltage_level: "",
  tariff_category: "",
  tariff_code: "",
  tariff_source_id: "",
  tariff_verification_status: "",
  monthly_consumption_kwh: "",
  peak_demand_kw: "",
  annual_cost: "",
  monthly_bill: "",
  average_unit_cost: "",
  carbon_baseline: "",
  current_re_share: "0",
  renewable_target_percent: "40",
  renewable_target_year: "2030",
  expansion_load_kw: "0",
  budget_preference: "medium",
  reliability_requirement: "standard",
  main_objective: "balanced",
  risk_appetite: "medium",
};

interface DemoContextValue {
  data: DemoData;
  // ---- flow ----
  phase: Phase;
  startNewStudy: () => void;
  backToLanding: () => void;
  wizardStep: number;
  setWizardStep: (n: number) => void;
  draft: StudyDraft;
  setDraft: (d: StudyDraft) => void;
  submitStudy: () => Promise<void>;
  loadSample: () => Promise<void>;
  savedStudies: StudyProject[];
  refreshStudies: () => Promise<void>;
  openSavedStudy: (id: string) => Promise<void>;
  // ---- workspace ----
  nav: number;
  goTo: (n: number) => void;
  study: StudyProject | null;
  studyIsMalaysia: boolean;
  input: StudyInput | null;
  scenarios: ScenarioResult[];
  recommendation: Recommendation | null;
  tags: Partial<Record<ScenarioKey, ScenarioTag>>;
  settings: RefinementSettings | null;
  applySettings: (s: RefinementSettings) => Promise<void>;
  strategySaved: boolean;
  saveStrategy: () => void;
  // ---- closed loop ----
  marketUpdate: MarketUpdateRecord | null;
  applied: boolean;
  approveUpdate: () => Promise<void>;
  ignored: boolean;
  ignoreUpdate: () => Promise<void>;
  rerunDb: (justApproved?: boolean) => Promise<void>;
  rerunImpact: RerunImpactRow[] | null;
  // ---- live source sync (detection only — never changes assumptions) ----
  syncing: boolean;
  lastSync: SourceSyncResult | null;
  syncSources: () => Promise<void>;
  liveUpdates: LiveMarketUpdate[];
  refreshLiveUpdates: () => Promise<void>;
  assumptionsActive: AssumptionSet;
  versionLabel: string;
  assumptionRecordsAll: AssumptionVersionRecord[];
  // ---- memo ----
  memos: MemoVersionRecord[];
  latestMemo: MemoVersionRecord | null;
  createMemo: () => Promise<void>;
  // ---- evidence ----
  evidence: EvidenceRef | null;
  openEvidence: (ref: EvidenceRef) => void;
  closeEvidence: () => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ data, children }: { data: DemoData; children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>("landing");
  const [wizardStep, setWizardStep] = useState(1);
  const [draft, setDraft] = useState<StudyDraft>(EMPTY_DRAFT);
  const [nav, setNav] = useState(2);
  const [study, setStudy] = useState<StudyProject | null>(null);
  const [applied, setApplied] = useState(false);
  const [ignored, setIgnored] = useState(false);
  const [rerunImpact, setRerunImpact] = useState<RerunImpactRow[] | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioResult[]>([]);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [settings, setSettings] = useState<RefinementSettings | null>(null);
  const [strategySaved, setStrategySaved] = useState(false);
  const [memos, setMemos] = useState<MemoVersionRecord[]>([]);
  const [evidence, setEvidence] = useState<EvidenceRef | null>(null);
  const [savedStudies, setSavedStudies] = useState<StudyProject[]>([]);
  const [resultIds, setResultIds] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SourceSyncResult | null>(null);
  const [liveUpdates, setLiveUpdates] = useState<LiveMarketUpdate[]>([]);

  const assumptionsActive = applied ? data.assumptionsV2 : data.assumptionsV1;
  const versionLabel = `v${assumptionsActive.meta.version}`;
  const ef = assumptionsActive.assumptions.find((a) => a.id === "ASM-GRID-EMISSION-FACTOR")?.value ?? 0.74;

  const input = useMemo(() => (study ? toStudyInput(study, ef) : null), [study, ef]);
  const studyIsMalaysia = study ? isMalaysia(study) : true;

  const marketUpdate = useMemo(
    () => (study && input ? adaptMarketUpdate(data.marketUpdate, study, input, applied, data.sources) : null),
    [data.marketUpdate, study, input, applied, data.sources],
  );

  const assumptionRecordsAll = useMemo(
    () => [
      ...assumptionRecords(data.assumptionsV1, !applied),
      ...assumptionRecords(data.assumptionsV2, applied),
    ],
    [data.assumptionsV1, data.assumptionsV2, applied],
  );

  const tags = useMemo(() => {
    const t: Partial<Record<ScenarioKey, ScenarioTag>> = {};
    if (recommendation) for (const s of scenarios) t[s.scenario_key] = tagFor(s, recommendation);
    return t;
  }, [scenarios, recommendation]);

  // ---- adapter-backed actions ----
  const analyse = useCallback(
    async (s: StudyProject, set: AssumptionSet, override?: RefinementSettings) => {
      const res = await runAnalysis(s, set, override);
      setScenarios(res.scenarios);
      setRecommendation(res.recommendation);
      setSettings(res.settings);
      setResultIds(res.persisted_result_ids);
    },
    [],
  );

  // Read the persisted review state so a fresh session reflects database truth —
  // an approval or ignore recorded earlier survives reloads (no phantom "pending").
  const syncUpdateState = useCallback(
    async (s: StudyProject): Promise<{ dbApplied: boolean; dbIgnored: boolean }> => {
      if (!isMalaysia(s)) return { dbApplied: false, dbIgnored: false };
      const st = await fetchMarketUpdateStatus(data.marketUpdate.id);
      const dbApplied = st ? ["approved", "approved_demo"].includes(st.human_review_status) : false;
      const dbIgnored = st ? ["ignored", "rejected"].includes(st.human_review_status) : false;
      return { dbApplied, dbIgnored };
    },
    [data.marketUpdate.id],
  );

  const submitStudy = useCallback(async () => {
    const n = (v: string, fallback = 0) => {
      const x = parseFloat(v.replace(/[, ]/g, ""));
      return Number.isFinite(x) ? x : fallback;
    };
    const s = await createStudy({
      project_name: draft.project_name.trim() || "Untitled study",
      country: draft.country.trim() || "Malaysia",
      business_type: draft.business_type.trim() || "—",
      user_type: draft.user_type,
      site_location: draft.site_location.trim() || "—",
      tariff_category: draft.tariff_category.trim() || "—",
      state: draft.state.trim() || undefined,
      region: utilityForState(draft.state)?.region,
      utility: utilityForState(draft.state)?.utility,
      supply_voltage_level: draft.supply_voltage_level || undefined,
      tariff_code: draft.tariff_code || null,
      tariff_source_id: draft.tariff_source_id || null,
      tariff_verification_status: draft.tariff_verification_status || null,
      monthly_consumption_kwh: n(draft.monthly_consumption_kwh),
      peak_demand_kw: n(draft.peak_demand_kw),
      monthly_bill: n(draft.monthly_bill),
      annual_cost: n(draft.annual_cost) || n(draft.monthly_bill) * 12,
      average_unit_cost: draft.average_unit_cost.trim() === "" ? null : n(draft.average_unit_cost),
      carbon_baseline: draft.carbon_baseline.trim() === "" ? null : n(draft.carbon_baseline),
      current_re_share: n(draft.current_re_share),
      renewable_target_percent: n(draft.renewable_target_percent, 40),
      renewable_target_year: n(draft.renewable_target_year, 2030),
      expansion_load_kw: n(draft.expansion_load_kw),
      budget_preference: draft.budget_preference,
      reliability_requirement: draft.reliability_requirement,
      main_objective: draft.main_objective,
      risk_appetite: draft.risk_appetite,
    });
    setStudy(s);
    const flags = await syncUpdateState(s);
    setApplied(flags.dbApplied);
    setIgnored(flags.dbIgnored);
    setMemos([]);
    setStrategySaved(false);
    await analyse(s, flags.dbApplied ? data.assumptionsV2 : data.assumptionsV1);
    setPhase("workspace");
    setNav(2); // land on Baseline
  }, [draft, analyse, data.assumptionsV1, data.assumptionsV2, syncUpdateState]);

  const loadSample = useCallback(async () => {
    const s = await loadSampleStudy(data.baseline);
    setStudy(s);
    const flags = await syncUpdateState(s);
    setApplied(flags.dbApplied);
    setIgnored(flags.dbIgnored);
    setMemos([]);
    setStrategySaved(false);
    await analyse(s, flags.dbApplied ? data.assumptionsV2 : data.assumptionsV1);
    setPhase("workspace");
    setNav(2);
  }, [data.baseline, analyse, data.assumptionsV1, data.assumptionsV2, syncUpdateState]);

  const refreshStudies = useCallback(async () => {
    setSavedStudies(await listStudies());
  }, []);

  const openSavedStudy = useCallback(
    async (id: string) => {
      const s = await openStudy(id);
      if (!s) return;
      setStudy(s);
      const flags = await syncUpdateState(s);
      setApplied(flags.dbApplied);
      setIgnored(flags.dbIgnored);
      setMemos([]);
      setStrategySaved(false);
      await analyse(s, flags.dbApplied ? data.assumptionsV2 : data.assumptionsV1);
      setPhase("workspace");
      setNav(2);
    },
    [analyse, data.assumptionsV1, data.assumptionsV2, syncUpdateState],
  );

  // Database-backed rerun: recompute from the ACTIVE approved assumption set,
  // persist a new scenario_results run + audit event + refreshed memo draft,
  // and record the before/after impact for the UI.
  const rerunDb = useCallback(async (justApproved = false) => {
    if (!study) return;
    const before = scenarios; // snapshot for the impact panel
    const useV2 = applied || justApproved; // fallback-path assumption set only; the route always uses the DB active set
    const res = await rerunStrategyDb(study, useV2 ? data.assumptionsV2 : data.assumptionsV1, settings ?? undefined);
    setScenarios(res.scenarios);
    setRecommendation(res.recommendation);
    setSettings(res.settings);
    setResultIds(res.persisted_result_ids);
    if (res.memo) setMemos((prev) => [...prev, res.memo!]);
    setRerunImpact(
      res.scenarios
        .filter((s) => s.available)
        .map((s) => {
          const prev = before.find((b) => b.scenario_key === s.scenario_key);
          return {
            scenario_key: s.scenario_key,
            name: s.name,
            before_cost: prev?.annual_cost ?? null,
            after_cost: s.annual_cost,
            delta_cost: prev ? s.annual_cost - prev.annual_cost : null,
          };
        })
        .filter((i) => i.delta_cost !== null && i.delta_cost !== 0),
    );
  }, [study, scenarios, settings, applied, data.assumptionsV1, data.assumptionsV2]);

  // Live source sync: fetch + snapshot the verified ST/PETRA source. Detection
  // only — a changed source creates a PENDING market_updates row; assumptions and
  // scenario results stay exactly as they are until a human approves.
  const refreshLiveUpdates = useCallback(async () => {
    setLiveUpdates(await listLiveMarketUpdates("SRC-CRESS-SAC"));
  }, []);

  const syncSources = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await syncCressSource();
      setLastSync(res);
      if (res.ok) await refreshLiveUpdates();
    } finally {
      setSyncing(false);
    }
  }, [syncing, refreshLiveUpdates]);

  const approveUpdate = useCallback(async () => {
    // Gated: Malaysia study + verified-official source only.
    if (!study || !marketUpdate || !marketUpdate.applies_to_study || !marketUpdate.source_verified) return;
    const source = data.sources.find((s) => s.id === marketUpdate.source_id);
    // Persists to Supabase: market_updates + human_reviews + assumption_versions
    // activation (audit_logs via trigger). Throws on policy rejection.
    await approveMarketUpdate(marketUpdate, source);
    setApplied(true);
    setIgnored(false);
    // Database-backed rerun from the now-active approved set; memo draft refreshes.
    await rerunDb(true);
  }, [study, marketUpdate, data.sources, rerunDb]);

  const ignoreUpdate = useCallback(async () => {
    // Records the decision (market_updates + human_reviews + audit_logs); creates
    // NO assumption version — the model stays exactly as it was.
    if (!study || !marketUpdate || !marketUpdate.applies_to_study || applied || ignored) return;
    await ignoreMarketUpdate(marketUpdate);
    setIgnored(true);
  }, [study, marketUpdate, applied, ignored]);

  const applySettings = useCallback(
    async (s: RefinementSettings) => {
      if (!study) return;
      setStrategySaved(false);
      const res = await rerunStrategy(study, applied ? data.assumptionsV2 : data.assumptionsV1, s);
      setScenarios(res.scenarios);
      setRecommendation(res.recommendation);
      setResultIds(res.persisted_result_ids);
      setSettings(s);
    },
    [study, applied, data.assumptionsV1, data.assumptionsV2],
  );

  const createMemo = useCallback(async () => {
    if (!study || !input || !recommendation || !marketUpdate) return;
    const memo = await generateMemo({
      study,
      input,
      scenarios,
      recommendation,
      update: marketUpdate,
      assumptionRecords: assumptionRecordsAll,
      previousVersion: memos.length > 0 ? memos[memos.length - 1].version : 0,
      assumptionSetVersion: versionLabel,
      scenarioResultIds: resultIds,
    });
    setMemos((prev) => [...prev, memo]);
  }, [study, input, recommendation, marketUpdate, scenarios, assumptionRecordsAll, memos, versionLabel, resultIds]);

  const value: DemoContextValue = {
    data,
    phase,
    startNewStudy: () => {
      setDraft(EMPTY_DRAFT);
      setWizardStep(1);
      setPhase("wizard");
    },
    backToLanding: () => setPhase("landing"),
    wizardStep,
    setWizardStep,
    draft,
    setDraft,
    submitStudy,
    loadSample,
    savedStudies,
    refreshStudies,
    openSavedStudy,
    nav,
    goTo: setNav,
    study,
    studyIsMalaysia,
    input,
    scenarios,
    recommendation,
    tags,
    settings,
    applySettings,
    strategySaved,
    saveStrategy: () => setStrategySaved(true),
    marketUpdate,
    applied,
    approveUpdate,
    ignored,
    ignoreUpdate,
    rerunDb,
    rerunImpact,
    syncing,
    lastSync,
    syncSources,
    liveUpdates,
    refreshLiveUpdates,
    assumptionsActive,
    versionLabel,
    assumptionRecordsAll,
    memos,
    latestMemo: memos.length > 0 ? memos[memos.length - 1] : null,
    createMemo,
    evidence,
    openEvidence: setEvidence,
    closeEvidence: () => setEvidence(null),
  };

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoContextValue {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used within DemoProvider");
  return ctx;
}
