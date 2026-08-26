// GET /api/solar-resource?lat=1.4927&lon=103.7414&start=20250101&end=20251231
//
// Real solar resource lookup via the NASA POWER public API (SRC-NASA-POWER,
// verified_official in the source registry). Read-only: this route NEVER writes
// scenario_results or assumption_versions — the value is source evidence for
// pre-feasibility screening until a human approves an assumption change.
//
// NOT a PV yield calculation. Irradiance -> plant output requires system design,
// losses, and a performance-ratio model that belongs to an engineering study.

import { fetchNasaPowerDaily } from "@/lib/solar/nasaPowerClient";

// Defaults: the hero site (Johor) as registered on SRC-NASA-POWER in
// data/sources/source_registry.malaysia.yaml.
const DEFAULT_LAT = 1.4927;
const DEFAULT_LON = 103.7414;

// Deterministic fallback when NASA POWER is unreachable: demo-grade typical
// Johor daily irradiance. Clearly labelled demo_fallback — never presented as
// live or official data.
const FALLBACK_DAILY_KWH_M2 = 4.8;

const DISCLAIMER = "Not final PV engineering yield";
const CAVEAT =
  "Pre-feasibility solar resource indicator only. Surface irradiance is not PV output: " +
  "final yield depends on system design, orientation, shading, temperature and performance " +
  "ratio — a proper engineering study is required. This value changes no scenario results " +
  "unless a human approves an assumption update.";

function num(v: string | null, fallback: number): number {
  const n = v === null ? NaN : Number.parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function isYyyymmdd(v: string): boolean {
  return /^\d{8}$/.test(v);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lat = num(url.searchParams.get("lat"), DEFAULT_LAT);
  const lon = num(url.searchParams.get("lon"), DEFAULT_LON);

  // Default period: the last complete calendar year.
  const lastYear = new Date().getUTCFullYear() - 1;
  const start = url.searchParams.get("start") ?? `${lastYear}0101`;
  const end = url.searchParams.get("end") ?? `${lastYear}1231`;

  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return Response.json({ ok: false, error: "lat must be -90..90 and lon -180..180" }, { status: 400 });
  }
  if (!isYyyymmdd(start) || !isYyyymmdd(end) || start > end) {
    return Response.json({ ok: false, error: "start/end must be YYYYMMDD with start <= end" }, { status: 400 });
  }

  const warnings: string[] = [];
  const nasa = await fetchNasaPowerDaily({ lat, lon, start, end });

  let averageDaily: number;
  let provenance: "live_nasa_power" | "demo_fallback";
  if (nasa.ok && nasa.average_daily_kwh_m2 !== null) {
    averageDaily = nasa.average_daily_kwh_m2;
    provenance = "live_nasa_power";
    if (nasa.missing_points > 0) {
      warnings.push(`${nasa.missing_points} day(s) had NASA fill values and were excluded from the average.`);
    }
  } else {
    // Deterministic fallback — the UI keeps working, honestly labelled.
    averageDaily = FALLBACK_DAILY_KWH_M2;
    provenance = "demo_fallback";
    warnings.push(
      `NASA POWER unavailable (${nasa.error ?? "unknown error"}) — returned the demo fallback value ` +
        `(${FALLBACK_DAILY_KWH_M2} kWh/m²/day, typical Johor, demo-grade).`,
    );
  }

  return Response.json({
    ok: true,
    result_status: "pre_feasibility",
    source: provenance === "live_nasa_power" ? "NASA POWER" : "Powerpath demo fallback (NASA POWER unreachable)",
    source_id: "SRC-NASA-POWER",
    provenance,
    coordinates: { lat, lon },
    period: { start, end },
    parameter: "ALLSKY_SFC_SW_DWN",
    average_daily_solar_radiation: averageDaily, // kWh/m²/day
    estimated_annual_solar_resource: Math.round(averageDaily * 365), // kWh/m²/year
    unit: { daily: "kWh/m²/day", annual: "kWh/m²/year" },
    data_points: nasa.data_points,
    missing_points: nasa.missing_points,
    fetched_at: new Date().toISOString(),
    confidence: "demo_pre_feasibility",
    disclaimer: DISCLAIMER,
    caveat: CAVEAT,
    scenario_results_changed: false, // ALWAYS false — evidence only until human-approved
    warnings,
  });
}
