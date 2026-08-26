"use client";

import { useState } from "react";
import { ArrowRight, Building2, CheckCircle2, ClipboardCheck, Lightbulb, ListChecks, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtMYR, fmtPct, fmtYears } from "@/lib/format";
import { fetchAiExplanation, type AiExplanationResult } from "@/lib/study";
import { useDemo } from "../context";
import { AiSourceBadge, ConfidenceBadge, DemoBadge, EvidenceButton, KpiCard, NumbersFromResultsChip, PanelTitle, PreFeasBadge, Provisional, ScreenHeader } from "../shared";

const VALIDATE = [
  "Roof structural survey & usable area for the solar array",
  "Supplier availability and actual contract pricing",
  "Interval / half-hourly demand data to firm up the profile",
  "Grid connection study (no approval is claimed or implied)",
  "Detailed financial model beyond simple payback",
];

const NEXT_ACTIONS = [
  "Approve pre-feasibility memo internally",
  "Commission surveys and request supplier quotes",
  "Upload 12 months of real bills to replace estimates",
];

export function Recommendation() {
  const { study, scenarios, recommendation, goTo, settings, applied } = useDemo();

  // AI explanation layer — narrates the deterministic results; never calculates.
  // A failed key/API/audit answers via the route's deterministic template.
  const [aiResult, setAiResult] = useState<AiExplanationResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const explainWithAi = async () => {
    if (aiLoading || !study) return;
    setAiLoading(true);
    try {
      setAiResult(await fetchAiExplanation(study, applied ? "0.2" : "0.1", settings ?? undefined));
    } finally {
      setAiLoading(false);
    }
  };

  if (!study || !recommendation || !settings) return null;
  const rec = scenarios.find((s) => s.scenario_key === recommendation.scenario_key)!;
  const title =
    rec.scenario_key === "solar_cress"
      ? "Solar-led hybrid strategy (Solar ATAP + CRESS)"
      : rec.scenario_key === "solar_atap"
        ? "Solar-led strategy (Solar ATAP)"
        : `${rec.name} strategy`;

  // AI narration assembled ONLY from deterministic values — no new numbers.
  const explanation = `${rec.name} reaches ${fmtPct(rec.renewable_share, 0)} renewable — ${
    recommendation.target_met ? `meeting the ${settings.reTargetPct}% target` : `short of the ${settings.reTargetPct}% target`
  } — at ${fmtMYR(rec.annual_cost, { compact: true })}/yr${rec.annual_savings > 0 ? `, saving ~${fmtMYR(rec.annual_savings, { compact: true })} against grid-only` : ""}. Under your ${recommendation.objective.replace("_", "-")} objective this ranked first. This is a pre-feasibility view; a detailed study is required before commitment.`;

  return (
    <div className="space-y-5">
      <ScreenHeader
        n={6}
        title="Recommendation"
        intro="The decision screen: what wins under your objective, why, and what must be validated before any investment."
      >
        <DemoBadge />
        <PreFeasBadge />
      </ScreenHeader>

      {/* Hero decision card */}
      <div className="overflow-hidden rounded-xl border border-primary/40 bg-gradient-to-br from-primary/10 via-card to-card p-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_0_20px_-4px] shadow-primary/60">
            <Lightbulb className="size-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-primary">
              Recommended · objective: {recommendation.objective.replace("_", "-")}
            </div>
            <div className="text-xl font-semibold tracking-tight">{title}</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {recommendation.provisional && <Provisional reason={recommendation.provisional_reason} />}
            <ConfidenceBadge confidence={rec.confidence} />
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Annual cost" value={fmtMYR(rec.annual_cost, { compact: true })} accent="positive" />
          <KpiCard label="Saving vs grid-only" value={rec.annual_savings > 0 ? `${fmtMYR(rec.annual_savings, { compact: true })}/yr` : "—"} accent="positive" sub={rec.annual_savings > 0 ? `${fmtPct(rec.savings_pct, 0)} of bill` : undefined} />
          <KpiCard label="Renewable share" value={fmtPct(rec.renewable_share, 0)} progress={(rec.renewable_share / settings.reTargetPct) * 100} sub={`target ${settings.reTargetPct}%`} />
          <KpiCard label="Capex · payback" value={`${rec.capex === 0 ? "—" : fmtMYR(rec.capex, { compact: true })} · ${fmtYears(rec.payback)}`} sub={`carbon −${fmtPct(Math.max(rec.carbon_reduction, 0), 0)}`} />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background/40 px-3 py-2">
          <span className="text-xs text-muted-foreground">
            Investment readiness: <span className="font-medium text-amber-300">requires validation</span> · {recommendation.rule}
          </span>
          <EvidenceButton target={{ type: "scenario", id: rec.scenario_key }} label="Full calculation trace" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <PanelTitle><span className="flex items-center gap-1.5"><Sparkles className="size-3.5 text-sky-400" /> Why it wins (AI explains)</span></PanelTitle>
          <p className="text-sm leading-relaxed text-muted-foreground">{explanation}</p>
          {recommendation.advisories.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-sky-200/90">
              {recommendation.advisories.map((a) => (
                <li key={a}>· {a}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[10px] text-muted-foreground/70">Narration assembled from deterministic results only.</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3 w-full"
            disabled={aiLoading}
            onClick={explainWithAi}
            title="AI narrates the deterministic results below — it never calculates; audited output only"
          >
            <Sparkles className="size-3.5 text-sky-400" /> {aiLoading ? "Explaining…" : aiResult ? "Explain again" : "Explain results with AI"}
          </Button>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <PanelTitle><span className="flex items-center gap-1.5"><ClipboardCheck className="size-3.5 text-amber-400" /> Validate before investment</span></PanelTitle>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {VALIDATE.map((v) => (
              <li key={v} className="flex gap-2"><span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-amber-400/70" />{v}</li>
            ))}
          </ul>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <PanelTitle><span className="flex items-center gap-1.5"><Building2 className="size-3.5 text-muted-foreground" /> Similar asset benchmark</span></PanelTitle>
            <p className="text-xs text-muted-foreground">
              Comparable {study.user_type.replace("_", " ")} sites pursuing solar-led strategies typically
              target 20–40% RE in phase one. <span className="text-amber-300/90">Illustrative demo benchmark — not verified market data.</span>
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <PanelTitle><span className="flex items-center gap-1.5"><ListChecks className="size-3.5 text-primary" /> Next actions</span></PanelTitle>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              {NEXT_ACTIONS.map((v) => (
                <li key={v} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-3 shrink-0 text-primary/70" />{v}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* AI explanation of the deterministic results (audited; template fallback) */}
      {(aiLoading || aiResult) && (
        <div className="rounded-xl border border-sky-500/25 bg-card p-4">
          <PanelTitle
            right={
              aiResult?.source ? (
                <span className="flex items-center gap-1.5">
                  <AiSourceBadge source={aiResult.source} />
                  <NumbersFromResultsChip />
                  <PreFeasBadge />
                </span>
              ) : undefined
            }
          >
            <span className="flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-sky-400" /> AI explanation of the deterministic results
            </span>
          </PanelTitle>

          {aiLoading && <p className="text-sm text-muted-foreground">Narrating the deterministic results…</p>}

          {!aiLoading && aiResult && !aiResult.ok && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/5 p-2 text-[11px] text-red-300">
              Explanation unavailable: {aiResult.error}
            </p>
          )}

          {!aiLoading && aiResult?.ok && aiResult.explanation && (
            <div className="space-y-3">
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-lg border bg-background/40 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">Why the top strategy wins</div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{aiResult.explanation.why_top_strategy}</p>
                </div>
                <div className="rounded-lg border bg-background/40 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">Why BESS is “not yet”</div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{aiResult.explanation.why_bess_not_yet}</p>
                </div>
              </div>

              {aiResult.explanation.assumptions_that_matter_most.length > 0 && (
                <div className="rounded-lg border bg-background/40 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">Assumptions that matter most</div>
                  <div className="mt-1.5 space-y-1.5">
                    {aiResult.explanation.assumptions_that_matter_most.map((a, i) => (
                      <div key={i} className="text-xs leading-relaxed">
                        <span className="font-medium text-foreground">{a.assumption}</span>{" "}
                        <span className="text-muted-foreground">{a.why_it_matters}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-3 lg:grid-cols-2">
                {aiResult.explanation.data_needing_validation.length > 0 && (
                  <div className="rounded-lg border bg-background/40 p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">Data needing validation</div>
                    <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                      {aiResult.explanation.data_needing_validation.map((d, i) => (
                        <li key={i} className="flex gap-2"><span className="mt-1 size-1.5 shrink-0 rounded-full bg-amber-400/70" />{d}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="space-y-3">
                  {([
                    ["Questions for your EPC", aiResult.explanation.questions_for_epc],
                    ["Questions for the PPA supplier", aiResult.explanation.questions_for_ppa_supplier],
                    ["Questions for the utility", aiResult.explanation.questions_for_utility],
                  ] as const).map(([label, items]) =>
                    items.length > 0 ? (
                      <div key={label} className="rounded-lg border bg-background/40 p-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">{label}</div>
                        <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                          {items.map((q, i) => (
                            <li key={i} className="flex gap-2"><span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary/60" />{q}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null,
                  )}
                </div>
              </div>

              {aiResult.caveat && (
                <p className="rounded-lg bg-muted/60 p-2.5 text-[11px] leading-relaxed text-muted-foreground">{aiResult.caveat}</p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2.5">
        <p className="text-[11px] text-sky-200/90">
          Pre-feasibility only. Not a final investment decision. Not an official tariff. No grid approval is claimed.
        </p>
        <Button size="sm" onClick={() => goTo(7)}>
          Generate strategy memo <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
