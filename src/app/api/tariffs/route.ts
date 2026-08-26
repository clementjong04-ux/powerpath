// GET /api/tariffs?country=Malaysia — tariff CATEGORY references for the Study
// Setup selector. Reads tariff_registry from Supabase; falls back to the code
// demo registry when the table is missing/empty (migration 0008 pending) or the
// database is unreachable. Read-only; categories only — never rates.

import { getSupabaseAdmin, supabaseAdminConfigured } from "@/lib/supabase/admin";
import { DEMO_TARIFF_REGISTRY, type TariffOption } from "@/lib/tariffs";

export async function GET(request: Request) {
  const country = new URL(request.url).searchParams.get("country") ?? "Malaysia";
  const fallback = DEMO_TARIFF_REGISTRY.filter((t) => t.country.toLowerCase() === country.toLowerCase());

  const config = supabaseAdminConfigured();
  if (!config.ok) {
    return Response.json({ ok: true, provenance: "demo_fallback", tariffs: fallback, warning: "Supabase not configured — demo tariff registry." });
  }

  const supabase = getSupabaseAdmin();
  const res = await supabase
    .from("tariff_registry")
    .select("*")
    .eq("country", country)
    .eq("active", true)
    .order("supply_voltage_level")
    .order("display_name");

  if (res.error) {
    const missing = /tariff_registry|schema cache/.test(res.error.message);
    return Response.json({
      ok: true,
      provenance: "demo_fallback",
      tariffs: fallback,
      warning: missing
        ? "tariff_registry table missing — run supabase/migrations/0008_tariff_registry.sql. Using the demo registry."
        : `tariff_registry read failed (${res.error.message}) — using the demo registry.`,
    });
  }
  if (!res.data || res.data.length === 0) {
    return Response.json({ ok: true, provenance: "demo_fallback", tariffs: fallback, warning: "tariff_registry is empty — using the demo registry." });
  }
  return Response.json({ ok: true, provenance: "supabase", tariffs: res.data as TariffOption[] });
}
