"use client";

import { CheckCircle2, FileSearch, RefreshCw, ShieldCheck, UserCheck, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import type { Confidence, ReviewerStatus, ScenarioTag, ValueProvenance, VerificationStatus } from "@/lib/types";
import { VERIFICATION_LABEL } from "@/lib/sourcePolicy";
import { useDemo, type EvidenceRef } from "./context";

// ---------- Value provenance badge (where a calculation value came from) ----------
const PROVENANCE_STYLES: Record<ValueProvenance, string> = {
  approved_assumption_version: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  demo_fallback: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  user_input: "border-sky-500/40 bg-sky-500/10 text-sky-300",
};

const PROVENANCE_LABEL: Record<ValueProvenance, string> = {
  approved_assumption_version: "Approved version",
  demo_fallback: "Demo fallback",
  user_input: "Your input",
};

export function ProvenanceBadge({ provenance }: { provenance: ValueProvenance }) {
  return (
    <Badge variant="outline" className={cn("text-[9px]", PROVENANCE_STYLES[provenance])}>
      {PROVENANCE_LABEL[provenance]}
    </Badge>
  );
}

// ---------- KPI tile ----------
export function KpiCard({
  label,
  value,
  sub,
  accent,
  icon: Icon,
  progress,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "default" | "positive" | "warning" | "danger";
  icon?: React.ComponentType<{ className?: string }>;
  progress?: number; // 0–100 mini bar under the value
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border bg-card p-4 transition-colors hover:border-primary/40">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
        {Icon && <Icon className="size-4 text-muted-foreground/60" />}
      </div>
      <div
        className={cn(
          "mt-1.5 text-2xl font-semibold tabular-nums tracking-tight",
          accent === "positive" && "text-emerald-400",
          accent === "warning" && "text-amber-400",
          accent === "danger" && "text-rose-400",
        )}
      >
        {value}
      </div>
      {typeof progress === "number" && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(progress, 100)}%` }} />
        </div>
      )}
      {sub && <div className="mt-1.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ---------- Trust badges ----------
export function DemoBadge() {
  return (
    <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300">
      Demo-grade
    </Badge>
  );
}

export function PreFeasBadge() {
  return (
    <Badge variant="outline" className="border-sky-500/40 bg-sky-500/10 text-sky-300">
      Pre-feasibility
    </Badge>
  );
}

const STATUS_STYLES: Record<ReviewerStatus, string> = {
  approved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  demo_seed: "border-border bg-muted text-muted-foreground",
  pending_review: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  needs_review: "border-rose-500/40 bg-rose-500/10 text-rose-300",
};

const STATUS_LABEL: Record<ReviewerStatus, string> = {
  approved: "Approved",
  demo_seed: "Demo seed",
  pending_review: "Pending review",
  needs_review: "Needs review",
};

export function StatusBadge({ status }: { status: ReviewerStatus }) {
  return (
    <Badge variant="outline" className={STATUS_STYLES[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

// ---------- Market-update review status badge (DB human_review_status values) ----------
const REVIEW_BADGE: Record<string, { label: string; className: string }> = {
  needs_review: { label: "Needs review", className: "border-rose-500/40 bg-rose-500/10 text-rose-300" },
  pending_review: { label: "Pending review", className: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  approved_demo: { label: "Approved (demo)", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  approved: { label: "Approved (demo)", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  ignored: { label: "Ignored", className: "border-border bg-muted text-muted-foreground" },
  rejected: { label: "Ignored", className: "border-border bg-muted text-muted-foreground" },
  demo_seed: { label: "Demo seed", className: "border-border bg-muted text-muted-foreground" },
};

export function ReviewStatusBadge({ status }: { status: string }) {
  const b = REVIEW_BADGE[status] ?? { label: status, className: "border-border bg-muted text-muted-foreground" };
  return (
    <Badge variant="outline" className={b.className}>
      {b.label}
    </Badge>
  );
}

// ---------- AI text-source badge (which path produced the prose) ----------
// "ai": passed the number + banned-phrase audits. "deterministic_template":
// the code-written fallback (missing key, API failure, or audit rejection).
export function AiSourceBadge({ source }: { source: "ai" | "deterministic_template" }) {
  return source === "ai" ? (
    <Badge variant="outline" className="border-violet-500/40 bg-violet-500/10 text-violet-300">
      AI-generated
    </Badge>
  ) : (
    <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300">
      Deterministic fallback
    </Badge>
  );
}

export function NumbersFromResultsChip() {
  return (
    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
      Numbers from scenario_results
    </span>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const map: Record<Confidence, string> = {
    high: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    medium: "border-sky-500/40 bg-sky-500/10 text-sky-300",
    low: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    demo: "border-border bg-muted text-muted-foreground",
  };
  return (
    <Badge variant="outline" className={map[confidence]}>
      {confidence} confidence
    </Badge>
  );
}

export function Provisional({ reason }: { reason?: string }) {
  return (
    <Badge variant="outline" className="border-orange-500/40 bg-orange-500/10 text-orange-300" title={reason}>
      Provisional
    </Badge>
  );
}

// ---------- Source verification badge ----------
const VERIFICATION_STYLES: Record<VerificationStatus, string> = {
  verified_official: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  pending: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  unverified: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  not_official_source: "border-border bg-muted text-muted-foreground",
};

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  return (
    <Badge variant="outline" className={VERIFICATION_STYLES[status]}>
      {status === "verified_official" && <ShieldCheck className="mr-0.5 size-3" />}
      {VERIFICATION_LABEL[status]}
    </Badge>
  );
}

// ---------- Scenario tags ----------
const TAG_STYLES: Record<ScenarioTag, string> = {
  recommended: "border-emerald-500/50 bg-emerald-500/15 text-emerald-300",
  watch: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  not_yet: "border-border bg-muted text-muted-foreground",
  needs_validation: "border-orange-500/40 bg-orange-500/10 text-orange-300",
};

const TAG_LABEL: Record<ScenarioTag, string> = {
  recommended: "Recommended",
  watch: "Watch",
  not_yet: "Not yet",
  needs_validation: "Needs validation",
};

export function ScenarioTagBadge({ tag }: { tag: ScenarioTag }) {
  return (
    <Badge variant="outline" className={TAG_STYLES[tag]}>
      {TAG_LABEL[tag]}
    </Badge>
  );
}

// ---------- Evidence affordance ----------
export function EvidenceButton({ target, label = "Evidence" }: { target: EvidenceRef; label?: string }) {
  const { openEvidence } = useDemo();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-primary"
      onClick={() => openEvidence(target)}
    >
      <FileSearch className="size-3.5" />
      {label}
    </Button>
  );
}

// ---------- Screen header ----------
export function ScreenHeader({
  title,
  intro,
  children,
}: {
  n?: number; // kept for call-site compatibility; no longer displayed
  title: string;
  intro: string;
  children?: React.ReactNode;
}) {
  const { study } = useDemo();
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wider text-primary">
          {study ? `${study.project_name} · ${study.country}` : BRAND.name}
        </div>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{intro}</p>
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

// ---------- Closed-loop strip ----------
const LOOP_STAGES = [
  { key: "sync", label: "Source sync", icon: RefreshCw },
  { key: "detect", label: "Update detected", icon: Zap },
  { key: "approve", label: "Human approval", icon: UserCheck },
  { key: "rerun", label: "Rerun strategy", icon: RefreshCw },
  { key: "memo", label: "Memo refresh", icon: CheckCircle2 },
] as const;

export function LoopStrip({ stage }: { stage: number }) {
  // stage: how many stages are "done" (0–5)
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border bg-card/60 px-3 py-2.5">
      {LOOP_STAGES.map((s, i) => {
        const done = i < stage;
        const active = i === stage;
        const Icon = s.icon;
        return (
          <div key={s.key} className="flex items-center gap-1.5">
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                done && "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
                active && "border-amber-500/50 bg-amber-500/10 text-amber-300",
                !done && !active && "border-border text-muted-foreground",
              )}
            >
              <Icon className="size-3" />
              {s.label}
            </div>
            {i < LOOP_STAGES.length - 1 && <span className="text-muted-foreground/40">→</span>}
          </div>
        );
      })}
    </div>
  );
}

// ---------- Panel section title ----------
export function PanelTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</h2>
      {right}
    </div>
  );
}
