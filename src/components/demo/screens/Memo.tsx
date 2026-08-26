"use client";

import { useState } from "react";
import { Download, FileText, Printer, Share2, Sparkles, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchAiMemoDraft, type AiMemoDraftResult } from "@/lib/study";
import { useDemo } from "../context";
import { AiSourceBadge, DemoBadge, EvidenceButton, NumbersFromResultsChip, PanelTitle, PreFeasBadge, ScreenHeader, StatusBadge } from "../shared";

const AUDIENCES = ["CFO memo", "Board memo", "Ops memo"] as const;
const KEY_ASSUMPTIONS = ["ASM-GRID-TARIFF-AVG", "ASM-CRESS-SAC", "ASM-CRESS-PPA-RATE", "ASM-SOLAR-RESOURCE-JOHOR"];

export function Memo() {
  const { study, memos, latestMemo, createMemo, versionLabel, applied, assumptionRecordsAll, studyIsMalaysia, settings } = useDemo();

  // AI memo DRAFT — audience prose over the deterministic template (every figure
  // comes from the engine; audits reject deviations). NOT saved: human approval
  // via the existing memo flow stays the only path to a stored memo_versions row.
  const [aiDraft, setAiDraft] = useState<AiMemoDraftResult | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const generateAiDraft = async () => {
    if (draftLoading || !study) return;
    setDraftLoading(true);
    try {
      setAiDraft(await fetchAiMemoDraft(study, applied ? "0.2" : "0.1", "cfo", settings ?? undefined));
    } finally {
      setDraftLoading(false);
    }
  };

  if (!study) return null;
  const memo = latestMemo;
  const activeAssumptions = assumptionRecordsAll.filter((a) => a.active && KEY_ASSUMPTIONS.includes(a.assumption_key));

  return (
    <div className="space-y-5">
      <ScreenHeader
        n={7}
        title="Memo"
        intro="Board-ready deliverable assembled from approved inputs — versioned, with the evidence trail attached."
      >
        <DemoBadge />
        <PreFeasBadge />
      </ScreenHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Controls column */}
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <PanelTitle>Memo version</PanelTitle>
            <div className="grid gap-1 rounded-lg border bg-background/40 p-1">
              {AUDIENCES.map((a, i) => (
                <button
                  key={a}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                    i === 0 ? "bg-primary/15 font-medium text-primary ring-1 ring-primary/30" : "text-muted-foreground",
                  )}
                  disabled={i !== 0}
                  title={i !== 0 ? "Placeholder — other versions in a later phase" : undefined}
                >
                  {a} {i !== 0 && <span className="text-[10px] text-muted-foreground/60">· later</span>}
                </button>
              ))}
            </div>
            <div className="mt-3 space-y-1.5 text-[11px] text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Assumption set</span>
                <code className="rounded bg-muted px-1.5 py-0.5 text-primary">{versionLabel}</code>
              </div>
              <div className="flex items-center justify-between">
                <span>Approval</span>
                {memo ? <StatusBadge status={memo.human_review_status} /> : studyIsMalaysia && applied ? <StatusBadge status="approved" /> : <StatusBadge status="pending_review" />}
              </div>
              {memo && (
                <>
                  <div className="flex items-center justify-between">
                    <span>Record id</span>
                    <code className="max-w-36 truncate rounded bg-muted px-1.5 py-0.5 text-[9px]">{memo.id}</code>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Storage</span>
                    <span className={memo.persisted ? "text-emerald-300" : "text-amber-300"}>
                      {memo.persisted ? "Saved to Supabase" : "Local only"}
                    </span>
                  </div>
                  {memo.scenario_result_ids.length > 0 && (
                    <div className="flex items-center justify-between">
                      <span>Linked results</span>
                      <span>{memo.scenario_result_ids.length} scenario rows</span>
                    </div>
                  )}
                </>
              )}
            </div>
            <Button className="mt-3 w-full" onClick={createMemo}>
              <FileText className="size-4" /> {memo ? `Regenerate (v${memo.version + 1})` : "Generate memo"}
            </Button>
            <Button
              variant="outline"
              className="mt-2 w-full"
              disabled={draftLoading}
              onClick={generateAiDraft}
              title="AI rewrites the deterministic memo template for the audience — figures unchanged, audited, not saved until approved"
            >
              <Sparkles className="size-4 text-violet-300" /> {draftLoading ? "Drafting…" : "Generate memo draft"}
            </Button>
            {memo && (
              <div className="mt-2 grid gap-1.5">
                {/* Export reads the SAVED memo_versions record server-side, so a
                    local-only memo (DB unreachable) cannot be exported. */}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!memo.persisted}
                  title={
                    memo.persisted
                      ? "Opens a printable memo — use the Print / Save as PDF button on that page"
                      : "Memo is local-only (not saved to Supabase) — export needs the saved record"
                  }
                  onClick={() => window.open(`/api/memos/${encodeURIComponent(memo.id)}/export?format=html`, "_blank")}
                >
                  <Printer className="size-3.5" /> Export memo (print / PDF)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!memo.persisted}
                  title={
                    memo.persisted
                      ? "Downloads the memo as a Markdown file"
                      : "Memo is local-only (not saved to Supabase) — export needs the saved record"
                  }
                  onClick={() => window.open(`/api/memos/${encodeURIComponent(memo.id)}/export?format=md`, "_blank")}
                >
                  <Download className="size-3.5" /> Download Markdown
                </Button>
                {memo.human_review_status !== "approved" && (
                  <p className="text-[10px] leading-relaxed text-amber-300/90">
                    This memo is pending human review — the export is watermarked accordingly.
                  </p>
                )}
                <Button variant="outline" size="sm" disabled title="Placeholder — sharing in a later phase">
                  <Share2 className="size-3.5" /> Share internally (later)
                </Button>
              </div>
            )}
          </div>

          {memos.length > 0 && (
            <div className="rounded-xl border bg-card p-4">
              <PanelTitle>Version history</PanelTitle>
              <div className="space-y-1.5">
                {[...memos].reverse().map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-xs">
                    <span className={cn(m.id === memo?.id ? "font-medium" : "text-muted-foreground")}>
                      v{m.version} · {m.assumption_set_version}
                    </span>
                    <StatusBadge status={m.human_review_status} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Memo preview */}
        <div className="lg:col-span-2">
          {!memo ? (
            <div className="flex h-full min-h-72 flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/50 p-8 text-center">
              <FileText className="size-8 text-muted-foreground/50" />
              <p className="max-w-sm text-sm text-muted-foreground">
                Generate the memo to assemble the preview from your baseline, scenarios, and recommendation.
              </p>
              {studyIsMalaysia && !applied && (
                <p className="text-[11px] text-amber-300/90">Tip: approve the CRESS update in Refinement first for the freshest inputs.</p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border bg-card">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold">Power Strategy Memo — CFO version</span>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px]",
                        memo.human_review_status === "approved"
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                          : "border-amber-500/40 bg-amber-500/10 text-amber-300",
                      )}
                    >
                      <UserCheck className="mr-1 inline size-3" />
                      {memo.human_review_status === "approved" ? "Human-approved (demo)" : "Pending human review"}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {study.project_name} · memo v{memo.version} · assumptions {memo.assumption_set_version} ·{" "}
                    {new Date(memo.created_at).toLocaleDateString("en-MY")}
                  </div>
                </div>
                <PreFeasBadge />
              </div>

              <div className="grid gap-3 p-4 sm:grid-cols-2">
                {memo.content.map((sec, i) => (
                  <div
                    key={sec.key}
                    className={cn("rounded-lg border bg-background/40 p-3", (i === 0 || sec.key === "scenarios") && "sm:col-span-2")}
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                      {i + 1} · {sec.title}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{sec.body}</p>
                  </div>
                ))}

                {/* Key assumptions with live evidence links */}
                <div className="rounded-lg border bg-background/40 p-3 sm:col-span-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">Evidence · key assumptions ({versionLabel})</div>
                  <div className="mt-1.5 grid gap-1">
                    {activeAssumptions.map((a) => (
                      <div key={a.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-muted-foreground">{a.label}</span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <span className="tabular-nums">{a.value ?? "—"} {a.unit}</span>
                          <StatusBadge status={a.human_review_status} />
                          <EvidenceButton target={{ type: "assumption", id: a.assumption_key }} label="" />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t p-3">
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  Demo-grade · pre-feasibility only · not official tariff-grade financial advice · no official grid
                  approval is claimed · human approval required before any final recommendation.
                  {!studyIsMalaysia && ` Country module for ${study.country} is a limited demo — no country-specific accuracy claimed.`}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI memo draft — audience prose over the deterministic template. NOT a
          saved memo_versions row: pending human review until approved & saved. */}
      {(draftLoading || aiDraft) && (
        <div className="rounded-xl border border-violet-500/25 bg-card p-4">
          <PanelTitle
            right={
              aiDraft?.source ? (
                <span className="flex items-center gap-1.5">
                  <AiSourceBadge source={aiDraft.source} />
                  <NumbersFromResultsChip />
                  <PreFeasBadge />
                </span>
              ) : undefined
            }
          >
            <span className="flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-violet-300" /> AI memo draft (CFO) — not saved
            </span>
          </PanelTitle>

          {draftLoading && <p className="text-sm text-muted-foreground">Rewriting the deterministic template for a CFO audience…</p>}

          {!draftLoading && aiDraft && !aiDraft.ok && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/5 p-2 text-[11px] text-red-300">
              Draft unavailable: {aiDraft.error}
            </p>
          )}

          {!draftLoading && aiDraft?.ok && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span
                  className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300"
                >
                  <UserCheck className="mr-1 inline size-3" />
                  {aiDraft.human_review_status === "pending_review" ? "Pending human review" : aiDraft.human_review_status}
                </span>
                Draft only — approve and save via “{memo ? `Regenerate (v${memo.version + 1})` : "Generate memo"}” before any export or sharing.
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {aiDraft.sections.map((sec, i) => (
                  <div
                    key={sec.key}
                    className={cn("rounded-lg border bg-background/40 p-3", (i === 0 || sec.key === "scenarios") && "sm:col-span-2")}
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-violet-300">
                      {i + 1} · {sec.title}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{sec.body}</p>
                  </div>
                ))}
              </div>

              {aiDraft.caveat && (
                <p className="rounded-lg bg-muted/60 p-2.5 text-[11px] leading-relaxed text-muted-foreground">{aiDraft.caveat}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
