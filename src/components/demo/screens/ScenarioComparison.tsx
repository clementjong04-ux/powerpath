"use client";

import { ArrowRight, Building2, CheckCircle2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtKwhToGwh, fmtMYR, fmtPct, fmtYears } from "@/lib/format";
import { useDemo } from "../context";
import { ConfidenceBadge, DemoBadge, EvidenceButton, PanelTitle, PreFeasBadge, ScenarioTagBadge, ScreenHeader } from "../shared";

function Metric({ label, value, accent }: { label: string; value: string; accent?: "pos" | "neg" }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-semibold tabular-nums", accent === "pos" && "text-emerald-400", accent === "neg" && "text-rose-400")}>
        {value}
      </div>
    </div>
  );
}

export function ScenarioComparison() {
  const { study, input, scenarios, tags, goTo, versionLabel, applied, settings } = useDemo();
  if (!study || !input || !settings) return null;
  const options = scenarios.filter((s) => s.scenario_key !== "baseline_grid");
  const gridOnly = scenarios.find((s) => s.scenario_key === "baseline_grid")!;
  const target = settings.reTargetPct;

  return (
    <div className="space-y-5">
      <ScreenHeader
        n={3}
        title="Scenarios"
        intro="Strategy options simulated against your actual situation. Every figure is deterministic and traceable."
      >
        <DemoBadge />
        <PreFeasBadge />
      </ScreenHeader>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        Assumption set <code className="rounded bg-muted px-1.5 py-0.5 text-primary">{versionLabel}</code>
        {applied && <span className="text-emerald-400">· rerun after approved CRESS update</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {/* Fixed baseline panel */}
        <div className="rounded-xl border bg-card p-4 lg:sticky lg:top-4 lg:self-start">
          <PanelTitle>Actual situation</PanelTitle>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Building2 className="size-4 text-muted-foreground" /> Grid only today
          </div>
          <div className="mt-3 space-y-3">
            <Metric label="Annual cost" value={fmtMYR(gridOnly.annual_cost, { compact: true })} />
            <Metric label="Annual use" value={fmtKwhToGwh(input.annual_use_kwh, 1)} />
            <Metric label="Peak demand" value={`${(input.peak_demand_kw / 1000).toFixed(1)} MW`} />
            <Metric label="Avg unit cost" value={`RM${input.tariff_rm_per_kwh.toFixed(3)}/kWh`} />
            <Metric label="RE share" value={`${input.current_re_share_pct}%`} />
            <Metric label="Carbon" value={`${gridOnly.carbon_tonnes.toLocaleString()} tCO₂e`} />
          </div>
          <div className="mt-3 border-t pt-2">
            <EvidenceButton target={{ type: "scenario", id: "baseline_grid" }} label="Baseline trace" />
          </div>
        </div>

        {/* Scenario cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:col-span-3">
          {options.map((s) => {
            const tag = tags[s.scenario_key] ?? "not_yet";
            if (!s.available) {
              return (
                <div key={s.scenario_key} className="rounded-xl border border-dashed bg-card/50 p-4 opacity-70">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-semibold text-muted-foreground">{s.name}</div>
                    <Lock className="size-4 text-muted-foreground" />
                  </div>
                  <p className="mt-2 text-[11px] leading-4 text-amber-200/80">{s.unavailable_reason}</p>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Shown as a Malaysia example in Market Intelligence — not an active model input for this study.
                  </p>
                </div>
              );
            }
            return (
              <div
                key={s.scenario_key}
                className={cn(
                  "rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/50",
                  tag === "recommended" && "border-emerald-500/40",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold">{s.name}</div>
                  <ScenarioTagBadge tag={tag} />
                </div>
                <p className="mt-1 line-clamp-2 min-h-8 text-[11px] leading-4 text-muted-foreground">{s.description}</p>

                <div className="mt-3 grid grid-cols-3 gap-x-2 gap-y-3">
                  <Metric label="Cost / yr" value={fmtMYR(s.annual_cost, { compact: true })} />
                  <Metric
                    label="Savings / yr"
                    value={s.annual_savings === 0 ? "±0" : fmtMYR(Math.abs(s.annual_savings), { compact: true })}
                    accent={s.annual_savings > 0 ? "pos" : s.annual_savings < 0 ? "neg" : undefined}
                  />
                  <Metric label="RE share" value={fmtPct(s.renewable_share, 0)} />
                  <Metric label="Carbon ↓" value={fmtPct(Math.max(s.carbon_reduction, 0), 0)} />
                  <Metric label="Capex" value={s.capex === 0 ? "—" : fmtMYR(s.capex, { compact: true })} />
                  <Metric label="Payback" value={fmtYears(s.payback)} />
                </div>

                <div className="mt-3">
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>RE vs {target}% target</span>
                    {s.meets_target && <span className="flex items-center gap-0.5 text-emerald-400"><CheckCircle2 className="size-3" /> meets</span>}
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", s.meets_target ? "bg-emerald-400" : "bg-sky-400/70")}
                      style={{ width: `${Math.min((s.renewable_share / target) * 100, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-2.5 text-[10px] text-muted-foreground">
                  <span className="rounded-full border border-border px-2 py-0.5">Complexity: {s.complexity}</span>
                  <span className="rounded-full border border-border px-2 py-0.5">{s.grid_impact}</span>
                  <ConfidenceBadge confidence={s.confidence} />
                  <span className="ml-auto">
                    <EvidenceButton target={{ type: "scenario", id: s.scenario_key }} label="Trace" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">
          BESS is honest: it trims the bill and helps reliability but adds no renewable energy.
        </p>
        <Button onClick={() => goTo(5)}>
          Open Refinement <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
