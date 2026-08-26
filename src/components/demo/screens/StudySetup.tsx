"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Database,
  FlaskConical,
  FolderOpen,
  Globe2,
  PencilLine,
  Play,
  Satellite,
  Target,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fmtMYR } from "@/lib/format";
import type { DataStatus } from "@/lib/types";
import {
  DEMO_TARIFF_REGISTRY,
  MALAYSIA_STATES,
  VOLTAGE_LEVELS,
  filterTariffOptions,
  utilityForState,
  type SupplyVoltageLevel,
  type TariffOption,
} from "@/lib/tariffs";
import { BRAND } from "@/lib/brand";
import type { StudyDraft } from "../context";
import { useDemo } from "../context";
import { DemoBadge, PanelTitle, PreFeasBadge } from "../shared";

// ---------- Data roadmap (visible product honesty) ----------
export function DataRoadmap({ dataStatus, persisted }: { dataStatus?: DataStatus; persisted?: boolean }) {
  const rows = [
    {
      icon: FlaskConical,
      label: "Study data",
      status: dataStatus === "sample_case" ? "Sample case" : dataStatus === "user_entered" ? "User-entered" : dataStatus === "demo_grade" ? "Demo-grade" : "Entered locally",
      state: "now" as const,
    },
    { icon: Globe2, label: "Market data", status: "Official source sync — next", state: "next" as const },
    { icon: Satellite, label: "Solar data", status: "NASA POWER API — next", state: "next" as const },
    {
      icon: Database,
      label: "Database",
      status: persisted === undefined ? "Supabase connected" : persisted ? "Saved to Supabase" : "Local only (Supabase unavailable)",
      state: (persisted === false ? "next" : "now") as "now" | "next",
    },
  ];
  return (
    <div className="rounded-xl border bg-card/60 p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Real-data roadmap
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2 text-xs">
            <r.icon className={cn("size-3.5", r.state === "now" ? "text-emerald-400" : "text-muted-foreground/50")} />
            <span className="w-24 text-muted-foreground">{r.label}</span>
            <span className={cn("flex-1", r.state === "now" ? "text-emerald-300" : "text-muted-foreground")}>{r.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Small form primitives ----------
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[10px] text-muted-foreground/70">{hint}</div>}
    </label>
  );
}

function TextField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-9" />;
}

function NumField({ value, onChange, placeholder, unit }: { value: string; onChange: (v: string) => void; placeholder?: string; unit?: string }) {
  return (
    <div className="relative">
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode="decimal" className="h-9 pr-16" />
      {unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{unit}</span>}
    </div>
  );
}

function SelectField<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none transition-colors focus:ring-2 focus:ring-ring/50 [&>option]:bg-popover"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

const WIZARD_STEPS = ["Project setup", "Energy baseline", "Strategic goals", "Review & run"];

// ---------- Step 1: project setup with the guided tariff selector ----------
// Country → State → Utility (auto) → User type → Supply voltage → Tariff category.
// The selection stores a category REFERENCE (id + display name + source), never a
// rate — the engine keeps deriving the unit cost from the bill in step 2.
function ProjectSetupStep({
  d,
  set,
  nonMalaysia,
}: {
  d: StudyDraft;
  set: (patch: Partial<StudyDraft>) => void;
  nonMalaysia: boolean;
}) {
  const { tariffs, provenance } = useTariffRegistry("Malaysia");
  const isMalaysia = d.country.trim().toLowerCase() === "malaysia";
  const util = isMalaysia && d.state ? utilityForState(d.state) : null;

  const clearTariff = { tariff_category: "", tariff_code: "", tariff_source_id: "", tariff_verification_status: "" };
  const options =
    util?.supported
      ? filterTariffOptions(tariffs, {
          utility: util.utility,
          voltage: (d.supply_voltage_level as SupplyVoltageLevel) || "",
          user_type: d.user_type,
        })
      : [];
  const selected = options.find((t) => t.id === d.tariff_code) ?? null;
  const tariffDisabled = !util || !util.supported || options.length === 0;

  return (
    <div className="space-y-4">
      <PanelTitle>1 · Project setup</PanelTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project name">
          <TextField value={d.project_name} onChange={(v) => set({ project_name: v })} placeholder="e.g. Penang Plant Energy Study" />
        </Field>
        <Field label="Country" hint={nonMalaysia ? "Limited demo module — country-specific rules not fully connected yet." : "Malaysia module: CRESS + Solar ATAP frameworks"}>
          <SelectField
            value={isMalaysia ? "Malaysia" : "other"}
            onChange={(v) =>
              v === "Malaysia"
                ? set({ country: "Malaysia", ...clearTariff })
                : set({ country: "Other", state: "", supply_voltage_level: "", ...clearTariff })
            }
            options={[
              { value: "Malaysia", label: "Malaysia" },
              { value: "other", label: "Other country (limited demo module)" },
            ]}
          />
        </Field>
        {!isMalaysia && (
          <Field label="Country name">
            <TextField value={d.country === "Other" ? "" : d.country} onChange={(v) => set({ country: v || "Other" })} placeholder="e.g. Vietnam" />
          </Field>
        )}
        <Field label="Business type">
          <TextField value={d.business_type} onChange={(v) => set({ business_type: v })} placeholder="e.g. Electronics manufacturing" />
        </Field>
        <Field label="User type">
          <SelectField
            value={d.user_type}
            onChange={(v) => set({ user_type: v })}
            options={[
              { value: "factory", label: "Factory" },
              { value: "data_centre", label: "Data centre" },
              { value: "industrial_park", label: "Industrial park" },
              { value: "commercial_building", label: "Commercial building" },
              { value: "cold_storage", label: "Cold storage" },
              { value: "campus_hospital", label: "Campus / hospital" },
            ]}
          />
        </Field>
        <Field label="Site location">
          <TextField value={d.site_location} onChange={(v) => set({ site_location: v })} placeholder="e.g. Bayan Lepas, Penang" />
        </Field>

        {isMalaysia ? (
          <>
            <Field label="State / region">
              <SelectField
                value={d.state}
                onChange={(v) => set({ state: v, ...clearTariff })}
                options={[
                  { value: "", label: "Select state…" },
                  ...MALAYSIA_STATES.map((s) => ({ value: s, label: s })),
                ]}
              />
            </Field>
            <Field label="Utility / market" hint="Auto-detected from the state — never assumed across regions.">
              <div className={cn("flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm", !util && "text-muted-foreground")}>
                {util ? util.utility_label : "Select a state first"}
              </div>
            </Field>
            <Field label="Supply voltage / connection level">
              <SelectField
                value={d.supply_voltage_level}
                onChange={(v) => set({ supply_voltage_level: v, ...clearTariff })}
                options={[{ value: "", label: "Select level…" }, ...VOLTAGE_LEVELS.map((l) => ({ value: l.value as string, label: l.label }))]}
              />
            </Field>
            <Field label="Tariff category" hint={tariffDisabled ? undefined : "Reference categories from the tariff registry — not tariff-grade billing."}>
              <SelectField
                value={d.tariff_code}
                onChange={(v) => {
                  const t = options.find((o) => o.id === v);
                  set(
                    t
                      ? {
                          tariff_code: t.id,
                          tariff_category: t.display_name,
                          tariff_source_id: t.source_id ?? "",
                          tariff_verification_status: t.verification_status,
                        }
                      : clearTariff,
                  );
                }}
                options={[
                  { value: "", label: tariffDisabled ? "No verified options for this selection" : "Select tariff category…" },
                  ...options.map((t) => ({ value: t.id, label: t.display_name })),
                ]}
              />
            </Field>
          </>
        ) : (
          <Field label="Tariff category (free text)" hint="No tariff registry for this country yet — stored as unvalidated text.">
            <TextField value={d.tariff_category} onChange={(v) => set({ tariff_category: v, tariff_code: "", tariff_source_id: "", tariff_verification_status: "" })} placeholder="e.g. MV Industrial" />
          </Field>
        )}
      </div>

      {/* Selected tariff evidence: source + caveat + verification badge */}
      {selected && (
        <div className="rounded-lg border bg-background/40 p-3 text-[11px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{selected.display_name}</span>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px]",
                selected.verification_status === "verified_official"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-300",
              )}
            >
              {selected.verification_status === "verified_official" ? "Verified source" : "Demo-grade / pending verification"}
            </span>
            <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              {provenance === "supabase" ? "Registry: Supabase" : "Registry: demo fallback"}
            </span>
          </div>
          {selected.description && <p className="mt-1.5 text-muted-foreground">{selected.description}</p>}
          {selected.legacy_label && <p className="mt-1 text-muted-foreground/80">{selected.legacy_label}</p>}
          <p className="mt-1.5 text-amber-200/90">
            {selected.caveat} Source: {selected.source_id ?? "—"}.
          </p>
        </div>
      )}

      {isMalaysia && util && !util.supported && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] text-amber-200/90">
          {util.utility_label}. Tariff categories for this region are not connected yet and TNB (Peninsular)
          categories are never applied here. Enter your average unit cost manually in step 2 — the analysis
          still works from your bill data.
        </p>
      )}
      {isMalaysia && util?.supported && tariffDisabled && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] text-amber-200/90">
          No tariff category references available for this selection — enter your average unit cost manually
          in step 2. The analysis works from your bill data either way.
        </p>
      )}
      {!isMalaysia && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] text-amber-200/90">
          Limited demo module — no tariff registry for this country yet. The tariff category is stored as
          unvalidated free text, and the average unit cost comes from your bill in step 2.
        </p>
      )}
    </div>
  );
}

// Tariff registry hook: Supabase-backed via /api/tariffs, code fallback on any
// failure so the wizard always works. Category references only — never rates.
function useTariffRegistry(country: string): { tariffs: TariffOption[]; provenance: string } {
  const [tariffs, setTariffs] = useState<TariffOption[]>(DEMO_TARIFF_REGISTRY);
  const [provenance, setProvenance] = useState("demo_fallback");
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/tariffs?country=${encodeURIComponent(country || "Malaysia")}`);
        const json = (await res.json()) as { ok: boolean; tariffs?: TariffOption[]; provenance?: string; warning?: string };
        if (json.warning) console.warn("[powerpath]", json.warning);
        if (alive && json.ok && json.tariffs) {
          setTariffs(json.tariffs);
          setProvenance(json.provenance ?? "demo_fallback");
        }
      } catch {
        /* keep the code fallback */
      }
    })();
    return () => { alive = false; };
  }, [country]);
  return { tariffs, provenance };
}

// ---------- Landing ----------
function SavedStudies() {
  const { savedStudies, refreshStudies, openSavedStudy } = useDemo();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    refreshStudies().finally(() => setLoading(false));
  }, [refreshStudies]);
  if (loading) {
    return <div className="rounded-xl border bg-card/60 p-3 text-xs text-muted-foreground">Loading saved studies…</div>;
  }
  if (savedStudies.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card/40 p-3 text-xs text-muted-foreground">
        No saved studies yet — new studies save to Supabase automatically (or run locally if it is unavailable).
      </div>
    );
  }
  return (
    <div className="rounded-xl border bg-card/60 p-3 text-left">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Saved studies ({savedStudies.length})
        </span>
        <button className="text-[11px] text-primary hover:underline" onClick={() => refreshStudies()}>
          Refresh
        </button>
      </div>
      <div className="max-h-44 space-y-1 overflow-y-auto">
        {savedStudies.map((s) => (
          <button
            key={s.id}
            onClick={() => openSavedStudy(s.id)}
            className="flex w-full items-center gap-2 rounded-lg border bg-background/40 px-3 py-2 text-left text-xs transition-colors hover:border-primary/40"
          >
            <FolderOpen className="size-3.5 shrink-0 text-primary/70" />
            <span className="flex-1 truncate font-medium">{s.project_name}</span>
            <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{s.country}</span>
            {s.data_status === "sample_case" && (
              <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-300">sample</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function Landing() {
  const { startNewStudy, loadSample } = useDemo();
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center gap-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_0_32px_-6px] shadow-primary/60">
        <Zap className="size-7" />
      </div>
      <div>
        <div className="flex items-center justify-center gap-2">
          <DemoBadge /> <PreFeasBadge />
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          {BRAND.name} <span className="text-primary">·</span> {BRAND.tagline}
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{BRAND.longPositioning}</p>
        <p className="mx-auto mt-1.5 max-w-md text-xs text-muted-foreground/80">
          Enter site and electricity data to compare grid, Solar ATAP, CRESS, BESS and hybrid strategies.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" onClick={startNewStudy}>
          <Play className="size-4" /> Start new study
        </Button>
        <Button size="lg" variant="outline" onClick={loadSample}>
          <Building2 className="size-4" /> Load sample: Johor Electronics Plant
        </Button>
      </div>
      <div className="w-full max-w-md space-y-3">
        <SavedStudies />
        <DataRoadmap />
      </div>
      <p className="max-w-md text-[11px] text-muted-foreground">
        Code calculates · sources provide evidence · AI explains · human approves. Pre-feasibility only —
        no official tariff-grade advice, no grid-approval claims.
      </p>
    </div>
  );
}

// ---------- Wizard ----------
function Wizard() {
  const { wizardStep, setWizardStep, draft, setDraft, backToLanding, loadSample } = useDemo();
  const d = draft;
  const set = (patch: Partial<StudyDraft>) => setDraft({ ...draft, ...patch });

  const step1Valid = d.project_name.trim() !== "" && d.country.trim() !== "";
  const step2Valid =
    parseFloat(d.monthly_consumption_kwh) > 0 &&
    parseFloat(d.peak_demand_kw) > 0 &&
    (parseFloat(d.annual_cost) > 0 || parseFloat(d.monthly_bill) > 0);
  const nonMalaysia = d.country.trim().toLowerCase() !== "malaysia" && d.country.trim() !== "";

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* Stepper */}
      <div className="flex items-center gap-2">
        {WIZARD_STEPS.map((s, i) => {
          const n = i + 1;
          const active = wizardStep === n;
          const done = wizardStep > n;
          return (
            <div key={s} className="flex flex-1 items-center gap-2">
              <div
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium",
                  done ? "bg-emerald-500/20 text-emerald-300" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {done ? <CheckCircle2 className="size-3.5" /> : n}
              </div>
              <span className={cn("hidden truncate text-xs sm:block", active ? "font-medium" : "text-muted-foreground")}>{s}</span>
              {i < WIZARD_STEPS.length - 1 && <div className="h-px flex-1 bg-border" />}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border bg-card p-5">
        {wizardStep === 1 && (
          <ProjectSetupStep d={d} set={set} nonMalaysia={nonMalaysia} />
        )}

        {wizardStep === 2 && (
          <div className="space-y-4">
            <PanelTitle>2 · Energy baseline</PanelTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Monthly electricity consumption">
                <NumField value={d.monthly_consumption_kwh} onChange={(v) => set({ monthly_consumption_kwh: v })} placeholder="1550000" unit="kWh" />
              </Field>
              <Field label="Peak demand">
                <NumField value={d.peak_demand_kw} onChange={(v) => set({ peak_demand_kw: v })} placeholder="4800" unit="kW" />
              </Field>
              <Field label="Current annual electricity cost" hint="Leave blank to derive from monthly bill × 12">
                <NumField value={d.annual_cost} onChange={(v) => set({ annual_cost: v })} placeholder="8400000" unit="RM/yr" />
              </Field>
              <Field label="Monthly bill">
                <NumField value={d.monthly_bill} onChange={(v) => set({ monthly_bill: v })} placeholder="700000" unit="RM" />
              </Field>
              <Field label="Average unit cost" hint="Optional — derived from cost ÷ use if blank">
                <NumField value={d.average_unit_cost} onChange={(v) => set({ average_unit_cost: v })} placeholder="0.452" unit="RM/kWh" />
              </Field>
              <Field label="Carbon baseline (if known)" hint="Optional — derived from grid emission factor if blank">
                <NumField value={d.carbon_baseline} onChange={(v) => set({ carbon_baseline: v })} placeholder="13760" unit="tCO₂e/yr" />
              </Field>
              <Field label="Renewable share today">
                <NumField value={d.current_re_share} onChange={(v) => set({ current_re_share: v })} placeholder="0" unit="%" />
              </Field>
            </div>
            <p className="rounded-lg bg-muted/60 p-2.5 text-[11px] text-muted-foreground">
              You enter; the engine derives the rest deterministically and shows every derivation in the evidence drawer.
            </p>
          </div>
        )}

        {wizardStep === 3 && (
          <div className="space-y-4">
            <PanelTitle>3 · Strategic goals</PanelTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Renewable target">
                <NumField value={d.renewable_target_percent} onChange={(v) => set({ renewable_target_percent: v })} placeholder="40" unit="%" />
              </Field>
              <Field label="Target year">
                <NumField value={d.renewable_target_year} onChange={(v) => set({ renewable_target_year: v })} placeholder="2030" />
              </Field>
              <Field label="Expansion load" hint="Planned additional demand, 0 if none">
                <NumField value={d.expansion_load_kw} onChange={(v) => set({ expansion_load_kw: v })} placeholder="0" unit="kW" />
              </Field>
              <Field label="Budget preference">
                <SelectField
                  value={d.budget_preference}
                  onChange={(v) => set({ budget_preference: v })}
                  options={[
                    { value: "low", label: "Low — minimal capex" },
                    { value: "medium", label: "Medium" },
                    { value: "high", label: "High — invest for savings" },
                  ]}
                />
              </Field>
              <Field label="Reliability requirement">
                <SelectField
                  value={d.reliability_requirement}
                  onChange={(v) => set({ reliability_requirement: v })}
                  options={[
                    { value: "standard", label: "Standard" },
                    { value: "high", label: "High" },
                    { value: "critical", label: "Critical — outage-sensitive" },
                  ]}
                />
              </Field>
              <Field label="Main objective">
                <SelectField
                  value={d.main_objective}
                  onChange={(v) => set({ main_objective: v })}
                  options={[
                    { value: "cost_first", label: "Cost-first" },
                    { value: "carbon_first", label: "Carbon-first" },
                    { value: "reliability_first", label: "Reliability-first" },
                    { value: "expansion_first", label: "Expansion-first" },
                    { value: "balanced", label: "Balanced" },
                  ]}
                />
              </Field>
              <Field label="Risk appetite">
                <SelectField
                  value={d.risk_appetite}
                  onChange={(v) => set({ risk_appetite: v })}
                  options={[
                    { value: "low", label: "Low — approved inputs only" },
                    { value: "medium", label: "Medium" },
                    { value: "high", label: "High" },
                  ]}
                />
              </Field>
            </div>
          </div>
        )}

        {wizardStep === 4 && <ReviewStep />}

        {/* Wizard nav */}
        <div className="mt-5 flex items-center justify-between border-t pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (wizardStep === 1 ? backToLanding() : setWizardStep(wizardStep - 1))}
          >
            <ArrowLeft className="size-4" /> {wizardStep === 1 ? "Cancel" : "Back"}
          </Button>
          {wizardStep < 4 && (
            <Button
              size="sm"
              onClick={() => setWizardStep(wizardStep + 1)}
              disabled={(wizardStep === 1 && !step1Valid) || (wizardStep === 2 && !step2Valid)}
            >
              Continue <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="text-center text-[11px] text-muted-foreground">
        Prefer a filled example? <button className="text-primary hover:underline" onClick={loadSample}>Load the Johor sample instead</button>
      </div>
    </div>
  );
}

// ---------- Review & run ----------
function ReviewStep() {
  const { draft, submitStudy } = useDemo();
  const d = draft;
  const nonMalaysia = d.country.trim().toLowerCase() !== "malaysia";
  const n = (v: string) => parseFloat(v.replace(/[, ]/g, "")) || 0;
  const annual = n(d.annual_cost) || n(d.monthly_bill) * 12;
  const checks = [
    { label: "Country module", value: nonMalaysia ? `${d.country} — limited demo module` : "Malaysia (CRESS + Solar ATAP)", ok: !nonMalaysia },
    {
      label: "Tariff category",
      value: d.tariff_code
        ? `${d.tariff_category} · ${d.state} · ${utilityForState(d.state)?.utility ?? "—"} · ${d.supply_voltage_level} — reference only, not tariff-grade billing`
        : d.tariff_category.trim()
          ? `${d.tariff_category} — free text, unvalidated`
          : "Not selected — average unit cost comes from your bill",
      ok: Boolean(d.tariff_code),
    },
    { label: "Energy baseline", value: `${(n(d.monthly_consumption_kwh) * 12 / 1e6).toFixed(1)} GWh/yr · ${fmtMYR(annual, { compact: true })}/yr · ${n(d.peak_demand_kw).toLocaleString()} kW peak`, ok: true },
    { label: "Objective", value: `${d.main_objective.replace("_", "-")} · target ${d.renewable_target_percent}% by ${d.renewable_target_year}`, ok: true },
    { label: "Assumptions", value: "Malaysia demo set v0.1 (versioned, sourced)", ok: true },
  ];
  return (
    <div className="space-y-4">
      <PanelTitle>4 · Review & run</PanelTitle>
      <div className="overflow-hidden rounded-lg border">
        {checks.map((c) => (
          <div key={c.label} className="flex items-center gap-3 border-b bg-background/30 px-3 py-2.5 text-sm last:border-b-0">
            {c.ok ? (
              <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
            ) : (
              <Globe2 className="size-4 shrink-0 text-amber-400" />
            )}
            <span className="w-32 shrink-0 text-xs text-muted-foreground">{c.label}</span>
            <span className="text-xs">{c.value}</span>
          </div>
        ))}
      </div>
      {nonMalaysia && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] text-amber-200/90">
          Limited demo module — country-specific rules not fully connected yet. CRESS scenarios will be
          shown as a Malaysia example only, and no country-specific accuracy is claimed.
        </p>
      )}
      <Button className="w-full" onClick={submitStudy}>
        <Target className="size-4" /> Run pre-feasibility analysis
      </Button>
      <p className="text-center text-[10px] text-muted-foreground">
        Deterministic demo engine · pre-feasibility only · nothing is sent anywhere (local state)
      </p>
    </div>
  );
}

// ---------- Workspace view of the study (nav item 1 after analysis) ----------
function StudySummary() {
  const { study, startNewStudy, backToLanding } = useDemo();
  if (!study) return null;
  const rows: [string, string][] = [
    ["Project", study.project_name],
    ["Country", study.country],
    ["Business type", study.business_type],
    ["User type", study.user_type.replace("_", " ")],
    ["Site location", study.site_location],
    ["State / region", study.state ? `${study.state} · ${study.region ?? "—"}` : "—"],
    ["Utility", study.utility ?? "—"],
    ["Supply voltage", study.supply_voltage_level ?? "—"],
    ["Tariff category", study.tariff_code ? `${study.tariff_category} (${study.tariff_code})` : `${study.tariff_category} — unvalidated`],
    ["Monthly consumption", `${study.monthly_consumption_kwh.toLocaleString()} kWh`],
    ["Peak demand", `${study.peak_demand_kw.toLocaleString()} kW`],
    ["Annual cost", fmtMYR(study.annual_cost, { compact: true })],
    ["Renewable target", `${study.renewable_target_percent}% by ${study.renewable_target_year}`],
    ["Expansion load", `${study.expansion_load_kw.toLocaleString()} kW`],
    ["Objective", study.main_objective.replace("_", "-")],
    ["Budget / risk", `${study.budget_preference} / ${study.risk_appetite}`],
    ["Data status", study.data_status === "sample_case" ? "Sample case" : "User-entered"],
  ];
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-primary">Study Setup</div>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight">{study.project_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The study object below drives every screen. It maps 1:1 to the future database row.
          </p>
        </div>
        <div className="flex gap-2">
          <DemoBadge /> <PreFeasBadge />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="overflow-hidden rounded-xl border lg:col-span-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 border-b bg-card px-4 py-2 text-sm last:border-b-0">
              <span className="text-xs text-muted-foreground">{k}</span>
              <span className="text-right text-xs font-medium">{v}</span>
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <DataRoadmap dataStatus={study.data_status} persisted={Boolean(study.persisted)} />
          <div className="rounded-xl border bg-card p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</div>
            <div className="grid gap-1.5">
              <Button size="sm" variant="outline" onClick={startNewStudy}>
                <PencilLine className="size-3.5" /> New study
              </Button>
              <Button size="sm" variant="ghost" onClick={backToLanding}>
                <ArrowLeft className="size-3.5" /> Back to landing
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StudySetup() {
  const { phase } = useDemo();
  if (phase === "landing") return <Landing />;
  if (phase === "wizard") return <Wizard />;
  return <StudySummary />;
}
