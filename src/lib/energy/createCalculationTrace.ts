// Shared trace + assumption utilities for the deterministic engine.
//
// Every scenario file builds its result through these helpers so that every number
// is traceable to either the study's own inputs or a versioned, sourced assumption.
// Pure functions — no I/O, no LLM, usable on server and client.

import type { Assumption, Confidence, ScenarioInput, TraceStep, ValueProvenance } from "@/lib/types";

export type AssumptionMap = Map<string, Assumption>;

// Where did this assumption's VALUE come from? Only a human-approved version counts
// as approved; everything else is demo-grade fallback (never presented as more).
export function provenanceOf(a: Assumption | undefined): ValueProvenance {
  return a?.reviewer_status === "approved" ? "approved_assumption_version" : "demo_fallback";
}

// Exact version id for an assumption: prefers the row's own version (from
// assumption_versions), falling back to the set version for YAML/demo sets.
export function versionIdOf(m: AssumptionMap, key: string, setVersion: string): string {
  const a = m.get(key);
  return `${key}@${a?.version ?? setVersion}`;
}

export function step(label: string, detail: string, assumption_ids: string[]): TraceStep {
  return { label, detail, assumption_ids };
}

export function reqAssumption(m: AssumptionMap, id: string): Assumption {
  const a = m.get(id);
  if (!a) throw new Error(`Missing assumption ${id}`);
  return a;
}

export function num(m: AssumptionMap, id: string): number {
  const v = reqAssumption(m, id).value;
  if (v === null) throw new Error(`Assumption ${id} has no value`);
  return v;
}

export function inp(m: AssumptionMap, id: string): ScenarioInput {
  const a = reqAssumption(m, id);
  return { assumption_id: a.id, label: a.label, value: a.value, unit: a.unit, provenance: provenanceOf(a) };
}

// A study-entered value (not an assumption) — e.g. the grid tariff from the bill.
export function userInput(label: string, value: number | null, unit: string): ScenarioInput {
  return { assumption_id: "user_input", label, value, unit, provenance: "user_input" };
}

// A scenario is "provisional" if any assumption feeding it is unapproved/provisional.
export function provisionalFrom(m: AssumptionMap, ids: string[]): string | undefined {
  for (const id of ids) {
    const a = m.get(id);
    if (!a) continue;
    if (a.provisional || a.reviewer_status === "needs_review") {
      return `Depends on "${a.label}" which is ${
        a.provisional ? "a provisional placeholder" : "pending review"
      }.`;
    }
  }
  return undefined;
}

// Scenario confidence = the weakest confidence among its differentiating inputs.
const CONF_RANK: Record<Confidence, number> = { demo: 0, low: 1, medium: 2, high: 3 };

export function confFrom(m: AssumptionMap, ids: string[]): Confidence {
  let worst: Confidence = "high";
  for (const id of ids) {
    const a = m.get(id);
    if (a && CONF_RANK[a.confidence] < CONF_RANK[worst]) worst = a.confidence;
  }
  return worst;
}

export const round = (n: number) => Math.round(n);
