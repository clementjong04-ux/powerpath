// GET /api/projects/[id] — load one saved study as a StudyProject.

import { getSupabaseAdmin, supabaseAdminConfigured } from "@/lib/supabase/admin";
import { fromRows, type EnergyBillRow, type ProjectRow, type SiteRow } from "@/lib/supabase/mapping";

interface JoinedRow extends ProjectRow {
  sites: (SiteRow & { energy_bills: EnergyBillRow[] })[];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const config = supabaseAdminConfigured();
  if (!config.ok) {
    return Response.json(
      { ok: false, status: "not_configured", error: `Missing environment variables: ${config.missing.join(", ")}` },
      { status: 503 },
    );
  }

  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("projects")
    .select("*, sites(*, energy_bills(*))")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return Response.json({ ok: false, error: `Project ${id} not found` }, { status: 404 });
  }

  const row = data as JoinedRow;
  const site = row.sites?.[0] ?? null;
  const bill = site?.energy_bills?.[0] ?? null;
  return Response.json({ ok: true, study: fromRows(row, site, bill) });
}
