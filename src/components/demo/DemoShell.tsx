"use client";

import {
  ArrowLeft,
  ArrowRight,
  Building2,
  ChevronDown,
  Columns3,
  FileSearch,
  FileText,
  FlaskConical,
  Gauge,
  Lightbulb,
  Radar,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Zap,
} from "lucide-react";
import type { DemoData } from "@/lib/types";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DemoProvider, NAV, useDemo } from "./context";
import { DemoBadge, PreFeasBadge } from "./shared";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { StudySetup } from "./screens/StudySetup";
import { BaselineScreen } from "./screens/Baseline";
import { ScenarioComparison } from "./screens/ScenarioComparison";
import { MarketIntelligence } from "./screens/MarketIntelligence";
import { Refinement } from "./screens/Refinement";
import { Recommendation } from "./screens/Recommendation";
import { Memo } from "./screens/Memo";

const ICONS = [FlaskConical, Gauge, Columns3, Radar, SlidersHorizontal, Lightbulb, FileText];

function TopBar() {
  const { phase, study, openEvidence, applied, studyIsMalaysia, backToLanding, syncing, lastSync, syncSources } = useDemo();
  const inWorkspace = phase === "workspace" && study;
  return (
    <header className="flex h-14 items-center gap-3 border-b bg-sidebar px-4">
      <button className="flex items-center gap-2.5" onClick={backToLanding} title="Back to landing">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_16px_-2px] shadow-primary/50">
          <Zap className="size-4" />
        </div>
        <div className="text-sm font-semibold tracking-tight" title={BRAND.tagline}>
          Power<span className="text-primary">path</span>
        </div>
      </button>

      {inWorkspace && (
        <button
          className="ml-2 hidden items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-xs hover:border-primary/40 md:flex"
          title="Active study (multi-project selector arrives with Supabase persistence)"
        >
          <Building2 className="size-3.5 text-muted-foreground" />
          <span className="max-w-44 truncate font-medium">{study.project_name}</span>
          <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {study.country}
          </span>
          {study.data_status === "sample_case" && (
            <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-300">sample</span>
          )}
          <ChevronDown className="size-3 text-muted-foreground" />
        </button>
      )}

      <div className="hidden items-center gap-1.5 lg:flex">
        <DemoBadge />
        <PreFeasBadge />
      </div>

      <div className="ml-auto flex items-center gap-2">
        {inWorkspace && (
          <div className="hidden items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground xl:flex">
            <span className={cn("size-1.5 rounded-full", !studyIsMalaysia ? "bg-zinc-400" : applied ? "bg-emerald-400" : "bg-amber-400")} />
            {studyIsMalaysia
              ? `Malaysia module · ${applied ? "1 update approved" : "1 update pending review"}`
              : "Limited demo module"}
          </div>
        )}
        {lastSync && (
          <span
            className={cn(
              "hidden rounded-full border px-2 py-0.5 text-[10px] lg:inline",
              !lastSync.ok
                ? "border-red-500/40 bg-red-500/10 text-red-300"
                : lastSync.changed
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
            )}
            title={lastSync.error ?? undefined}
          >
            {!lastSync.ok
              ? "Sync failed"
              : lastSync.changed
                ? "Change detected — pending review"
                : "Synced — no change"}
          </span>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={syncing}
          onClick={syncSources}
          title="Fetch the verified ST/PETRA CRESS source, snapshot it, and flag changes for human review — never auto-applies"
        >
          <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} />
          {syncing ? "Syncing…" : "Sync public sources"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => openEvidence({ type: "trust" })}>
          <FileSearch className="size-3.5" /> Open evidence
        </Button>
      </div>
    </header>
  );
}

function Sidebar() {
  const { nav, goTo, applied, latestMemo, strategySaved, openEvidence, evidence, phase, goToSetup } = useSidebarState();
  const dots: Record<number, boolean> = { 5: applied || strategySaved, 7: Boolean(latestMemo) };
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
      <nav className="flex flex-col gap-0.5 p-2.5">
        {NAV.map((s, i) => {
          const Icon = ICONS[i];
          const active = phase === "workspace" && nav === s.n && !evidence;
          return (
            <button
              key={s.key}
              onClick={() => (s.n === 1 ? goToSetup() : goTo(s.n))}
              className={cn(
                "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                active
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-sm ring-1 ring-primary/30"
                  : "text-sidebar-foreground/65 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70")} />
              <span className="flex-1 truncate">{s.label}</span>
              {dots[s.n] && <span className="size-1.5 rounded-full bg-emerald-400" />}
            </button>
          );
        })}
        <button
          onClick={() => openEvidence({ type: "trust" })}
          className={cn(
            "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
            evidence
              ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-sm ring-1 ring-primary/30"
              : "text-sidebar-foreground/65 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
          )}
        >
          <ShieldCheck className={cn("size-4 shrink-0", evidence ? "text-primary" : "text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70")} />
          <span className="flex-1 truncate">Evidence</span>
        </button>
      </nav>

      <div className="mt-auto space-y-2 p-3">
        <div className="rounded-lg border bg-card/60 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
          <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
            <ShieldCheck className="size-3.5 text-primary" /> Trust model
          </div>
          Code calculates · sources evidence · AI explains · human approves
        </div>
      </div>
    </aside>
  );
}

// Nav item 1 (Study Setup) is reachable in workspace; it shows the study summary.
function useSidebarState() {
  const ctx = useDemo();
  return {
    ...ctx,
    goToSetup: () => ctx.goTo(1),
  };
}

function Screen() {
  const { nav } = useDemo();
  switch (nav) {
    case 1: return <StudySetup />;
    case 2: return <BaselineScreen />;
    case 3: return <ScenarioComparison />;
    case 4: return <MarketIntelligence />;
    case 5: return <Refinement />;
    case 6: return <Recommendation />;
    case 7: return <Memo />;
    default: return <BaselineScreen />;
  }
}

function Footer() {
  const { nav, goTo, phase } = useDemo();
  return (
    <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t bg-sidebar/95 px-4 py-2.5 backdrop-blur sm:px-6">
      <p className="hidden text-[11px] text-muted-foreground sm:block">
        Demo-grade · pre-feasibility only · no official tariff-grade advice · no grid-approval claims · human approval required
      </p>
      {phase === "workspace" && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={nav === 1} onClick={() => goTo(nav - 1)}>
            <ArrowLeft className="size-4" /> Back
          </Button>
          <Button size="sm" disabled={nav === 7} onClick={() => goTo(nav + 1)}>
            Next <ArrowRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function Chrome() {
  const { phase } = useDemo();
  const inWorkspace = phase === "workspace";
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar />
      <div className="flex flex-1">
        {inWorkspace && <Sidebar />}
        <main className="flex-1 overflow-x-hidden px-4 py-5 sm:px-6">
          <div className={cn("mx-auto", inWorkspace ? "max-w-6xl" : "max-w-4xl")}>
            {inWorkspace ? <Screen /> : <StudySetup />}
          </div>
        </main>
      </div>
      <Footer />
      <EvidenceDrawer />
    </div>
  );
}

export function DemoShell({ data }: { data: DemoData }) {
  return (
    <DemoProvider data={data}>
      <Chrome />
    </DemoProvider>
  );
}
