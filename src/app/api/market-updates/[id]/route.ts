// GET /api/market-updates/[id] — read the persisted review state of a market update.
//
// Lets the UI reflect the DATABASE truth on load: an update approved in a previous
// session stays approved (no phantom "pending review"), and an ignored update stays
// ignored. Read-only.

import { getSupabaseAdmin, supabaseAdminConfigured } from "@/lib/supabase/admin";

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
    .from("market_updates")
    .select("id, human_review_status, reviewed_by, reviewed_at, source_id, country")
    .eq("id", id)
    .maybeSingle();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return Response.json({ ok: false, error: `Market update ${id} not found` }, { status: 404 });

  return Response.json({ ok: true, market_update: data });
}
