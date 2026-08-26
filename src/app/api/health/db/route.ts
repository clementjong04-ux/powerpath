// GET /api/health/db — database connection health check.
//
// Server-only: uses the admin client (service role) because RLS currently has no
// policies, so the anon/publishable key cannot read anything. Returns JSON only —
// never leaks key values, only which variable NAMES are missing.

import { getSupabaseAdmin, supabaseAdminConfigured } from "@/lib/supabase/admin";

export async function GET() {
  const startedAt = Date.now();

  const config = supabaseAdminConfigured();
  if (!config.ok) {
    return Response.json(
      {
        ok: false,
        status: "not_configured",
        error: `Missing environment variables: ${config.missing.join(", ")}. Add them to .env.local (see docs/SUPABASE_SETUP.md) and restart the dev server.`,
        checked_at: new Date().toISOString(),
      },
      { status: 503 },
    );
  }

  try {
    const supabase = getSupabaseAdmin();

    // Cheap, deterministic probe: count seeded reference tables.
    const [modules, sources] = await Promise.all([
      supabase.from("country_modules").select("*", { count: "exact", head: true }),
      supabase.from("source_registry").select("*", { count: "exact", head: true }),
    ]);

    const firstError = modules.error ?? sources.error;
    if (firstError) {
      return Response.json(
        {
          ok: false,
          status: "query_failed",
          error: firstError.message,
          hint: "Has supabase/schema.sql been run on this project? See docs/SUPABASE_SETUP.md.",
          latency_ms: Date.now() - startedAt,
          checked_at: new Date().toISOString(),
        },
        { status: 500 },
      );
    }

    return Response.json({
      ok: true,
      status: "connected",
      database: {
        country_modules: modules.count ?? 0,
        source_registry: sources.count ?? 0,
        schema_seeded: (modules.count ?? 0) > 0 && (sources.count ?? 0) > 0,
      },
      latency_ms: Date.now() - startedAt,
      checked_at: new Date().toISOString(),
    });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        status: "connection_error",
        error: e instanceof Error ? e.message : String(e),
        latency_ms: Date.now() - startedAt,
        checked_at: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
