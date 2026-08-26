// NASA POWER daily solar resource client (server-only).
//
// Official public API — no key required. We request ALLSKY_SFC_SW_DWN
// (all-sky surface shortwave downward irradiance, kWh/m²/day) for a point and
// average the daily values. This is a RESOURCE indicator for pre-feasibility,
// not a PV engineering yield — converting irradiance to plant output needs a
// site survey, system design, and performance-ratio modelling we do not do here.

export interface NasaPowerRequest {
  lat: number;
  lon: number;
  start: string; // YYYYMMDD
  end: string; // YYYYMMDD
}

export interface NasaPowerResult {
  ok: boolean;
  average_daily_kwh_m2: number | null; // mean of valid daily values
  data_points: number; // valid daily values used
  missing_points: number; // fill values (-999) excluded
  api_url: string;
  error?: string;
}

const BASE = "https://power.larc.nasa.gov/api/temporal/daily/point";
const PARAMETER = "ALLSKY_SFC_SW_DWN";
const FILL_VALUE = -999;
const TIMEOUT_MS = 25_000;

export async function fetchNasaPowerDaily(req: NasaPowerRequest): Promise<NasaPowerResult> {
  const url =
    `${BASE}?parameters=${PARAMETER}&community=RE&latitude=${req.lat}&longitude=${req.lon}` +
    `&start=${req.start}&end=${req.end}&format=JSON`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Powerpath-SolarResource/0.1 (pre-feasibility research; contact: demo)" },
    });
    if (!res.ok) {
      return { ok: false, average_daily_kwh_m2: null, data_points: 0, missing_points: 0, api_url: url, error: `HTTP ${res.status}` };
    }
    const json = (await res.json()) as {
      properties?: { parameter?: Record<string, Record<string, number>> };
    };
    const daily = json.properties?.parameter?.[PARAMETER];
    if (!daily) {
      return { ok: false, average_daily_kwh_m2: null, data_points: 0, missing_points: 0, api_url: url, error: `${PARAMETER} missing from NASA POWER response` };
    }

    const values = Object.values(daily);
    const valid = values.filter((v) => typeof v === "number" && v > FILL_VALUE && v >= 0);
    if (valid.length === 0) {
      return { ok: false, average_daily_kwh_m2: null, data_points: 0, missing_points: values.length, api_url: url, error: "No valid daily values in range (all fill values)" };
    }

    const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
    return {
      ok: true,
      average_daily_kwh_m2: Math.round(avg * 1000) / 1000,
      data_points: valid.length,
      missing_points: values.length - valid.length,
      api_url: url,
    };
  } catch (e) {
    return {
      ok: false,
      average_daily_kwh_m2: null,
      data_points: 0,
      missing_points: 0,
      api_url: url,
      error: e instanceof Error ? (e.name === "AbortError" ? `Timeout after ${TIMEOUT_MS / 1000}s` : e.message) : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}
