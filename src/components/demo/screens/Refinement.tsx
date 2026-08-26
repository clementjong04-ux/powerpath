"use client";

import { useState } from "react";
import { ArrowRight, Calculator, CheckCircle2, RefreshCw, Save, SlidersHorizontal, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtMYR } from "@/lib/format";
import type { RefinementSettings, RiskAppetite } from "@/lib/types";
import { useDemo } from "../context";
import { DemoBadge, EvidenceButton, PanelTitle, ScenarioTagBadge, ScreenHeader, StatusBadge } from "../shared";

function Slider({
  label, value, min, max, step, unit, onChange, format,
}: {
  label: string; value: number; min: number; max: number; step: number; unit?: string;
  onChange: (v: number) => void; format?: (v: number) => string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums text-foreground">{format ? format(value) : `${value}${unit ?? ""}`}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 w-full accent-[oklch(0.78_0.14_165)]"
      />
    </div>
  );
}

export function Refinement() {
  const { study, applied, approveUpdate, rerunDb, rerunImpact, goTo, settings, applySettings, scenarios, recommendation, tags, versionLabel, strategySaved, saveStrategy, marketUpdate, studyIsMalaysia, data } = useDemo();
  const [draft, setDraft] = useState<RefinementSettings | null>(null);
  if (!study || !settings || !recommendation || !marketUpdate) return null;
  const d = draft ?? settings;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(settings);
  const ranked = [...scenarios]
    .filter((s) => s.scenario_key !== "baseline_grid" && s.available)
    .sort((a, b) => a.annual_cost - b.annual_cost);

  return (
    <div className="space-y-5">
      <ScreenHeader
        n={5}
        title="Refinement"
        intro="Human-in-the-loop: approve pending inputs and tune constraints. The engine recalculates — you decide. Decision support, not autopilot."
      >
        <DemoBadge />
      </ScreenHeader>

      {/* Pending approval card — Malaysia studies only */}
      {studyIsMalaysia ? (
        <div className={cn("rounded-xl border bg-card p-4", applied ? "border-emerald-500/30" : "border-amber-500/40")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={cn("flex size-9 items-center justify-center rounded-lg", applied ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300")}>
                <UserCheck className="size-4" />
              </div>
              <div>
                <div className="text-sm font-medium">
                  CRESS SAC update · RM{marketUpdate.before_value} → RM{marketUpdate.after_value}/kWh
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {applied
                    ? `Approved by ${data.assumptionsV2.meta.reviewed_by} · assumption set ${versionLabel} · scenarios rerun`
                    : "Pending your approval — CRESS results remain provisional until approved"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {applied ? <StatusBadge status="approved" /> : <StatusBadge status="needs_review" />}
              {!applied ? (
                <Button size="sm" onClick={approveUpdate}>
                  <RefreshCw className="size-3.5" /> Apply update & rerun
                </Button>
              ) : (
                // Explicit database-backed rerun: new scenario_results run + audit
                // event + refreshed memo draft. Only available AFTER approval.
                <Button size="sm" variant="outline" onClick={() => rerunDb()}>
                  <RefreshCw className="size-3.5" /> Rerun strategy
                </Button>
              )}
              <EvidenceButton target={{ type: "assumption", id: "ASM-CRESS-SAC" }} label="" />
            </div>
          </div>

          {/* Before/after impact of the last database-backed rerun */}
          {applied && rerunImpact && rerunImpact.length > 0 && (
            <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
                Update impact (before → after)
              </div>
              <div className="space-y-1">
                {rerunImpact.map((i) => (
                  <div key={i.scenario_key} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{i.name}</span>
                    <span className="tabular-nums">
                      {i.before_cost !== null ? fmtMYR(i.before_cost, { compact: true }) : "—"}/yr →{" "}
                      <span className="font-medium">{fmtMYR(i.after_cost, { compact: true })}/yr</span>{" "}
                      <span className={cn(i.delta_cost !== null && i.delta_cost < 0 ? "text-emerald-400" : "text-rose-400")}>
                        ({i.delta_cost !== null && i.delta_cost < 0 ? "−" : "+"}
                        {fmtMYR(Math.abs(i.delta_cost ?? 0), { compact: true })})
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed bg-card/50 p-3 text-[11px] text-muted-foreground">
          No pending market updates for {study.country} — country-specific source monitoring connects in the
          live-data phase. The Malaysia CRESS example in Market Intelligence does not affect this study.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Constraint controls (seeded from your study goals) */}
        <div className="rounded-xl border bg-card p-4 lg:col-span-2">
          <PanelTitle>
            <span className="flex items-center gap-1.5"><SlidersHorizontal className="size-3.5" /> Strategy constraints</span>
          </PanelTitle>
          <p className="mb-3 text-[10px] text-muted-foreground">Seeded from your study goals — adjust and recalculate.</p>
          <div className="space-y-4">
            <Slider
              label="Capex budget"
              value={d.capexBudgetMYR}
              min={2_000_000} max={30_000_000} step={1_000_000}
              onChange={(v) => setDraft({ ...d, capexBudgetMYR: v })}
              format={(v) => fmtMYR(v, { compact: true })}
            />
            <Slider
              label="Payback threshold"
              value={d.paybackThresholdYears}
              min={3} max={15} step={1} unit=" yrs"
              onChange={(v) => setDraft({ ...d, paybackThresholdYears: v })}
            />
            <Slider
              label="Renewable target"
              value={d.reTargetPct}
              min={10} max={80} step={5} unit="%"
              onChange={(v) => setDraft({ ...d, reTargetPct: v })}
            />
            <Slider
              label="BESS size"
              value={d.bessSizeFactor}
              min={0.5} max={2} step={0.25} unit="×"
              onChange={(v) => setDraft({ ...d, bessSizeFactor: v })}
            />
            <div>
              <div className="mb-1.5 text-xs text-muted-foreground">Risk appetite</div>
              <div className="grid grid-cols-3 gap-1 rounded-lg border bg-background/40 p-1">
                {(["low", "medium", "high"] as RiskAppetite[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setDraft({ ...d, riskAppetite: r })}
                    className={cn(
                      "rounded-md px-2 py-1 text-xs capitalize transition-colors",
                      d.riskAppetite === r ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-background/40 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Objective</span>
              <span className="font-medium capitalize">{study.main_objective.replace("_", "-")}</span>
            </div>
            {studyIsMalaysia && (
              <div className="flex items-center justify-between rounded-lg border bg-background/40 px-3 py-2 text-xs">
                <span className="text-muted-foreground">CRESS input confidence</span>
                <span className={cn("font-medium", applied ? "text-emerald-300" : "text-amber-300")}>
                  {applied ? "medium (approved)" : "low (provisional)"}
                </span>
              </div>
            )}
          </div>

          <Button className="mt-4 w-full" onClick={() => draft && applySettings(draft)} disabled={!dirty}>
            <Calculator className="size-4" /> Recalculate
          </Button>
        </div>

        {/* Revised ranking + what changed */}
        <div className="space-y-4 lg:col-span-3">
          <div className="rounded-xl border bg-card p-4">
            <PanelTitle right={<span className="text-[11px] text-muted-foreground">assumption set {versionLabel}</span>}>
              Revised ranking
            </PanelTitle>
            <div className="space-y-2">
              {ranked.map((s, i) => {
                const excludedReason = recommendation.excluded.find((e) => e.scenario_key === s.scenario_key)?.reason;
                return (
                  <div key={s.scenario_key} className={cn("flex items-center gap-2.5 rounded-lg border px-3 py-2", excludedReason && "opacity-50")}>
                    <span className="w-4 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                    <span className="flex-1 text-sm font-medium">{s.name}</span>
                    {excludedReason ? (
                      <span className="text-[10px] text-rose-300">{excludedReason}</span>
                    ) : (
                      <>
                        <span className={cn("text-xs tabular-nums", s.annual_savings > 0 ? "text-emerald-400" : "text-muted-foreground")}>
                          {s.annual_savings > 0 ? `saves ${fmtMYR(s.annual_savings, { compact: true })}/yr` : "no saving"}
                        </span>
                        <ScenarioTagBadge tag={tags[s.scenario_key] ?? "not_yet"} />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <PanelTitle>Decision rule</PanelTitle>
            <p className="text-sm">
              <span className="font-medium text-primary">{recommendation.scenario_name}</span> leads under your constraints.
            </p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">{recommendation.rule}</p>
            {recommendation.excluded.length > 0 && (
              <p className="mt-1.5 text-[11px] text-rose-300/90">
                Excluded: {recommendation.excluded.map((e) => `${scenarios.find((s) => s.scenario_key === e.scenario_key)?.name} (${e.reason.toLowerCase()})`).join("; ")}
              </p>
            )}
            {recommendation.advisories.length > 0 && (
              <ul className="mt-2 space-y-1 text-[11px] text-sky-200/90">
                {recommendation.advisories.map((a) => (
                  <li key={a}>· {a}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={saveStrategy} disabled={strategySaved}>
              {strategySaved ? <><CheckCircle2 className="size-4 text-emerald-400" /> Strategy saved</> : <><Save className="size-4" /> Save revised strategy</>}
            </Button>
            <Button onClick={() => goTo(6)}>
              View recommendation <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
