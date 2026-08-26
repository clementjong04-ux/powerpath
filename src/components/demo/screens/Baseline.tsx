"use client";

import {
  ArrowRight,
  Banknote,
  FileText,
  Gauge,
  Globe2,
  Leaf,
  PencilLine,
  Radar,
  ReceiptText,
  Sun,
  Target,
  UserCheck,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtKwhToGwh, fmtMYR, fmtTonnes } from "@/lib/format";
import { useDemo } from "../context";
import {
  DemoBadge,
  EvidenceButton,
  KpiCard,
  LoopStrip,
  PanelTitle,
  PreFeasBadge,
  ScenarioTagBadge,
  ScreenHeader,
  StatusBadge,
} from "../shared";

export function BaselineScreen() {
  const { study, input, goTo, applied, scenarios, tags, latestMemo, recommendation, marketUpdate, studyIsMalaysia } = useDemo();
  if (!study || !input || !recommendation) return null;
  const isSample = study.data_status === "sample_case";
  const loopStage = applied ? (latestMemo && latestMemo.assumption_set_version === "v0.2" ? 5 : 4) : 2;
  const ranked = [...scenarios]
    .filter((s) => s.scenario_key !== "baseline_grid" && s.available)
    .sort((a, b) => Number(b.meets_target) - Number(a.meets_target) || a.annual_cost - b.annual_cost);

  return (
    <div className="space-y-5">
      <ScreenHeader
        n={2}
        title="Baseline"
        intro={`${study.project_name} — current energy position and what needs attention.`}
      >
        <DemoBadge />
        <PreFeasBadge />
      </ScreenHeader>

      {!studyIsMalaysia && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200/90">
          <Globe2 className="size-3.5 shrink-0" />
          Limited demo module — country-specific rules for {study.country} not fully connected yet. No country-specific accuracy is claimed.
        </div>
      )}

      {/* KPI row — everything derived from the study object */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Banknote} label="Annual cost" value={fmtMYR(input.annual_cost, { compact: true })} sub={`~${fmtMYR(study.monthly_bill, { compact: true })} / month`} />
        <KpiCard icon={Zap} label="Annual use" value={fmtKwhToGwh(input.annual_use_kwh, 1)} sub={`RM${input.tariff_rm_per_kwh.toFixed(3)} / kWh ${input.tariff_derived ? "(derived)" : ""}`} />
        <KpiCard icon={Gauge} label="Peak demand" value={`${(input.peak_demand_kw / 1000).toFixed(1)} MW`} sub={study.tariff_category} />
        <KpiCard icon={Leaf} label="Carbon baseline" value={fmtTonnes(input.carbon_baseline_t)} sub={input.carbon_derived ? "derived from grid factor" : "as entered"} />
        <KpiCard icon={Target} label="Renewable target" value={`${input.re_target_pct}% by ${input.re_target_year}`} progress={(input.current_re_share_pct / input.re_target_pct) * 100} sub={`progress ${input.current_re_share_pct}%`} />
        <KpiCard icon={Sun} label="Current RE share" value={`${input.current_re_share_pct}%`} accent={input.current_re_share_pct === 0 ? "warning" : "default"} sub={input.current_re_share_pct === 0 ? "all grid supply today" : "partially renewable"} />
        <div className="rounded-xl border bg-card p-4 sm:col-span-2">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Strategy status</div>
            {studyIsMalaysia ? (applied ? <StatusBadge status="approved" /> : <StatusBadge status="needs_review" />) : <StatusBadge status="demo_seed" />}
          </div>
          <div className="mt-1.5 text-lg font-semibold">
            {studyIsMalaysia
              ? applied ? "Updated & rerun — ready for memo" : "Needs review — 1 market update pending"
              : "Analysed with demo module"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Lead option: {recommendation.scenario_name} · objective {recommendation.objective.replace("_", "-")}
          </div>
        </div>
      </div>

      {/* Tariff context — category reference only; the unit cost above comes from the bill */}
      {study.tariff_code && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">Tariff reference:</span>
          <span>{study.tariff_category}</span>
          <span className="font-mono text-[10px]">({study.tariff_code})</span>
          {study.utility && <span>· {study.utility}</span>}
          {study.supply_voltage_level && <span>· {study.supply_voltage_level}</span>}
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px]",
              study.tariff_verification_status === "verified_official"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-amber-500/40 bg-amber-500/10 text-amber-300",
            )}
          >
            {study.tariff_verification_status === "verified_official" ? "Verified source" : "Demo-grade reference"}
          </span>
          <span className="text-muted-foreground/80">Not tariff-grade billing — unit cost comes from your bill.</span>
          {study.tariff_source_id && <EvidenceButton target={{ type: "source", id: study.tariff_source_id }} label="Source" />}
        </div>
      )}

      {/* Provenance: parsed bill (sample) vs manual entry (user study) */}
      <div className="rounded-xl border bg-card p-4">
        <PanelTitle>Baseline provenance</PanelTitle>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("flex size-10 items-center justify-center rounded-lg", isSample ? "bg-rose-500/15 text-rose-300" : "bg-sky-500/15 text-sky-300")}>
              {isSample ? <ReceiptText className="size-5" /> : <PencilLine className="size-5" />}
            </div>
            <div>
              <div className="text-sm font-medium">
                {isSample ? "TNB_Bill_Johor_March.pdf (sample bill, parsed)" : "Manually entered by you"}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {isSample
                  ? "Sample document · peak demand human-corrected 4,900 → 4,800 kW"
                  : "Upload of real bills / CSV replaces this in the live-data phase"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs">
            <UserCheck className="size-4 shrink-0 text-primary" />
            <span>
              <span className="font-medium">{isSample ? "AI extracted; human confirmed." : "You entered; the engine derived the rest."}</span>{" "}
              Every derivation is traceable.
            </span>
            <EvidenceButton target={{ type: "scenario", id: "baseline_grid" }} label="Trace" />
          </div>
        </div>
      </div>

      {/* Closed loop */}
      <div>
        <PanelTitle>Closed loop</PanelTitle>
        <LoopStrip stage={studyIsMalaysia ? loopStage : 1} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Next best action */}
        <div className={cn("rounded-xl border bg-card p-4", studyIsMalaysia && !applied && "border-amber-500/30")}>
          <PanelTitle>Next best action</PanelTitle>
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300">
              <Radar className="size-4" />
            </div>
            <div>
              <div className="text-sm font-medium">
                {studyIsMalaysia
                  ? applied ? "Generate the strategy memo" : "Review CRESS update and rerun scenarios"
                  : "Review scenarios with the demo module"}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {studyIsMalaysia && !applied && marketUpdate
                  ? `${marketUpdate.summary} Nothing changes until you approve.`
                  : studyIsMalaysia
                    ? "Inputs approved — assemble the deliverable."
                    : "Country-specific market monitoring connects in the live-data phase."}
              </p>
            </div>
          </div>
          <Button size="sm" className="mt-3 w-full" onClick={() => goTo(studyIsMalaysia ? (applied ? 7 : 4) : 3)}>
            {studyIsMalaysia ? (applied ? "Open memo" : "Review update") : "Open scenarios"} <ArrowRight className="size-4" />
          </Button>
        </div>

        {/* Ranking preview */}
        <div className="rounded-xl border bg-card p-4">
          <PanelTitle right={<button className="text-[11px] text-primary hover:underline" onClick={() => goTo(3)}>Open scenarios →</button>}>
            Scenario ranking
          </PanelTitle>
          <div className="space-y-2">
            {ranked.slice(0, 4).map((s, i) => (
              <div key={s.scenario_key} className="flex items-center gap-2 text-sm">
                <span className="w-4 text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
                <span className="flex-1 truncate">{s.name}</span>
                <span className={cn("tabular-nums text-xs", s.annual_savings > 0 ? "text-emerald-400" : s.annual_savings < 0 ? "text-rose-400" : "text-muted-foreground")}>
                  {s.annual_savings > 0 ? `−${fmtMYR(s.annual_savings, { compact: true })}` : s.annual_savings < 0 ? `+${fmtMYR(Math.abs(s.annual_savings), { compact: true })}` : "±0"}
                </span>
                <ScenarioTagBadge tag={tags[s.scenario_key] ?? "not_yet"} />
              </div>
            ))}
          </div>
        </div>

        {/* Memo status */}
        <div className="rounded-xl border bg-card p-4">
          <PanelTitle>Strategy memo</PanelTitle>
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <FileText className="size-4" />
            </div>
            <div>
              <div className="text-sm font-medium">
                {latestMemo ? `Memo v${latestMemo.version} generated` : "Not yet generated"}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {latestMemo
                  ? `${latestMemo.human_review_status === "approved" ? "Human-approved" : "Pending review"} · assumption set ${latestMemo.assumption_set_version}`
                  : "Assemble baseline, scenarios and recommendation into the deliverable."}
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => goTo(7)}>
            {latestMemo ? "Open memo" : "Go to memo"} <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
