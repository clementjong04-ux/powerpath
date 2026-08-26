# SUPABASE_SETUP — running the Powerpath schema

Step 1 of the database phase: create the schema. **This step does not connect the app** —
no client code changes, no live APIs, no auth. The schema is designed so the adapters in
`src/lib/study.ts` can swap to Supabase in the next step without touching any component.

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → sign in → **New project**.
2. Organization: yours · Name: `powerready-ai` (legacy note: the existing Supabase
   project keeps its pre-rebrand name — renaming it is optional and does not affect
   the app, which was rebranded to **Powerpath** on 2026-07-06) · Database password:
   generate one and store it in a password manager (you rarely need it, but keep it).
3. Region: **Southeast Asia (Singapore)** — closest to Johor users.
4. Wait ~2 minutes for provisioning.

## 2. Run `schema.sql`

### Option A — Dashboard SQL Editor (easiest, recommended for this step)
1. In the Supabase dashboard, open your project → left sidebar → **SQL Editor**.
2. Click **New query**.
3. Open [`supabase/schema.sql`](../supabase/schema.sql) in your editor, copy the
   **entire file**, and paste it into the SQL Editor.
4. Click **Run** (or Ctrl+Enter).
5. You should see "Success. No rows returned". If you see an error about an object
   already existing, you ran it twice — use a fresh project or drop the tables first
   (this file is written for a fresh database).

### Option B — Supabase CLI (repeatable, better once migrations start)
```bash
npm install -g supabase
supabase login                      # opens browser to authorize
supabase link --project-ref <ref>   # <ref> = the id in your dashboard URL
supabase db push --file supabase/schema.sql
```
(When we move to proper migrations, this file becomes `supabase/migrations/0001_init.sql`.)

## 3. Verify it worked

In the dashboard → **Table Editor**, you should see 12 tables:
`projects, sites, energy_bills, country_modules, source_registry, source_snapshots,
market_updates, assumption_versions, scenario_results, memo_versions, human_reviews, audit_logs`.

Quick checks in SQL Editor:
```sql
select country, module_status, frameworks from country_modules;      -- 3 rows
select id, cadence, parser_type, priority from source_registry;      -- 6 rows
select assumption_key, version, active, human_review_status
  from assumption_versions order by assumption_key, version;          -- 14 rows (13 active v0.1 + inactive v0.2 SAC)
select id, human_review_status from market_updates;                   -- 1 row, needs_review
select count(*) from audit_logs;                                      -- > 0 (audit triggers fired on seed)
```

Prove the trust rules are enforced by the database itself (both should FAIL):
```sql
-- ✗ cannot activate an unapproved assumption
insert into assumption_versions (id, country, assumption_key, version, unit, source_id, human_review_status, active)
values ('ASM-TEST@0.1','Malaysia','ASM-TEST','0.1','x','SRC-DEMO-SEED','needs_review', true);
-- ERROR: violates check constraint "active_requires_approval"

-- ✗ cannot edit an assumption's value in place (versions are immutable)
update assumption_versions set value = 0.05 where id = 'ASM-CRESS-SAC@0.1';
-- ERROR: assumption_versions core fields are immutable — insert a new version instead

-- ✗ cannot store a scenario result without a calculation trace
insert into scenario_results (id, project_id, scenario_key, assumption_set_version,
  annual_cost, annual_savings, renewable_share, carbon_reduction, capex, complexity, confidence, calculation_trace)
values ('x:baseline_grid@v0.1','nonexistent','baseline_grid','v0.1',0,0,0,0,0,'None','demo','[]'::jsonb);
-- ERROR: violates check constraint (empty trace) — and the FK to projects
```

## 4. Environment variables (prepare now, used in the next step)

Create `.env.local` in the project root (already gitignored via `.env*`):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>          # Settings → API → anon/public
SUPABASE_SERVICE_ROLE_KEY=<service role key>      # Settings → API → service_role
```

**Security rules (non-negotiable):**
- `SUPABASE_SERVICE_ROLE_KEY` has **no `NEXT_PUBLIC_` prefix on purpose** — Next.js only
  exposes `NEXT_PUBLIC_*` vars to the browser. The service key must only ever be read in
  server code (route handlers / server components). Never import it in a `"use client"` file.
- RLS is **enabled on every table with zero policies**, so even the anon key can read/write
  nothing yet. Until auth lands, all database access goes through server-side route
  handlers using the service role. This is deliberate: no accidental public surface.
- Never commit `.env.local`.

## 5. How the app objects map to tables

| App object (src/lib/types.ts) | Table(s) |
|---|---|
| `StudyProject` — strategy fields (name, country, objective, targets, budget/risk) | `projects` |
| `StudyProject` — location fields (site_location, tariff_category, peak_demand_kw) | `sites` (+ lat/lon for NASA POWER later) |
| `StudyProject` — billing fields (monthly kWh, bill, annual cost, unit cost, carbon, RE share) | `energy_bills` (one row per period; `confirmed_by_human` = the baseline gate) |
| `ScenarioResult` | `scenario_results` (`calculation_trace` jsonb, required non-empty) |
| `MarketUpdateRecord` | `market_updates` (`human_review_status` required) |
| `AssumptionVersionRecord` | `assumption_versions` (versioned; **cannot be active unless approved/demo-seeded**; core fields immutable; one active per key) |
| `MemoVersionRecord` | `memo_versions` (records `market_update_ids` + `assumption_version_ids` used) |
| Country gating (Malaysia vs limited) | `country_modules` |
| `data/sources/source_registry.malaysia.yaml` | `source_registry` (country, source_type, name, url, cadence, parser_type, priority, active) |
| — (new) | `source_snapshots` (immutable raw captures), `human_reviews` (approval trail), `audit_logs` (append-only, auto-filled by triggers) |

## 6. How the closed loop flows through the schema

```
source sync        -> source_snapshots (immutable row)
update detected    -> market_updates (human_review_status = needs_review)
human approval     -> human_reviews row  +  market_updates.human_review_status = approved
assumption version -> assumption_versions: deactivate old, activate approved new (DB enforces approval)
scenario rerun     -> scenario_results rows (new assumption_set_version, trace attached)
memo refresh       -> memo_versions row (records update ids + assumption version ids)
everything         -> audit_logs (automatic via triggers)
```

## 7. What this step deliberately does NOT do

- No app connection (adapters in `src/lib/study.ts` still run on local state).
- No RLS policies / no auth — access arrives with server-side route handlers next step.
- No live source fetching — `source_snapshots` stays empty until the live-data phase.

## Next step (when you say go)

Swap the bodies of the seven adapters in `src/lib/study.ts` to call Next.js route
handlers (`src/app/api/...`) that use a server-only Supabase client with the service
role key. Zero component changes.
