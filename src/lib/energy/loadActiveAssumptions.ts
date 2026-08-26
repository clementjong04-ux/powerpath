// Load active approved assumptions from Supabase (assumption_versions table).
//
// SERVER-ONLY (imports the admin client). The pure engine (analyzeStudy) receives the
// returned AssumptionSet and never does I/O itself.
//
// Rules honored here:
//  * Base set = rows with active = true. The database itself guarantees an active row
//    is approved or a labeled demo seed (constraint `active_requires_approval`).
//  * Requesting version "0.2" (the in-session approved CRESS update) overlays APPROVED
//    successor rows (e.g. ASM-CRESS-SAC@0.2) on top of the active set. Until approval
//    persistence flips the active flags in the database, this mirrors the closed loop
//    without ever using an unapproved value.
//  * Every assumption keeps its source_id, confidence, reviewer status and version —
//    so scenario results can cite exact assumption_version_ids.
//  * A PENDING market update never changes an assumption: only rows already marked
//    approved/active in the database (or the sanctioned approved-overlay view) are used.
//  * Any failure falls back to the demo_grade code set (defaultAssumptions.ts) with an
//    explicit warning; the analysis never silently switches data sources.

import { getSupabaseAdmin, supabaseAdminConfigured } from "@/lib/supabase/admin";
import { demoFallbackSet } from "./defaultAssumptions";
import type { Assumption, AssumptionSet, Confidence, ReviewerStatus, ScenarioKey } from "@/lib/types";

interface AssumptionVersionRow {
  id: string;
  country: string;
  assumption_key: string;
  version: string;
  label: string | null;
  value: number | string | null;
  unit: string;
  source_id: string;
  effective_date: string;
  confidence: string;
  human_review_status: string;
  active: boolean;
  affected_models: string[];
  provisional: boolean;
  caveat: string | null;
  reviewed_by: string | null;
}

export interface LoadedAssumptions {
  set: AssumptionSet;
  source: "supabase" | "demo_fallback";
  warnings: string[];
}

function toAssumption(row: AssumptionVersionRow): Assumption {
  return {
    id: row.assumption_key,
    label: row.label ?? row.assumption_key,
    value: row.value === null ? null : Number(row.value),
    unit: row.unit,
    source_id: row.source_id,
    confidence: row.confidence as Confidence,
    reviewer_status: row.human_review_status as ReviewerStatus,
    affected_scenarios: (row.affected_models ?? []) as ScenarioKey[],
    caveat: row.caveat ?? "",
    provisional: row.provisional,
    reviewed_by: row.reviewed_by ?? undefined,
    version: row.version,
  };
}

export async function loadActiveAssumptions(
  country: string,
  requestedVersion: string, // '0.1' (active set) | '0.2' (active + approved overlay) | 'active' (DB active set only)
): Promise<LoadedAssumptions> {
  const fallback = (why: string): LoadedAssumptions => ({
    set: demoFallbackSet(requestedVersion === "active" ? "0.1" : requestedVersion),
    source: "demo_fallback",
    warnings: [`Assumptions loaded from the demo_grade code fallback — ${why}`],
  });

  if (!supabaseAdminConfigured().ok) {
    return fallback("Supabase is not configured.");
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("assumption_versions")
      .select("*")
      .eq("country", country);
    if (error) return fallback(error.message);

    const rows = (data as AssumptionVersionRow[]) ?? [];
    const active = rows.filter((r) => r.active);
    if (active.length === 0) {
      return fallback("no active assumption versions found in the database.");
    }

    // Base: the database's active (approved / demo-seed) set.
    const byKey = new Map<string, AssumptionVersionRow>();
    for (const r of active) byKey.set(r.assumption_key, r);

    // Overlay: in-session approved update view (only APPROVED successor rows).
    // Not used for 'active' — after a persisted approval the active flags in the
    // database already point at the approved rows, so the base set IS the truth.
    let reviewedBy: string | null = null;
    if (requestedVersion === "0.2") {
      for (const r of rows) {
        if (r.version === "0.2" && r.human_review_status === "approved") {
          byKey.set(r.assumption_key, r);
          reviewedBy = r.reviewed_by ?? reviewedBy;
        }
      }
    }

    const assumptions = [...byKey.values()]
      .sort((a, b) => a.assumption_key.localeCompare(b.assumption_key))
      .map(toAssumption);

    // Set version = the highest version among the rows actually in use, so
    // scenario_results carry an accurate assumption_set_version (e.g. v0.2 once
    // an approval has activated a 0.2 row).
    const effectiveVersion =
      requestedVersion === "active"
        ? [...byKey.values()]
            .map((r) => r.version)
            .sort((a, b) => (Number.parseFloat(b) || 0) - (Number.parseFloat(a) || 0))[0] ?? "0.1"
        : requestedVersion;
    if (requestedVersion === "active") {
      reviewedBy = [...byKey.values()].find((r) => r.human_review_status === "approved")?.reviewed_by ?? null;
    }

    return {
      set: {
        meta: {
          country,
          version: effectiveVersion,
          grade: "demo",
          created: active[0]?.effective_date ?? "",
          reviewed_by: reviewedBy,
          notes:
            "Assumption set composed from Supabase assumption_versions (active approved/demo-seed rows" +
            (requestedVersion === "0.2" ? " + approved v0.2 overlay" : requestedVersion === "active" ? "; database active set" : "") +
            "). Demo-grade / pre-feasibility only.",
        },
        assumptions,
      },
      source: "supabase",
      warnings: [],
    };
  } catch (e) {
    return fallback(e instanceof Error ? e.message : String(e));
  }
}
