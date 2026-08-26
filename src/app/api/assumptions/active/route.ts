// GET /api/assumptions/active?country=Malaysia&version=0.1
//
// Returns the active assumption set the engine would use for a study, with each
// assumption's value provenance (approved_assumption_version | demo_fallback). Read-only,
// server-side. A pending market update never appears here — only active/approved rows
// (or the sanctioned approved-overlay view) are returned. No LLM, no live APIs.

import { loadActiveAssumptions } from "@/lib/energy/loadActiveAssumptions";
import { provenanceOf } from "@/lib/energy/createCalculationTrace";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const country = url.searchParams.get("country") ?? "Malaysia";
  const version = url.searchParams.get("version") ?? "0.1";

  const loaded = await loadActiveAssumptions(country, version);

  const assumptions = loaded.set.assumptions.map((a) => ({
    assumption_key: a.id,
    assumption_version_id: `${a.id}@${a.version ?? loaded.set.meta.version}`,
    label: a.label,
    value: a.value,
    unit: a.unit,
    source_id: a.source_id,
    confidence: a.confidence,
    reviewer_status: a.reviewer_status,
    provisional: Boolean(a.provisional),
    value_provenance: provenanceOf(a),
    affected_scenarios: a.affected_scenarios,
  }));

  return Response.json({
    ok: true,
    country,
    version,
    assumption_source: loaded.source, // "supabase" | "demo_fallback"
    grade: "pre_feasibility",
    warnings: loaded.warnings,
    count: assumptions.length,
    assumptions,
  });
}
