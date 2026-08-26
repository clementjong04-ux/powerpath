// Browser-safe Supabase client.
//
// SAFETY CONTRACT: this file may only ever reference NEXT_PUBLIC_* environment
// variables (Next.js inlines those into the client bundle; everything else is
// stripped). Secret keys live exclusively in ./admin.ts, which must never be
// imported from client components.
//
// Note: with RLS enabled and no policies (current schema state), this client can
// connect but cannot read or write any table. Real data access goes through
// server routes until auth + policies land.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Supabase is migrating key names: prefer the new publishable key, fall back
  // to the legacy anon key.
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    const missing = [
      !url && "NEXT_PUBLIC_SUPABASE_URL",
      !key && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)",
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `Supabase is not configured — missing ${missing}. Add them to .env.local (see docs/SUPABASE_SETUP.md) and restart the dev server.`,
    );
  }

  cached = createClient(url, key);
  return cached;
}

// Non-throwing check for UI code that wants to show a friendly banner instead
// of crashing when Supabase isn't configured yet.
export function supabaseClientConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}
