// POST /api/projects/create — persist a StudyProject into projects + sites + energy_bills.
//
// Server-only (admin client; RLS has no policies yet). The sample study uses fixed
// ids, so saving it is an idempotent upsert — loading the sample twice never
// duplicates rows. Returns the saved StudyProject reassembled from the rows.

import { getSupabaseAdmin, supabaseAdminConfigured } from "@/lib/supabase/admin";
import { fromRows, toRows, type EnergyBillRow, type ProjectRow, type SiteRow } from "@/lib/supabase/mapping";
import type { StudyProject } from "@/lib/types";

export async function POST(request: Request) {
  const config = supabaseAdminConfigured();
  if (!config.ok) {
    return Response.json(
      { ok: false, status: "not_configured", error: `Missing environment variables: ${config.missing.join(", ")}` },
      { status: 503 },
    );
  }

  let study: StudyProject;
  try {
    study = (await request.json()) as StudyProject;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  if (!study?.id || !study.project_name || !study.country) {
    return Response.json({ ok: false, error: "id, project_name and country are required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { project, site, bill } = toRows(study);

  // upsert keeps the fixed-id sample idempotent; user studies have fresh uuids.
  let warning: string | undefined;
  let projectRes = await supabase.from("projects").upsert(project).select().single();
  if (projectRes.error && /data_status_check/.test(projectRes.error.message)) {
    // Legacy retry: migration 0002 not applied yet — the old constraint only knows
    // 'sample' | 'user_entered'. Save with the closest legacy value and warn.
    // (fromRows maps 'sample' back to 'sample_case' on read.)
    const legacyStatus = project.data_status === "user_entered" ? "user_entered" : "sample";
    projectRes = await supabase.from("projects").upsert({ ...project, data_status: legacyStatus }).select().single();
    warning = `Saved with legacy data_status '${legacyStatus}' — run supabase/APPLY_PENDING.sql to complete migration 0002.`;
  }
  if (projectRes.error) {
    return Response.json({ ok: false, error: projectRes.error.message }, { status: 500 });
  }

  let siteRes = await supabase.from("sites").upsert(site).select().single();
  if (siteRes.error && /state|region|utility|supply_voltage_level|tariff_code|tariff_source_id|tariff_verification_status|schema cache/.test(siteRes.error.message)) {
    // Legacy retry: migration 0008 not applied yet — save without the tariff
    // context columns and say exactly what is missing.
    const legacySite = {
      id: site.id,
      project_id: site.project_id,
      site_location: site.site_location,
      tariff_category: site.tariff_category,
      peak_demand_kw: site.peak_demand_kw,
    };
    siteRes = await supabase.from("sites").upsert(legacySite).select().single();
    if (!siteRes.error) {
      warning = [warning, "Saved without tariff context columns — run supabase/migrations/0008_tariff_registry.sql."].filter(Boolean).join(" ");
    }
  }
  if (siteRes.error) {
    // best-effort cleanup so a half-saved study doesn't linger (cascade removes children)
    await supabase.from("projects").delete().eq("id", project.id);
    return Response.json({ ok: false, error: siteRes.error.message }, { status: 500 });
  }

  const billRes = await supabase.from("energy_bills").upsert(bill).select().single();
  if (billRes.error) {
    await supabase.from("projects").delete().eq("id", project.id);
    return Response.json({ ok: false, error: billRes.error.message }, { status: 500 });
  }

  const saved = fromRows(projectRes.data as ProjectRow, siteRes.data as SiteRow, billRes.data as EnergyBillRow);
  // Pre-migration-0008 rows can't store tariff context — keep the submitted
  // selection in the session object so the UI doesn't lose it (warned above).
  if (saved.tariff_code === null && study.tariff_code) {
    saved.state = study.state;
    saved.region = study.region;
    saved.utility = study.utility;
    saved.supply_voltage_level = study.supply_voltage_level;
    saved.tariff_code = study.tariff_code;
    saved.tariff_source_id = study.tariff_source_id;
    saved.tariff_verification_status = study.tariff_verification_status;
  }
  return Response.json({ ok: true, study: saved, warning });
}
