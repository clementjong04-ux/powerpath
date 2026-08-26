"use client";

import { useEffect, useState } from "react";
import { Database, ExternalLink, ShieldCheck, UserCheck } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { isInternalDemo, sourceWarning, verificationOf } from "@/lib/sourcePolicy";
import { fetchEvidenceTrail, type EvidenceTrail } from "@/lib/study";
import type { VerificationStatus } from "@/lib/types";
import { useDemo } from "./context";
import { ConfidenceBadge, DemoBadge, PreFeasBadge, ProvenanceBadge, Provisional, ReviewStatusBadge, StatusBadge, VerificationBadge } from "./shared";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

function toVerification(v: string | null | undefined): VerificationStatus {
  return v === "verified_official" || v === "pending" || v === "not_official_source" ? v : "unverified";
}

// One stage in the evidence chain — a labelled card on a connector line.
function ChainStage({ label, empty, children }: { label: string; empty?: string; children?: React.ReactNode }) {
  return (
    <div className="relative pl-4 pb-3 last:pb-0">
      <span className="absolute left-0 top-1.5 size-2 rounded-full border border-primary/60 bg-primary/20" />
      <span className="absolute left-[3.5px] top-4 bottom-0 w-px bg-border" />
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      {children ?? <p className="mt-1 text-[11px] italic text-muted-foreground/70">{empty ?? "Not yet recorded."}</p>}
    </div>
  );
}

function Mono({ children, title }: { children: React.ReactNode; title?: string }) {
  return <code className="break-all font-mono text-[10px] text-muted-foreground" title={title}>{children}</code>;
}

// The live chain: source_registry → source_snapshot → market_update (+ human
// review) → assumption_version → scenario_result → memo_version, straight from
// Supabase. This is the audit trail that answers "how do you prevent
// hallucination and wrong tariff assumptions" — every stage is a database row.
function LiveEvidenceChain({ sourceId, assumptionKey }: { sourceId?: string; assumptionKey?: string }) {
  const { study } = useDemo();
  // Keyed result: content for a different target renders as "loading" instead of
  // stale data, without any synchronous setState in the effect body.
  const key = `${sourceId ?? ""}|${assumptionKey ?? ""}|${study?.persisted ? study.id : ""}`;
  const [result, setResult] = useState<{ key: string; trail: EvidenceTrail | null }>({ key: "", trail: null });

  useEffect(() => {
    let alive = true;
    void fetchEvidenceTrail({
      sourceId,
      assumptionKey,
      projectId: study?.persisted ? study.id : undefined,
    }).then((t) => {
      if (alive) setResult({ key, trail: t });
    });
    return () => {
      alive = false;
    };
  }, [key, sourceId, assumptionKey, study]);

  const loaded = result.key === key;
  const trail = loaded ? result.trail : null;

  if (!loaded) {
    return <p className="text-[11px] text-muted-foreground">Loading live evidence chain…</p>;
  }
  if (!trail) {
    return (
      <p className="rounded-lg border border-border bg-muted/40 p-2 text-[11px] text-muted-foreground">
        Live evidence chain unavailable (database unreachable) — registry details above are from local fixtures.
      </p>
    );
  }

  const s = trail.source;
  const snap = trail.snapshot;
  const latestRun = trail.scenario_results;
  const reviewFor = (updateId: string) => trail.human_reviews.find((r) => r.target_id === updateId);
  const fmtTs = (ts: string) =>
    new Date(ts).toLocaleString("en-MY", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Live evidence chain</div>
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">Supabase live</span>
      </div>

      {/* 1. source_registry */}
      <ChainStage label="Source registry" empty="Source not found in the live registry.">
        {s && (
          <div className="mt-1 space-y-0.5 text-[11px]">
            <div className="font-medium text-foreground">{s.source_name}</div>
            <div className="text-muted-foreground">
              {s.authority ?? "—"}
              {s.source_domain && <span className="font-mono text-[10px]"> · {s.source_domain}</span>}
            </div>
            {s.url && (
              <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-[10px] text-primary underline-offset-2 hover:underline">
                <ExternalLink className="size-3 shrink-0" /> {s.url}
              </a>
            )}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <VerificationBadge status={toVerification(s.verification_status)} />
              {s.official_status && (
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                  {s.official_status.replace(/_/g, " ")}
                </span>
              )}
              {s.verified_at && <span className="text-[10px] text-muted-foreground">verified {new Date(s.verified_at).toLocaleDateString("en-MY")}</span>}
            </div>
            {s.evidence_note && <p className="pt-0.5 text-[10px] text-muted-foreground">{s.evidence_note}</p>}
          </div>
        )}
      </ChainStage>

      {/* 2. source_snapshot */}
      <ChainStage label="Source snapshot" empty="No snapshot yet — run “Sync CRESS source” to capture one.">
        {snap && (
          <div className="mt-1 space-y-0.5 text-[11px]">
            <div className="text-muted-foreground">
              Checked {fmtTs(snap.checked_at)}
              {snap.http_status !== null && ` · HTTP ${snap.http_status}`}
            </div>
            {snap.content_hash && <Mono title={snap.content_hash}>hash {snap.content_hash.slice(0, 16)}…</Mono>}
            {snap.excerpt && (
              <p className="rounded-md border border-border bg-background/40 p-2 text-[10px] italic leading-relaxed text-muted-foreground">
                “{snap.excerpt.slice(0, 220)}{snap.excerpt.length > 220 ? "…" : ""}”
              </p>
            )}
            {snap.extraction_note && <p className="text-[10px] text-muted-foreground/70">{snap.extraction_note}</p>}
          </div>
        )}
      </ChainStage>

      {/* 3. market_update + 4-in-chain human_review */}
      <ChainStage label="Market updates & human review" empty="No detected updates for this source.">
        {trail.market_updates.length > 0 && (
          <div className="mt-1 space-y-1.5">
            {trail.market_updates.map((u) => {
              const review = reviewFor(u.id);
              return (
                <div key={u.id} className="rounded-md border border-border bg-background/40 p-2 text-[11px]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium leading-tight text-foreground">{u.title}</span>
                    <ReviewStatusBadge status={u.human_review_status} />
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    Detected {fmtTs(u.detected_at)} · affects {u.affected_scenarios.join(", ")}
                  </div>
                  {review ? (
                    <div className="mt-1 flex items-start gap-1.5 rounded-md bg-muted/50 p-1.5 text-[10px] text-muted-foreground">
                      <UserCheck className="mt-0.5 size-3 shrink-0 text-emerald-400" />
                      <span>
                        <span className="font-medium text-foreground">{review.reviewer_name}</span> — {review.decision.replace(/_/g, " ")},{" "}
                        {fmtTs(review.reviewed_at)}
                        {review.note && <span className="block pt-0.5">{review.note}</span>}
                      </span>
                    </div>
                  ) : (
                    <div className="mt-1 text-[10px] italic text-muted-foreground/70">No human review recorded yet — update cannot affect results.</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ChainStage>

      {/* 4. assumption_version */}
      <ChainStage label="Assumption versions" empty="No assumption versions recorded for this source.">
        {trail.assumption_versions.length > 0 && (
          <div className="mt-1 overflow-hidden rounded-md border">
            {trail.assumption_versions.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center justify-between gap-1.5 border-b bg-background/40 px-2 py-1.5 text-[11px] last:border-b-0">
                <span className="flex items-center gap-1.5">
                  <Mono>{v.id}</Mono>
                  {v.active && (
                    <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-300">active</span>
                  )}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="tabular-nums text-muted-foreground">{v.value ?? "—"} {v.unit}</span>
                  <span className="text-[9px] text-muted-foreground">{v.confidence}</span>
                  <ReviewStatusBadge status={v.human_review_status} />
                </span>
              </div>
            ))}
          </div>
        )}
      </ChainStage>

      {/* 5. scenario_result */}
      <ChainStage label="Scenario results (latest saved run)" empty="No persisted scenario results for this study yet.">
        {latestRun.length > 0 && (
          <div className="mt-1 space-y-1">
            {latestRun.map((r) => (
              <div key={r.id} className="rounded-md border border-border bg-background/40 p-2 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{r.scenario_key}</span>
                  <span className="text-[10px] text-muted-foreground">set {r.assumption_set_version} · {r.calculation_trace.length} trace steps</span>
                </div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  trace: {r.calculation_trace.slice(0, 3).map((t) => t.label).join(" · ")}
                  {r.calculation_trace.length > 3 ? " · …" : ""}
                </div>
                {r.assumption_version_ids.length > 0 && (
                  <div className="mt-0.5"><Mono>{r.assumption_version_ids.join(", ")}</Mono></div>
                )}
              </div>
            ))}
          </div>
        )}
      </ChainStage>

      {/* 6. memo_version */}
      <ChainStage label="Memo version" empty="No memo draft saved for this study yet.">
        {trail.memo_version && (
          <div className="mt-1 rounded-md border border-border bg-background/40 p-2 text-[11px]">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium text-foreground">Memo v{trail.memo_version.version}</span>
              <ReviewStatusBadge status={trail.memo_version.human_review_status} />
              <span className="text-[10px] text-muted-foreground">{fmtTs(trail.memo_version.created_at)}</span>
            </div>
            {trail.memo_version.market_update_ids.length > 0 && (
              <div className="mt-1 text-[10px] text-muted-foreground">
                Built from updates: <Mono>{trail.memo_version.market_update_ids.join(", ")}</Mono>
              </div>
            )}
            {trail.memo_version.assumption_version_ids.length > 0 && (
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                Assumptions cited: <Mono>{trail.memo_version.assumption_version_ids.slice(0, 4).join(", ")}{trail.memo_version.assumption_version_ids.length > 4 ? ", …" : ""}</Mono>
              </div>
            )}
          </div>
        )}
      </ChainStage>
    </div>
  );
}

function TrustRuleBox() {
  return (
    <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
        <ShieldCheck className="size-3.5 text-primary" /> How we prevent hallucination & wrong tariff assumptions
      </div>
      <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
        <li><span className="font-medium text-foreground">Code calculates.</span> Every number comes from deterministic formulas — never from the LLM.</li>
        <li><span className="font-medium text-foreground">Sources provide evidence.</span> Every assumption cites a registered source with a version.</li>
        <li><span className="font-medium text-foreground">LLM explains.</span> AI narrates results; it cannot invent or change a number.</li>
        <li><span className="font-medium text-foreground">Human approves.</span> No assumption or recommendation changes without recorded approval.</li>
      </ul>
    </div>
  );
}

const KEY_ASSUMPTIONS = [
  "ASM-CRESS-SAC",
  "ASM-SOLAR-RESOURCE-JOHOR",
  "ASM-GRID-EMISSION-FACTOR",
  "ASM-BESS-CAPEX",
];

export function EvidenceDrawer() {
  const { evidence, closeEvidence, openEvidence, versionLabel, data, scenarios, assumptionRecordsAll, study } = useDemo();

  const open = evidence !== null;
  const activeRecords = assumptionRecordsAll.filter((a) => a.active);

  let title = "Evidence & Assumptions";
  let body: React.ReactNode = null;

  // ---- Trust overview (sidebar tab 8) ----
  if (evidence?.type === "trust") {
    body = (
      <div className="space-y-4">
        <TrustRuleBox />
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Key assumptions ({versionLabel}{study ? ` · ${study.data_status === "sample_case" ? "sample study" : "user study"}` : ""})
          </div>
          <div className="overflow-hidden rounded-lg border">
            {KEY_ASSUMPTIONS.map((key) => {
              const a = activeRecords.find((x) => x.assumption_key === key);
              if (!a) return null;
              return (
                <button
                  key={key}
                  onClick={() => openEvidence({ type: "assumption", id: key })}
                  className="flex w-full items-center justify-between gap-2 border-b bg-background/30 px-3 py-2 text-left text-xs transition-colors last:border-b-0 hover:bg-accent"
                >
                  <span className="truncate">{a.label}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="tabular-nums text-muted-foreground">{a.value ?? "—"} {a.unit}</span>
                    <StatusBadge status={a.human_review_status} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Framework references (Malaysia module)</div>
          <div className="space-y-1.5">
            {data.sources.filter((s) => s.id !== "SRC-DEMO-SEED").map((s) => (
              <button
                key={s.id}
                onClick={() => openEvidence({ type: "source", id: s.id })}
                className="flex w-full items-center gap-2 rounded-lg border bg-background/30 px-3 py-2 text-left text-xs transition-colors hover:bg-accent"
              >
                <Database className="size-3.5 shrink-0 text-primary/70" />
                <span className="flex-1 truncate">{s.name}</span>
                <VerificationBadge status={verificationOf(s)} />
              </button>
            ))}
          </div>
        </div>
        {/* The hero closed loop, straight from the database — the answer to
            "how do you prevent hallucination and wrong tariff assumptions". */}
        <LiveEvidenceChain sourceId="SRC-CRESS-SAC" assumptionKey="ASM-CRESS-SAC" />
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Demo-grade · pre-feasibility only · no official tariff-grade advice · no grid-approval claims · human approval required.
        </p>
      </div>
    );
  }

  // ---- Single assumption (active version record) ----
  if (evidence?.type === "assumption") {
    const a = activeRecords.find((x) => x.assumption_key === evidence.id);
    const source = a && data.sources.find((s) => s.id === a.source_id);
    if (a) {
      title = a.label;
      body = (
        <div className="space-y-1">
          <Row label="Value">{a.value === null ? "—" : `${a.value} ${a.unit}`}</Row>
          <Row label="Assumption key"><code className="text-xs">{a.assumption_key}</code></Row>
          <Row label="Version record"><code className="text-xs">{a.id}</code></Row>
          <Row label="Country">{a.country}</Row>
          <Row label="Effective date">{a.effective_date}</Row>
          <Row label="Confidence"><ConfidenceBadge confidence={a.confidence} /></Row>
          <Row label="Reviewer status"><StatusBadge status={a.human_review_status} /></Row>
          {a.reviewed_by && <Row label="Reviewed by">{a.reviewed_by}</Row>}
          {a.provisional && <Row label="State"><Provisional reason={a.caveat} /></Row>}
          <Row label="Affected models">{a.affected_models.join(", ")}</Row>
          <Row label="Last checked">demo seed</Row>
          <Separator className="my-3" />
          <div className="flex items-center gap-2 text-sm font-medium">
            <Database className="size-4 text-primary/70" /> Source
          </div>
          {source ? (
            <div className="mt-1 space-y-1">
              <Row label="Source ID"><code className="text-xs">{source.id}</code></Row>
              <Row label="Name">{source.name}</Row>
              <Row label="Authority">{source.authority}</Row>
              <Row label="Verification"><VerificationBadge status={verificationOf(source)} /></Row>
              {source.source_domain && <Row label="Domain">{source.source_domain}</Row>}
              {isInternalDemo(source) && (
                <p className="rounded-lg border border-border bg-muted/50 p-2 text-[11px] text-muted-foreground">
                  Backed by an internal demo source — clearly labeled, and it can never receive or
                  drive live updates. Replace with a verified official source before any customer claim.
                </p>
              )}
              {sourceWarning(source) && !isInternalDemo(source) && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-200/90">
                  {sourceWarning(source)}
                </p>
              )}
              <p className="pt-2 text-xs text-muted-foreground">{source.trust_note}</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Source not found in registry.</p>
          )}
          <Separator className="my-3" />
          <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">{a.caveat}</p>
          <Separator className="my-3" />
          <LiveEvidenceChain sourceId={a.source_id} assumptionKey={a.assumption_key} />
          <Separator className="my-3" />
          <TrustRuleBox />
        </div>
      );
    }
  }

  // ---- Scenario trace ----
  if (evidence?.type === "scenario") {
    const s = scenarios.find((x) => x.scenario_key === evidence.id);
    if (s) {
      title = `${s.name} — calculation trace`;
      body = (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {s.provisional && <Provisional reason={s.provisional_reason} />}
            <ConfidenceBadge confidence={s.confidence} />
            <span className="text-xs text-muted-foreground">assumption set {versionLabel}</span>
          </div>
          <div className="rounded-lg border bg-background/30 p-2.5 text-[10px] text-muted-foreground">
            Result record: <code>{s.id}</code>
          </div>
          {s.inputs.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Inputs & their source</div>
              <div className="overflow-hidden rounded-lg border">
                {s.inputs.map((i, idx) => {
                  const isAssumption = i.provenance !== "user_input";
                  const RowTag = isAssumption ? "button" : "div";
                  return (
                    <RowTag
                      key={`${i.assumption_id}-${idx}`}
                      onClick={isAssumption ? () => openEvidence({ type: "assumption", id: i.assumption_id }) : undefined}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 border-b bg-background/30 px-3 py-2 text-left text-sm last:border-b-0",
                        isAssumption && "transition-colors hover:bg-accent",
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {i.label} <ProvenanceBadge provenance={i.provenance} />
                      </span>
                      <span className="shrink-0 text-xs font-medium tabular-nums">{i.value === null ? "—" : `${i.value} ${i.unit}`}</span>
                    </RowTag>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deterministic steps</div>
            <ol className="space-y-2">
              {s.calculation_trace.map((t, idx) => (
                <li key={idx} className="rounded-lg border bg-background/30 p-3 text-sm">
                  <div className="text-xs font-medium">{idx + 1}. {t.label}</div>
                  <div className="mt-1 font-mono text-[11px] leading-relaxed text-muted-foreground">{t.detail}</div>
                </li>
              ))}
            </ol>
          </div>
          <TrustRuleBox />
        </div>
      );
    }
  }

  // ---- Source ----
  if (evidence?.type === "source") {
    const s = data.sources.find((x) => x.id === evidence.id);
    if (s) {
      const warning = sourceWarning(s);
      title = s.name;
      body = (
        <div className="space-y-1">
          <Row label="Source name">{s.name}</Row>
          <Row label="Source ID"><code className="text-xs">{s.id}</code></Row>
          <Row label="Authority">{s.authority}</Row>
          <Row label="URL">
            {s.url ? (
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-primary underline-offset-2 hover:underline">
                {s.url}
              </a>
            ) : (
              "—"
            )}
          </Row>
          <Row label="Source domain">{s.source_domain ?? "—"}</Row>
          <Row label="Official status">{s.official_status?.replace(/_/g, " ") ?? "—"}</Row>
          <Row label="Verification"><VerificationBadge status={verificationOf(s)} /></Row>
          <Row label="Verified at">{s.verified_at ? new Date(s.verified_at).toLocaleDateString("en-MY") : "—"}</Row>
          {s.verified_by && <Row label="Verified by">{s.verified_by}</Row>}
          <Row label="Type">{s.type}</Row>
          {s.covers && <Row label="Covers">{s.covers.join(", ")}</Row>}
          {s.evidence_note && (
            <p className="mt-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Evidence note: </span>{s.evidence_note}
            </p>
          )}
          {warning && (
            <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200/90">
              {warning}
            </p>
          )}
          <Separator className="my-3" />
          <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">{s.trust_note}</p>
          <Separator className="my-3" />
          <LiveEvidenceChain sourceId={s.id} />
          <Separator className="my-3" />
          <TrustRuleBox />
        </div>
      );
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && closeEvidence()}>
      <SheetContent className="w-full overflow-y-auto border-l bg-sidebar sm:max-w-md">
        <SheetHeader>
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-primary">
            <ShieldCheck className="size-4" /> Evidence Drawer
          </div>
          <SheetTitle className="text-left">{title}</SheetTitle>
          <SheetDescription className="text-left">
            <span className="flex items-center gap-2">
              <DemoBadge /> <PreFeasBadge />
            </span>
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-8">{body}</div>
      </SheetContent>
    </Sheet>
  );
}
