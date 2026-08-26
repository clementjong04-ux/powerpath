// GET /api/sources — the live source_registry with each source's latest snapshot
// (checked_at + content_hash). Read-only; Market Intelligence uses this so the
// monitor cards reflect database truth instead of local fixtures.

import { getSupabaseAdmin, supabaseAdminConfigured } from "@/lib/supabase/admin";

export async function GET() {
  const config = supabaseAdminConfigured();
  if (!config.ok) {
    return Response.json({ ok: true, sources: [], warning: "Supabase not configured — using local fixtures." });
  }

  const supabase = getSupabaseAdmin();
  const [registryRes, snapshotsRes] = await Promise.all([
    supabase
      .from("source_registry")
      .select("id, source_name, authority, url, source_domain, verification_status, official_status, active")
      .order("priority", { ascending: true }),
    supabase
      .from("source_snapshots")
      .select("source_id, fetched_at, content_hash")
      .order("fetched_at", { ascending: false })
      .limit(100),
  ]);
  if (registryRes.error) return Response.json({ ok: false, error: registryRes.error.message }, { status: 500 });
  if (snapshotsRes.error) return Response.json({ ok: false, error: snapshotsRes.error.message }, { status: 500 });

  // Latest snapshot per source (rows are already newest-first).
  const latest = new Map<string, { fetched_at: string; content_hash: string | null }>();
  for (const s of (snapshotsRes.data ?? []) as { source_id: string; fetched_at: string; content_hash: string | null }[]) {
    if (!latest.has(s.source_id)) latest.set(s.source_id, { fetched_at: s.fetched_at, content_hash: s.content_hash });
  }

  const sources = (registryRes.data ?? []).map((r) => ({
    ...r,
    latest_snapshot: latest.get(r.id as string) ?? null,
  }));
  return Response.json({ ok: true, sources });
}
