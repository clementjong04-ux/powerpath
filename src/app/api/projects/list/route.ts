// GET /api/projects/list — all saved studies, newest first, reassembled into
// StudyProject objects (projects + their site + representative bill).

import { getSupabaseAdmin, supabaseAdminConfigured } from "@/lib/supabase/admin";
import { fromRows, type EnergyBillRow, type ProjectRow, type SiteRow } from "@/lib/supabase/mapping";

interface JoinedRow extends ProjectRow {
  sites: (SiteRow & { energy_bills: EnergyBillRow[] })[];
}

export async function GET() {
  const config = supabaseAdminConfigured();
  if (!config.ok) {
    return Response.json(
      { ok: false, status: "not_configured", error: `Missing environment variables: ${config.missing.join(", ")}` },
      { status: 503 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("projects")
    .select("*, sites(*, energy_bills(*))")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const studies = (data as JoinedRow[]).map((row) => {
    const site = row.sites?.[0] ?? null;
    const bill = site?.energy_bills?.[0] ?? null;
    return fromRows(row, site, bill);
  });

  return Response.json({ ok: true, count: studies.length, studies });
}
