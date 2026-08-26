// Seed the Supabase `source_registry` table from data/sources/source_registry.malaysia.yaml.
//
//   npm run seed:sources
//
// Behavior:
//  * UPSERT by source id — existing rows are updated, nothing is ever deleted.
//  * Uses SUPABASE_SECRET_KEY (fallback SUPABASE_SERVICE_ROLE_KEY) — server/script
//    context only; this file is never bundled into the app.
//  * The YAML stays the source of truth; the table mirrors it.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Minimal .env.local loader (no dotenv dependency; values never printed)
// ---------------------------------------------------------------------------
function loadEnvLocal(): void {
  const file = path.join(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

// ---------------------------------------------------------------------------
// YAML shape (subset we need)
// ---------------------------------------------------------------------------
interface YamlSource {
  id: string;
  name: string;
  authority?: string;
  type: string;
  url?: string;
  source_domain?: string;
  cadence?: string;
  parser_type?: string;
  priority?: number;
  official_status?: string;
  verification_status?: string;
  verified_by?: string;
  verified_at?: string;
  evidence_note?: string;
  trust_note?: string;
}

interface Registry {
  registry: { country: string; version: string };
  sources: YamlSource[];
}

async function main(): Promise<void> {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).",
    );
    console.error("  Add them to .env.local (see docs/SUPABASE_SETUP.md) and retry.");
    process.exit(1);
  }

  const yamlPath = path.join(process.cwd(), "data", "sources", "source_registry.malaysia.yaml");
  const registry = load(readFileSync(yamlPath, "utf8")) as Registry;
  const country = registry.registry.country;
  console.log(
    `Seeding source_registry from ${path.relative(process.cwd(), yamlPath)} ` +
      `(registry v${registry.registry.version}, ${registry.sources.length} sources, country: ${country})\n`,
  );

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let okCount = 0;
  let failCount = 0;

  for (const s of registry.sources) {
    const row = {
      id: s.id,
      country,
      source_type: s.type,
      source_name: s.name,
      authority: s.authority ?? null,
      url: s.url && s.url.trim() !== "" ? s.url : null,
      source_domain: s.source_domain ?? null,
      cadence: s.cadence ?? "manual",
      parser_type: s.parser_type ?? "none",
      priority: s.priority ?? 5,
      active: true,
      official_status: s.official_status ?? null,
      // Verification is a deliberate act — default is 'unverified', never assumed.
      verification_status: s.verification_status ?? "unverified",
      verified_by: s.verified_by ?? null,
      verified_at: s.verified_at ?? null,
      evidence_note: s.evidence_note ?? null,
      trust_note: s.trust_note ?? null,
    };

    const { error } = await supabase.from("source_registry").upsert(row);
    if (error) {
      failCount++;
      console.error(`  ✗ ${s.id} — ${error.message}`);
    } else {
      okCount++;
      console.log(`  ✓ ${s.id.padEnd(22)} ${(row.verification_status ?? "").padEnd(20)} ${row.cadence.padEnd(10)} ${s.name}`);
    }
  }

  console.log(`\n${okCount} upserted, ${failCount} failed. (Existing sources are never deleted.)`);
  if (failCount > 0) process.exit(1);

  const { count, error: countError } = await supabase
    .from("source_registry")
    .select("*", { count: "exact", head: true });
  if (!countError) console.log(`source_registry now holds ${count} rows total.`);
  console.log("Done.");
}

main().catch((e) => {
  console.error("✗ Seed failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
