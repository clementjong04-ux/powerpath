// GET /api/market-updates?source_id=SRC-CRESS-SAC — list recent market updates
// from Supabase with their registry source (name, authority, url, domain,
// verification) and snapshot evidence (checked_at, content_hash) joined in.
// Read-only: used by Market Intelligence for display; never mutates anything.

import { getSupabaseAdmin, supabaseAdminConfigured } from "@/lib/supabase/admin";

const SELECT =
  "id, source_id, snapshot_id, country, title, summary, detected_at, affected_scenarios, " +
  "human_review_status, before_value, after_value, unit, reviewed_by, " +
  "source_registry(source_name, authority, url, source_domain, verification_status, official_status), " +
  "source_snapshots(fetched_at, content_hash)";

interface JoinedRow {
  source_registry: unknown;
  source_snapshots: unknown;
  [key: string]: unknown;
}

export async function GET(request: Request) {
  const config = supabaseAdminConfigured();
  if (!config.ok) {
    return Response.json({ ok: true, market_updates: [], warning: "Supabase not configured — no live updates." });
  }

  const url = new URL(request.url);
  const sourceId = url.searchParams.get("source_id");

  const supabase = getSupabaseAdmin();
  let query = supabase.from("market_updates").select(SELECT).order("detected_at", { ascending: false }).limit(10);
  if (sourceId) query = query.eq("source_id", sourceId);

  const { data, error } = await query;
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Rename the embedded resources to the shape the UI reads.
  const market_updates = ((data ?? []) as unknown as JoinedRow[]).map(({ source_registry, source_snapshots, ...row }) => ({
    ...row,
    source: source_registry ?? null,
    snapshot: source_snapshots ?? null,
  }));
  return Response.json({ ok: true, market_updates });
}
