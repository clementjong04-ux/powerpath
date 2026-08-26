// Central brand configuration — the ONLY place product naming lives.
// Rebranded from "PowerReady AI" to "Powerpath" (2026-07-06); the old name may
// appear only in legacy notes and migration docs, never in user-facing UI.
//
// Internal identifiers deliberately NOT rebranded (functional, not user-facing):
// Supabase table/column names, API route paths, env variable names, and the
// Postgres audit setting 'powerready.actor' (see supabase/schema.sql).

export const BRAND = {
  name: "Powerpath",
  tagline: "The fastest path to power.",
  descriptor: "AI energy intelligence for grid-ready infrastructure.",
  longPositioning:
    "Powerpath helps companies find the fastest, cheapest and lowest-risk path to power for new infrastructure and large electricity sites.",
} as const;
