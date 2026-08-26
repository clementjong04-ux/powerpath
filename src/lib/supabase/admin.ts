// Server-only Supabase admin client (service role — bypasses RLS).
//
// SAFETY CONTRACT:
//  * NEVER import this file from a "use client" component or anything reachable
//    from one. It is for Route Handlers (src/app/api/**) and Server Components only.
//  * The keys it reads have no NEXT_PUBLIC_ prefix, so Next.js never inlines them
//    into the browser bundle — in client code they are empty strings.
//  * As a second line of defense, this module throws immediately if it is ever
//    evaluated in a browser.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/supabase/admin.ts was imported in browser code. This file is server-only — use getSupabaseClient() from src/lib/supabase/client.ts instead.",
  );
}

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Supabase is migrating key names: prefer the new secret key, fall back to
  // the legacy service-role key.
  const key =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    const missing = [
      !url && "NEXT_PUBLIC_SUPABASE_URL",
      !key && "SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)",
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `Supabase admin is not configured — missing ${missing}. Add them to .env.local (see docs/SUPABASE_SETUP.md) and restart the dev server.`,
    );
  }

  cached = createClient(url, key, {
    auth: {
      // Service-role usage is stateless server-to-server: no session persistence.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cached;
}

export function supabaseAdminConfigured(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    missing.push("SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)");
  }
  return { ok: missing.length === 0, missing };
}
