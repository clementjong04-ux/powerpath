// Fetch a verified official source URL (server-only).
//
// Plain HTTPS GET with a timeout and an honest User-Agent. No scraping tricks,
// no auth, no retries into rate limits — this only ever targets public pages of
// sources a human has marked verified_official in source_registry.

export interface FetchedSource {
  ok: boolean;
  status: number;
  contentType: string;
  bytes: Buffer;
  finalUrl: string;
  error?: string;
}

const TIMEOUT_MS = 20_000;
const MAX_BYTES = 8 * 1024 * 1024; // 8MB cap — snapshots store a hash + excerpt, not the file

export async function fetchSource(url: string): Promise<FetchedSource> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Powerpath-SourceMonitor/0.1 (pre-feasibility research; contact: demo)",
        Accept: "text/html,application/xhtml+xml,application/pdf,*/*",
      },
    });
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const buffer = Buffer.from(await res.arrayBuffer());
    return {
      ok: res.ok,
      status: res.status,
      contentType,
      bytes: buffer.subarray(0, MAX_BYTES),
      finalUrl: res.url || url,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      contentType: "",
      bytes: Buffer.alloc(0),
      finalUrl: url,
      error: e instanceof Error ? (e.name === "AbortError" ? `Timeout after ${TIMEOUT_MS / 1000}s` : e.message) : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}
