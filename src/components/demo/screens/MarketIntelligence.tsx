"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, Database, ExternalLink, EyeOff, Globe2, Radar, RefreshCw, Sun, TrendingDown, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtMYR } from "@/lib/format";
import {
  fetchSolarResource,
  listRegistrySources,
  reviewLiveUpdate,
  type LiveMarketUpdate,
  type RegistrySource,
  type SolarResourceResult,
} from "@/lib/study";
import type { VerificationStatus } from "@/lib/types";
import { useDemo } from "../context";
import { DemoBadge, EvidenceButton, PanelTitle, ReviewStatusBadge, ScreenHeader, StatusBadge, VerificationBadge } from "../shared";

const MONITORS: Record<string, { affects: string; connect: string }> = {
  "SRC-CRESS-SAC": { affects: "CRESS + Hybrid", connect: "Live" },
  "SRC-CRESS-GUIDELINE": { affects: "CRESS + Hybrid", connect: "Reference document" },
  "SRC-SEDA-SOLAR": { affects: "Solar ATAP + Hybrid", connect: "Connected later" },
  "SRC-TNB-SOLAR-ATAP": { affects: "Solar ATAP + Hybrid", connect: "Connected later" },
  "SRC-NASA-POWER": { affects: "Solar ATAP + Hybrid", connect: "Live" },
};

// Sources with a real connection in this phase.
const LIVE_SOURCE_ID = "SRC-CRESS-SAC";
const SOLAR_SOURCE_ID = "SRC-NASA-POWER";

function toVerification(v: string | null | undefined): VerificationStatus {
  return v === "verified_official" || v === "pending" || v === "not_official_source" ? v : "unverified";
}

// Common card shape whether the registry came from Supabase or local fixtures.
interface MonitorCard {
  id: string;
  source_name: string;
  authority: string | null;
  url: string | null;
  source_domain: string | null;
  verification_status: string | null;
  official_status: string | null;
  latest_snapshot: { fetched_at: string; content_hash: string | null } | null;
}

export function MarketIntelligence() {
  const {
    data, goTo, applied, approveUpdate, ignored, ignoreUpdate, marketUpdate, study, studyIsMalaysia,
    syncing, lastSync, syncSources, liveUpdates, refreshLiveUpdates, rerunDb,
  } = useDemo();

  // Live NASA POWER solar resource check — evidence display only, never changes
  // scenario results. Local state; a failed API shows an error line, never breaks.
  const [solar, setSolar] = useState<SolarResourceResult | null>(null);
  const [solarLoading, setSolarLoading] = useState(false);
  const checkSolar = async () => {
    if (solarLoading) return;
    setSolarLoading(true);
    try {
      setSolar(await fetchSolarResource()); // defaults to the Johor hero site
    } finally {
      setSolarLoading(false);
    }
  };

  // Live registry + market updates from Supabase (fixture fallback keeps the
  // screen fully working offline).
  const [registry, setRegistry] = useState<RegistrySource[] | null>(null);
  useEffect(() => {
    void refreshLiveUpdates();
    void listRegistrySources().then(setRegistry);
  }, [refreshLiveUpdates]);

  // Sync + refresh the registry so monitor cards show the new snapshot time/hash.
  const handleSync = async () => {
    await syncSources();
    setRegistry(await listRegistrySources());
  };

  // Per-row review actions + database-backed rerun.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const [rerunDone, setRerunDone] = useState(false);

  if (!study || !marketUpdate) return null;
  const mu = marketUpdate;
  const seedUpdateId = data.marketUpdate.id;

  const handleReview = async (u: LiveMarketUpdate, decision: "approve" | "ignore") => {
    if (busyId) return;
    setBusyId(u.id);
    setReviewError(null);
    try {
      if (u.id === seedUpdateId) {
        // The hero update: go through the context so the whole app (assumption
        // set, hero card, rerun impact) follows the same approval.
        if (decision === "approve") await approveUpdate();
        else await ignoreUpdate();
      } else {
        const res = await reviewLiveUpdate(u.id, decision);
        if (!res.ok) setReviewError(res.error);
      }
      await refreshLiveUpdates();
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const anyApproved =
    applied || liveUpdates.some((u) => ["approved", "approved_demo"].includes(u.human_review_status));

  const handleRerun = async () => {
    if (rerunning || !anyApproved) return;
    setRerunning(true);
    try {
      await rerunDb(true);
      setRerunDone(true);
    } finally {
      setRerunning(false);
    }
  };

  // Monitor cards: Supabase registry when reachable, local fixtures otherwise.
  const monitorCards: MonitorCard[] =
    registry
      ?.filter((r) => r.id !== "SRC-DEMO-SEED")
      .map((r) => ({
        id: r.id,
        source_name: r.source_name,
        authority: r.authority,
        url: r.url,
        source_domain: r.source_domain,
        verification_status: r.verification_status,
        official_status: r.official_status,
        latest_snapshot: r.latest_snapshot,
      })) ??
    data.sources
      .filter((s) => s.id !== "SRC-DEMO-SEED")
      .map((s) => ({
        id: s.id,
        source_name: s.name,
        authority: s.authority,
        url: s.url ?? null,
        source_domain: s.source_domain ?? null,
        verification_status: s.verification_status ?? "unverified",
        official_status: s.official_status ?? null,
        latest_snapshot: null,
      }));

  return (
    <div className="space-y-5">
      <ScreenHeader
        n={4}
        title="Market Intelligence"
        intro="Watchtower over public energy sources. Detected changes wait for human review — never auto-applied."
      >
        <DemoBadge />
      </ScreenHeader>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Globe2 className="size-3.5" />
        Country module: <span className="font-medium text-foreground">Malaysia</span>
        {!studyIsMalaysia && (
          <span className="text-amber-300/90">
            · your study is {study.country} — limited demo module, Malaysia shown as example only
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Selected update card */}
        <div className={cn("rounded-xl border bg-card p-4 lg:col-span-2", mu.applies_to_study ? "border-amber-500/30" : "border-border")}>
          <PanelTitle
            right={
              mu.applies_to_study
                ? applied ? <StatusBadge status="approved" /> : <StatusBadge status="needs_review" />
                : <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">Malaysia example</span>
            }
          >
            Detected update
          </PanelTitle>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <TrendingDown className="size-4 text-emerald-400" />
            {mu.title}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {new Date(mu.detected_at).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })} · Suruhanjaya Tenaga / PETRA · demo fixture
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border bg-background/40 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Current (provisional)</div>
              <div className="text-base font-semibold tabular-nums">RM{mu.before_value}/kWh</div>
            </div>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Detected</div>
              <div className="text-base font-semibold tabular-nums text-emerald-300">RM{mu.after_value}/kWh</div>
            </div>
          </div>

          {mu.applies_to_study && mu.estimated_impact !== null ? (
            <div className="mt-3 rounded-lg border bg-background/40 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Estimated impact for this study (calculated)</div>
              <div className="text-lg font-semibold tabular-nums text-emerald-300">~{fmtMYR(mu.estimated_impact, { compact: true })}/yr</div>
              <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{mu.impact_formula}</div>
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-dashed bg-background/30 p-2.5 text-[11px] text-muted-foreground">
              Not applied to this study — CRESS is a Malaysia framework. Shown as an example of the
              closed loop only.
            </div>
          )}

          <div className="mt-2 text-[11px] text-muted-foreground">Affects: CRESS + Solar+CRESS (Hybrid)</div>

          {/* Source verification line — the update can only be applied from a verified source */}
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            Source: <VerificationBadge status={mu.source_verification} />
          </div>
          {!mu.source_verified && mu.source_warning && (
            <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-200/90">
              {mu.source_warning}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {mu.applies_to_study ? (
              applied ? (
                <Button size="sm" variant="outline" onClick={() => goTo(3)}>
                  <Check className="size-3.5 text-emerald-400" /> Applied — view rerun <ArrowRight className="size-3.5" />
                </Button>
              ) : ignored ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-muted-foreground">
                  <EyeOff className="size-3.5" /> Ignored — decision logged, model unchanged
                </span>
              ) : (
                <>
                  <Button
                    size="sm"
                    onClick={async () => { await approveUpdate(); goTo(3); }}
                    disabled={!mu.source_verified}
                    title={mu.source_verified ? undefined : "Blocked — only verified official sources can update assumptions"}
                  >
                    <RefreshCw className="size-3.5" /> Apply update & rerun
                  </Button>
                  <Button size="sm" variant="outline" onClick={ignoreUpdate}>
                    <EyeOff className="size-3.5" /> Ignore for now
                  </Button>
                </>
              )
            ) : (
              <Button size="sm" variant="outline" disabled title="Malaysia example — cannot be applied to this study">
                Apply (Malaysia studies only)
              </Button>
            )}
            <EvidenceButton target={{ type: "assumption", id: "ASM-CRESS-SAC" }} label="View evidence" />
          </div>

          <p className="mt-3 rounded-lg bg-muted/60 p-2 text-[11px] text-muted-foreground">
            Pending updates never change recommendations until a human approves.
          </p>
        </div>

        {/* Source monitors — Supabase registry (fixture fallback) */}
        <div className="lg:col-span-3">
          <PanelTitle
            right={
              <span className={cn(
                "rounded-full border px-2 py-0.5 text-[10px]",
                registry ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-border bg-muted text-muted-foreground",
              )}>
                {registry ? "Supabase live" : "Local fixtures"}
              </span>
            }
          >
            Source monitors (Malaysia module)
          </PanelTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {monitorCards.map((s) => {
              const meta = MONITORS[s.id] ?? { affects: "—", connect: "Connected later" };
              const pending = s.id === mu.source_id && mu.applies_to_study && !applied;
              const checked = s.latest_snapshot ?? (s.id === LIVE_SOURCE_ID ? lastSync?.snapshot ?? null : null);
              return (
                <div
                  key={s.id}
                  className={cn(
                    "rounded-xl border bg-card p-3.5 transition-colors hover:border-primary/40",
                    pending && "border-amber-500/30",
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Database className="size-4 shrink-0 text-primary/70" />
                    <span className="leading-tight">{s.source_name}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                    {s.authority && <span>{s.authority}</span>}
                    {s.source_domain && <span className="font-mono text-[10px]">· {s.source_domain}</span>}
                    {s.url && (
                      <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary/80 hover:text-primary" title={s.url}>
                        <ExternalLink className="size-3" /> source
                      </a>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <VerificationBadge status={toVerification(s.verification_status)} />
                    {s.official_status === "internal_demo" && (
                      <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">Internal demo</span>
                    )}
                    <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-300">{meta.connect}</span>
                    {pending && (
                      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">Pending human review</span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>Affects: {meta.affects}</span>
                    <span className="truncate text-right">
                      {checked
                        ? `Checked ${new Date(checked.fetched_at).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                        : "Last checked: demo seed"}
                    </span>
                  </div>
                  {checked?.content_hash && (
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground/70" title={checked.content_hash}>
                      hash {checked.content_hash.slice(0, 12)}…
                    </div>
                  )}
                  <div className="mt-1.5 flex items-center justify-between">
                    {s.id === LIVE_SOURCE_ID ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px]"
                        disabled={syncing}
                        onClick={handleSync}
                        title="Fetch + snapshot the verified official source; changes wait for human review"
                      >
                        <RefreshCw className={cn("size-3", syncing && "animate-spin")} /> {syncing ? "Syncing…" : "Sync CRESS source"}
                      </Button>
                    ) : s.id === SOLAR_SOURCE_ID ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px]"
                        disabled={solarLoading}
                        onClick={checkSolar}
                        title="Fetch the site's solar resource from NASA POWER — evidence only, not PV yield"
                      >
                        <Sun className={cn("size-3", solarLoading && "animate-spin")} /> {solarLoading ? "Fetching…" : "Check resource"}
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-muted-foreground" disabled title="Placeholder — live sync connects in the next phase">
                        <RefreshCw className="size-3" /> Sync source
                      </Button>
                    )}
                    <EvidenceButton target={{ type: "source", id: s.id }} label="Details" />
                  </div>
                  {s.id === SOLAR_SOURCE_ID && solar && (
                    solar.ok && solar.average_daily_solar_radiation !== null ? (
                      <div
                        className={cn(
                          "mt-2 rounded-lg border p-2 text-[11px]",
                          solar.provenance === "live_nasa_power"
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : "border-amber-500/30 bg-amber-500/5",
                        )}
                      >
                        <div className="font-medium text-foreground">
                          {solar.average_daily_solar_radiation} kWh/m²/day avg
                          {solar.estimated_annual_solar_resource !== null && (
                            <span className="text-muted-foreground"> · ~{solar.estimated_annual_solar_resource.toLocaleString()} kWh/m²/yr</span>
                          )}
                        </div>
                        <div className="mt-0.5 text-muted-foreground">
                          {solar.provenance === "live_nasa_power"
                            ? `${solar.source} · ${solar.data_points} days · Johor site`
                            : "Demo fallback — NASA POWER unreachable"}
                          {" · "}
                          {solar.disclaimer.toLowerCase()} — evidence only, scenarios unchanged
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/5 p-2 text-[11px] text-red-300">
                        Solar resource lookup failed: {solar.error ?? "unknown error"}
                      </p>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Live market updates — real market_updates rows from Supabase with source
          and snapshot evidence. Pending rows never affect recommendations. */}
      <div className="rounded-xl border bg-card p-4">
        <PanelTitle
          right={
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={syncing} onClick={handleSync}>
                <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} /> {syncing ? "Syncing…" : "Sync CRESS source"}
              </Button>
              <Button
                size="sm"
                disabled={!anyApproved || rerunning}
                onClick={handleRerun}
                title={anyApproved ? "Recompute scenarios from the active approved assumption set" : "Disabled until an update is approved — pending updates never change results"}
              >
                <RefreshCw className={cn("size-3.5", rerunning && "animate-spin")} /> {rerunning ? "Rerunning…" : "Rerun strategy"}
              </Button>
            </div>
          }
        >
          Live market updates (Supabase)
        </PanelTitle>

        {lastSync && !lastSync.ok && (
          <p className="mb-2 rounded-lg border border-red-500/30 bg-red-500/5 p-2 text-[11px] text-red-300">
            Last sync failed: {lastSync.error}
          </p>
        )}
        {reviewError && (
          <p className="mb-2 rounded-lg border border-red-500/30 bg-red-500/5 p-2 text-[11px] text-red-300">
            Review failed: {reviewError}
          </p>
        )}
        {rerunDone && (
          <p className="mb-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 text-[11px] text-emerald-300">
            Strategy rerun complete — new scenario results saved.{" "}
            <button className="underline hover:text-emerald-200" onClick={() => goTo(5)}>View update impact</button>
          </p>
        )}

        {liveUpdates.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No live market updates loaded (database unreachable or empty). Use “Sync CRESS source” to fetch and
            snapshot the verified official source — new or changed content appears here for human review.
          </p>
        ) : (
          <div className="space-y-2">
            {liveUpdates.map((u) => {
              const isPending = ["pending_review", "needs_review"].includes(u.human_review_status);
              const sourceVerified = u.source?.verification_status === "verified_official";
              const busy = busyId === u.id;
              return (
                <div
                  key={u.id}
                  className={cn(
                    "rounded-lg border p-3",
                    isPending ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-background/40",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <Radar className={cn("size-4 shrink-0", isPending ? "text-amber-300" : "text-muted-foreground")} />
                    <span className="leading-tight">{u.title}</span>
                    <ReviewStatusBadge status={u.human_review_status} />
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{u.summary}</p>

                  {u.before_value !== null && u.after_value !== null && (
                    <div className="mt-1.5 text-[11px] text-muted-foreground">
                      Value: <span className="tabular-nums">{u.before_value}</span> →{" "}
                      <span className="tabular-nums font-medium text-foreground">{u.after_value}</span> {u.unit}
                    </div>
                  )}

                  {/* Source evidence (joined from source_registry) */}
                  {u.source && (
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground/90">{u.source.source_name}</span>
                      {u.source.authority && <span>· {u.source.authority}</span>}
                      {u.source.source_domain && <span className="font-mono text-[10px]">· {u.source.source_domain}</span>}
                      <VerificationBadge status={toVerification(u.source.verification_status)} />
                      {u.source.official_status === "internal_demo" && (
                        <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px]">Internal demo</span>
                      )}
                      {u.source.url && (
                        <a href={u.source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary/80 hover:text-primary" title={u.source.url}>
                          <ExternalLink className="size-3" /> source
                        </a>
                      )}
                    </div>
                  )}

                  {/* Snapshot evidence (joined from source_snapshots) */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                    <span>
                      Detected {new Date(u.detected_at).toLocaleString("en-MY", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span>Affects: {u.affected_scenarios.join(", ")}</span>
                    {u.snapshot && (
                      <span title={u.snapshot.content_hash ?? undefined}>
                        Snapshot {new Date(u.snapshot.fetched_at).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {u.snapshot.content_hash ? ` · hash ${u.snapshot.content_hash.slice(0, 12)}…` : ""}
                      </span>
                    )}
                    {u.reviewed_by && (
                      <span className="inline-flex items-center gap-1"><UserCheck className="size-3" /> {u.reviewed_by}</span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {isPending && (
                      <>
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          disabled={busy || !sourceVerified}
                          onClick={() => handleReview(u, "approve")}
                          title={sourceVerified ? "Record a demo approval (human review row + audit log)" : "Blocked — only verified official sources can be approved"}
                        >
                          <Check className="size-3.5" /> {busy ? "Saving…" : "Approve for demo"}
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => handleReview(u, "ignore")}>
                          <EyeOff className="size-3.5" /> Ignore for now
                        </Button>
                      </>
                    )}
                    <EvidenceButton target={{ type: "source", id: u.source_id }} label="Source evidence" />
                    <EvidenceButton target={{ type: "assumption", id: "ASM-CRESS-SAC" }} label="Assumption trail" />
                  </div>
                </div>
              );
            })}
            <p className="rounded-lg bg-muted/60 p-2 text-[11px] text-muted-foreground">
              Pending updates never change assumptions, scenario results, or recommendations. Approval and rerun are
              separate human steps — pre-feasibility only.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
