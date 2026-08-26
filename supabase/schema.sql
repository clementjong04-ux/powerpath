-- ============================================================================
-- Powerpath — Supabase schema (Step 1: schema only)
-- (Product rebranded from "PowerReady AI" to "Powerpath" on 2026-07-06; internal
--  identifiers like the 'powerready.actor' audit setting keep the legacy name.)
-- ============================================================================
-- Maps 1:1 onto the record types in src/lib/types.ts:
--   StudyProject            -> projects + sites + energy_bills
--   ScenarioResult          -> scenario_results (calculation_trace REQUIRED)
--   MarketUpdateRecord      -> market_updates  (human_review_status REQUIRED)
--   AssumptionVersionRecord -> assumption_versions (versioned; active only if approved)
--   MemoVersionRecord       -> memo_versions (records updates + assumptions used)
--
-- Trust rules enforced IN the database:
--   * Assumptions are stored as VERSIONS; core fields are immutable after insert.
--   * An assumption version cannot be active unless approved (or a sanctioned demo seed).
--   * Only one active version per (country, assumption_key).
--   * Scenario results must carry a calculation trace.
--   * Memo versions must record which market updates and assumption versions they used.
--   * Every review decision lands in human_reviews; key changes land in audit_logs.
--
-- Run order: this file is idempotent-ish for a fresh project. Run once on a new
-- Supabase project (see docs/SUPABASE_SETUP.md). No auth, no live APIs yet.
-- RLS is ENABLED with NO policies: nothing is readable/writable with the anon key
-- until the connection step adds server-side access. Never ship the service-role
-- key in client code.
-- ============================================================================

create extension if not exists pgcrypto; -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- 1. projects — strategy-level fields of StudyProject
-- ----------------------------------------------------------------------------
create table projects (
  id                        text primary key default ('study-' || gen_random_uuid()::text),
  project_name              text not null,
  country                   text not null,
  business_type             text not null default '—',
  user_type                 text not null default 'factory'
                            check (user_type in ('factory','data_centre','industrial_park','commercial_building','cold_storage','campus_hospital')),
  main_objective            text not null default 'balanced'
                            check (main_objective in ('cost_first','carbon_first','reliability_first','expansion_first','balanced')),
  budget_preference         text not null default 'medium' check (budget_preference in ('low','medium','high')),
  reliability_requirement   text not null default 'standard' check (reliability_requirement in ('standard','high','critical')),
  risk_appetite             text not null default 'medium' check (risk_appetite in ('low','medium','high')),
  renewable_target_percent  numeric not null default 40,
  renewable_target_year     int not null default 2030,
  expansion_load_kw         numeric not null default 0,
  data_status               text not null default 'user_entered' check (data_status in ('sample','user_entered')),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create trigger trg_projects_updated before update on projects
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. sites — location-specific fields of StudyProject (one project can grow to many sites)
-- ----------------------------------------------------------------------------
create table sites (
  id               text primary key default ('site-' || gen_random_uuid()::text),
  project_id       text not null references projects(id) on delete cascade,
  site_location    text not null default '—',
  tariff_category  text not null default '—',
  peak_demand_kw   numeric not null default 0,
  latitude         numeric,          -- for NASA POWER solar lookup (live-data phase)
  longitude        numeric,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_sites_project on sites(project_id);
create trigger trg_sites_updated before update on sites
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. energy_bills — billing/consumption entries of StudyProject
--    One row per period; the demo writes one representative row per study.
-- ----------------------------------------------------------------------------
create table energy_bills (
  id                       text primary key default ('bill-' || gen_random_uuid()::text),
  site_id                  text not null references sites(id) on delete cascade,
  period_label             text not null default 'representative-month',
  monthly_consumption_kwh  numeric not null,
  bill_amount              numeric not null,            -- monthly_bill
  annual_cost              numeric not null,
  average_unit_cost        numeric,                     -- null -> derived (cost / use)
  carbon_baseline          numeric,                     -- tCO2e/yr; null -> derived from grid factor
  current_re_share         numeric not null default 0,  -- %
  data_source              text not null default 'user_entered'
                           check (data_source in ('user_entered','sample','parsed_pdf','csv_upload')),
  confirmed_by_human       boolean not null default false,
  created_at               timestamptz not null default now()
);
create index idx_bills_site on energy_bills(site_id);

-- ----------------------------------------------------------------------------
-- 4. country_modules — which country rulesets exist and how complete they are
--    "Do not silently apply Malaysia rules elsewhere" lives here.
-- ----------------------------------------------------------------------------
create table country_modules (
  id             text primary key default ('cm-' || gen_random_uuid()::text),
  country        text not null unique,
  module_status  text not null default 'limited' check (module_status in ('full','limited','none')),
  frameworks     text[] not null default '{}',   -- e.g. {CRESS, SOLAR_ATAP}
  notes          text,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger trg_country_modules_updated before update on country_modules
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. source_registry — mirrors data/sources/source_registry.malaysia.yaml
-- ----------------------------------------------------------------------------
create table source_registry (
  id           text primary key,                 -- stable ids like 'SRC-CRESS-SAC'
  country      text not null,
  source_type  text not null check (source_type in ('monitor','document','api','internal')),
  source_name  text not null,
  authority    text,
  url          text,
  cadence      text not null default 'manual'
               check (cadence in ('realtime','daily','weekly','monthly','on_demand','manual','none')),
  parser_type  text not null default 'none'
               check (parser_type in ('html','pdf','json_api','csv','manual','none')),
  priority     int not null default 5,           -- 1 = highest
  active       boolean not null default true,
  trust_note   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger trg_source_registry_updated before update on source_registry
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 6. source_snapshots — immutable raw captures; every sync writes one
-- ----------------------------------------------------------------------------
create table source_snapshots (
  id            text primary key default ('snap-' || gen_random_uuid()::text),
  source_id     text not null references source_registry(id),
  fetched_at    timestamptz not null default now(),
  content_hash  text,
  raw_content   jsonb,          -- raw payload (or extracted text for pdf/html)
  http_status   int,
  created_at    timestamptz not null default now()
);
create index idx_snapshots_source on source_snapshots(source_id, fetched_at desc);

-- Snapshots are immutable: no updates allowed.
create or replace function forbid_update()
returns trigger language plpgsql as $$
begin
  raise exception '% rows are immutable — insert a new row instead', tg_table_name;
end $$;
create trigger trg_snapshots_immutable before update on source_snapshots
  for each row execute function forbid_update();

-- ----------------------------------------------------------------------------
-- 7. market_updates — detected changes awaiting human review (MarketUpdateRecord)
-- ----------------------------------------------------------------------------
create table market_updates (
  id                   text primary key default ('mu-' || gen_random_uuid()::text),
  source_id            text not null references source_registry(id),
  snapshot_id          text references source_snapshots(id),
  country              text not null,
  title                text not null,
  summary              text,
  detected_at          timestamptz not null default now(),
  update_date          date,
  affected_scenarios   text[] not null default '{}',
  before_value         numeric,
  after_value          numeric,
  unit                 text,
  estimated_impact     numeric,        -- MYR/yr, computed deterministically; null if n/a
  confidence           text not null default 'low' check (confidence in ('high','medium','low','demo')),
  human_review_status  text not null default 'needs_review'
                       check (human_review_status in ('needs_review','pending_review','approved','rejected')),
  reviewed_by          text,
  reviewed_at          timestamptz,
  created_at           timestamptz not null default now()
);
create index idx_market_updates_status on market_updates(country, human_review_status);

-- ----------------------------------------------------------------------------
-- 8. assumption_versions — versioned assumptions (AssumptionVersionRecord)
--    RULE: cannot be active unless approved (demo_seed is the sanctioned
--    demo-phase exception and must disappear before production).
-- ----------------------------------------------------------------------------
create table assumption_versions (
  id                          text primary key,   -- '<assumption_key>@<version>' e.g. 'ASM-CRESS-SAC@0.2'
  country                     text not null,
  assumption_key              text not null,      -- e.g. 'ASM-CRESS-SAC'
  version                     text not null,      -- '0.1', '0.2', ...
  label                       text,
  value                       numeric,
  unit                        text not null,
  source_id                   text not null references source_registry(id),
  effective_date              date not null default current_date,
  confidence                  text not null default 'demo' check (confidence in ('high','medium','low','demo')),
  human_review_status         text not null default 'needs_review'
                              check (human_review_status in ('approved','pending_review','needs_review','demo_seed','rejected')),
  active                      boolean not null default false,
  affected_models             text[] not null default '{}',
  provisional                 boolean not null default false,
  caveat                      text,
  reviewed_by                 text,
  created_from_market_update  text references market_updates(id),
  created_at                  timestamptz not null default now(),
  unique (assumption_key, version, country),
  -- TRUST RULE: no assumption becomes active unless approved (demo_seed = labeled demo data).
  constraint active_requires_approval
    check (active = false or human_review_status in ('approved','demo_seed'))
);
-- Only one active version per assumption per country.
create unique index idx_one_active_assumption
  on assumption_versions(country, assumption_key) where active;
create index idx_assumptions_key on assumption_versions(country, assumption_key, version);

-- Versions are immutable except review/activation metadata. Never edit values —
-- insert a new version instead.
create or replace function assumption_versions_guard()
returns trigger language plpgsql as $$
begin
  if new.value is distinct from old.value
     or new.unit is distinct from old.unit
     or new.assumption_key is distinct from old.assumption_key
     or new.version is distinct from old.version
     or new.country is distinct from old.country
     or new.source_id is distinct from old.source_id
     or new.effective_date is distinct from old.effective_date then
    raise exception 'assumption_versions core fields are immutable — insert a new version instead';
  end if;
  return new;
end $$;
create trigger trg_assumptions_immutable before update on assumption_versions
  for each row execute function assumption_versions_guard();

-- ----------------------------------------------------------------------------
-- 9. scenario_results — deterministic engine output (ScenarioResult)
--    calculation_trace is REQUIRED and non-empty: no trace, no result.
-- ----------------------------------------------------------------------------
create table scenario_results (
  id                       text primary key,   -- '<project_id>:<scenario_key>@<assumption_set_version>'
  project_id               text not null references projects(id) on delete cascade,
  scenario_key             text not null
                           check (scenario_key in ('baseline_grid','solar_atap','cress','bess','solar_cress')),
  assumption_set_version   text not null,       -- 'v0.1', 'v0.2'
  annual_cost              numeric not null,
  annual_savings           numeric not null,
  renewable_share          numeric not null,    -- %
  carbon_reduction         numeric not null,    -- %
  capex                    numeric not null,
  payback                  numeric,             -- years; null = not applicable
  complexity               text not null check (complexity in ('None','Low','Medium','High')),
  grid_impact              text,
  confidence               text not null check (confidence in ('high','medium','low','demo')),
  calculation_trace        jsonb not null check (jsonb_array_length(calculation_trace) > 0),
  assumption_version_ids   text[] not null default '{}',
  created_at               timestamptz not null default now()
);
create index idx_results_project on scenario_results(project_id, created_at desc);
create trigger trg_results_immutable before update on scenario_results
  for each row execute function forbid_update();

-- ----------------------------------------------------------------------------
-- 10. memo_versions — versioned deliverable (MemoVersionRecord)
--     Must record which market updates and assumption versions were used.
-- ----------------------------------------------------------------------------
create table memo_versions (
  id                       text primary key default ('memo-' || gen_random_uuid()::text),
  project_id               text not null references projects(id) on delete cascade,
  version                  int not null,
  memo_type                text not null default 'cfo' check (memo_type in ('cfo','board','ops')),
  content                  jsonb not null,      -- MemoSection[]
  market_update_ids        text[] not null default '{}',
  assumption_version_ids   text[] not null default '{}',
  assumption_set_version   text,
  human_review_status      text not null default 'pending_review'
                           check (human_review_status in ('approved','pending_review','needs_review','rejected')),
  approved_by              text,
  approved_at              timestamptz,
  created_at               timestamptz not null default now(),
  unique (project_id, version),
  -- An approved memo must say who/when.
  constraint approved_memo_has_approver
    check (human_review_status <> 'approved' or (approved_at is not null))
);
create index idx_memos_project on memo_versions(project_id, version desc);

-- ----------------------------------------------------------------------------
-- 11. human_reviews — the approval trail (who approved what, when)
-- ----------------------------------------------------------------------------
create table human_reviews (
  id            text primary key default ('rev-' || gen_random_uuid()::text),
  review_type   text not null
                check (review_type in ('market_update','assumption_version','memo_version','energy_bill','baseline')),
  target_id     text not null,        -- id in the corresponding table
  decision      text not null check (decision in ('approved','rejected','needs_changes')),
  reviewer_name text not null,
  note          text,
  reviewed_at   timestamptz not null default now()
);
create index idx_reviews_target on human_reviews(review_type, target_id);
create trigger trg_reviews_immutable before update on human_reviews
  for each row execute function forbid_update();

-- ----------------------------------------------------------------------------
-- 12. audit_logs — append-only record of every state change that matters
-- ----------------------------------------------------------------------------
create table audit_logs (
  id           bigint generated always as identity primary key,
  actor        text not null default 'system',
  action       text not null,          -- insert | update
  entity_type  text not null,
  entity_id    text not null,
  details      jsonb,
  created_at   timestamptz not null default now()
);
create index idx_audit_entity on audit_logs(entity_type, entity_id);
create trigger trg_audit_immutable before update on audit_logs
  for each row execute function forbid_update();

-- Auto-audit the trust-critical tables.
-- NOTE: 'powerready.actor' is a FUNCTIONAL Postgres setting name that predates
-- the Powerpath rebrand — do not rename it; existing triggers depend on it.
create or replace function write_audit()
returns trigger language plpgsql as $$
begin
  insert into audit_logs (actor, action, entity_type, entity_id, details)
  values (
    coalesce(nullif(current_setting('powerready.actor', true), ''), 'system'),
    lower(tg_op),
    tg_table_name,
    coalesce(new.id::text, '?'),
    to_jsonb(new)
  );
  return new;
end $$;
create trigger trg_audit_market_updates after insert or update on market_updates
  for each row execute function write_audit();
create trigger trg_audit_assumptions after insert or update on assumption_versions
  for each row execute function write_audit();
create trigger trg_audit_memos after insert or update on memo_versions
  for each row execute function write_audit();
create trigger trg_audit_reviews after insert on human_reviews
  for each row execute function write_audit();

-- ----------------------------------------------------------------------------
-- Row Level Security: enabled everywhere, NO policies yet.
-- Nothing is accessible with the anon key. The connection step will add
-- server-side access (service role, used ONLY in server code) and, later,
-- auth-scoped policies. Never put the service-role key in client code.
-- ----------------------------------------------------------------------------
alter table projects            enable row level security;
alter table sites               enable row level security;
alter table energy_bills        enable row level security;
alter table country_modules     enable row level security;
alter table source_registry     enable row level security;
alter table source_snapshots    enable row level security;
alter table market_updates      enable row level security;
alter table assumption_versions enable row level security;
alter table scenario_results    enable row level security;
alter table memo_versions       enable row level security;
alter table human_reviews       enable row level security;
alter table audit_logs          enable row level security;

-- ============================================================================
-- SEED DATA (demo-grade; mirrors data/*.yaml|json — safe to re-run on fresh DB)
-- ============================================================================

insert into country_modules (country, module_status, frameworks, notes) values
  ('Malaysia',  'full',    '{CRESS,SOLAR_ATAP}', 'Demo module: CRESS + Solar ATAP frameworks, demo assumption set.'),
  ('Singapore', 'limited', '{}',                 'Limited demo module — country-specific rules not fully connected yet.'),
  ('Vietnam',   'limited', '{}',                 'Limited demo module — country-specific rules not fully connected yet.');

insert into source_registry (id, country, source_type, source_name, authority, url, cadence, parser_type, priority, active, trust_note) values
  ('SRC-CRESS-SAC',       'Malaysia', 'monitor',  'ST / PETRA CRESS — System Access Charge (SAC) monitor', 'Suruhanjaya Tenaga (ST) / PETRA', null, 'weekly',    'html',     1, true,  'Detect changes -> flag needs_review. Never auto-apply. Not an official rate claim.'),
  ('SRC-CRESS-GUIDELINE', 'Malaysia', 'document', 'ST CRESS guideline reference',                          'Suruhanjaya Tenaga (ST)',         null, 'manual',    'pdf',      2, true,  'Cited as evidence for CRESS assumptions. Not restated as our official claim.'),
  ('SRC-SEDA-SOLAR',      'Malaysia', 'document', 'SEDA solar program reference',                          'SEDA Malaysia',                   null, 'manual',    'html',     3, true,  'Program context only. No guaranteed rates.'),
  ('SRC-TNB-SOLAR-ATAP',  'Malaysia', 'document', 'TNB Solar ATAP reference',                              'Tenaga Nasional Berhad (TNB)',    null, 'manual',    'html',     3, true,  'Rooftop solar context. No guaranteed tariff.'),
  ('SRC-NASA-POWER',      'Malaysia', 'api',      'NASA POWER solar resource API (Johor)',                 'NASA POWER', 'https://power.larc.nasa.gov/api/', 'on_demand', 'json_api', 1, true, 'Quantitative real API. Cache responses as snapshots for reproducible scenarios.'),
  ('SRC-DEMO-SEED',       'Malaysia', 'internal', 'Demo seed data',                                        'Powerpath (internal demo)',       null, 'none',      'none',     9, true,  'Demo-grade only. Must be labeled as demo/sample in the UI.');

-- Assumption versions v0.1 (initial set; provisional CRESS SAC) — mirrors
-- data/assumptions/malaysia_assumptions.v0.1.yaml. demo_seed rows are sanctioned
-- demo-phase data and must be replaced before any production claim.
insert into assumption_versions
  (id, country, assumption_key, version, label, value, unit, source_id, effective_date, confidence, human_review_status, active, affected_models, provisional, caveat) values
  ('ASM-GRID-TARIFF-AVG@0.1',      'Malaysia', 'ASM-GRID-TARIFF-AVG',      '0.1', 'Average grid tariff (from demo bill)',                0.452,   'MYR/kWh',        'SRC-DEMO-SEED',      '2026-07-01', 'demo',   'demo_seed',    true,  '{baseline_grid,solar_atap,cress,bess,solar_cress}', false, 'Derived from the demo baseline bill. Demo-grade until a real bill/CSV is uploaded.'),
  ('ASM-GRID-EMISSION-FACTOR@0.1', 'Malaysia', 'ASM-GRID-EMISSION-FACTOR', '0.1', 'Grid emission factor (Peninsular Malaysia)',          0.74,    'tCO2e/MWh',      'SRC-DEMO-SEED',      '2026-07-01', 'demo',   'demo_seed',    true,  '{baseline_grid,solar_atap,cress,bess,solar_cress}', false, 'Pre-feasibility estimate. Replace with an authoritative factor before any customer claim.'),
  ('ASM-SOLAR-RESOURCE-JOHOR@0.1', 'Malaysia', 'ASM-SOLAR-RESOURCE-JOHOR', '0.1', 'Solar resource / specific yield (Johor)',             1400,    'kWh/kWp/year',   'SRC-NASA-POWER',     '2026-07-01', 'medium', 'demo_seed',    true,  '{solar_atap,solar_cress}',                          false, 'Demo placeholder until fetched from NASA POWER for the actual site (live-data phase).'),
  ('ASM-SOLAR-ATAP-SIZE@0.1',      'Malaysia', 'ASM-SOLAR-ATAP-SIZE',      '0.1', 'On-site rooftop solar size (indicative)',             3000,    'kWp',            'SRC-TNB-SOLAR-ATAP', '2026-07-01', 'demo',   'demo_seed',    true,  '{solar_atap,solar_cress}',                          false, 'Indicative rooftop capacity. Requires a roof/structural survey to confirm.'),
  ('ASM-SOLAR-CAPEX@0.1',          'Malaysia', 'ASM-SOLAR-CAPEX',          '0.1', 'On-site solar capex (indicative)',                    3200,    'MYR/kWp',        'SRC-DEMO-SEED',      '2026-07-01', 'demo',   'demo_seed',    true,  '{solar_atap,solar_cress}',                          false, 'Indicative only. Not a quote.'),
  ('ASM-SOLAR-LIFETIME@0.1',       'Malaysia', 'ASM-SOLAR-LIFETIME',       '0.1', 'Solar asset lifetime (levelised cost)',               25,      'years',          'SRC-DEMO-SEED',      '2026-07-01', 'demo',   'demo_seed',    true,  '{solar_atap,solar_cress}',                          false, 'Planning assumption for pre-feasibility levelised cost only.'),
  ('ASM-SOLAR-OM-UPLIFT@0.1',      'Malaysia', 'ASM-SOLAR-OM-UPLIFT',      '0.1', 'Solar O&M + degradation uplift',                      15,      '%',              'SRC-DEMO-SEED',      '2026-07-01', 'demo',   'demo_seed',    true,  '{solar_atap,solar_cress}',                          false, 'Simplified uplift for pre-feasibility. Not a detailed financial model.'),
  ('ASM-CRESS-PPA-RATE@0.1',       'Malaysia', 'ASM-CRESS-PPA-RATE',       '0.1', 'Renewable PPA energy rate (indicative)',              0.38,    'MYR/kWh',        'SRC-DEMO-SEED',      '2026-07-01', 'low',    'demo_seed',    true,  '{cress,solar_cress}',                               false, 'Indicative pre-feasibility figure. NOT an official or guaranteed PPA rate.'),
  ('ASM-CRESS-SAC@0.1',            'Malaysia', 'ASM-CRESS-SAC',            '0.1', 'CRESS System Access Charge (provisional)',            0.08,    'MYR/kWh',        'SRC-CRESS-SAC',      '2026-07-01', 'low',    'demo_seed',    true,  '{cress,solar_cress}',                               true,  'PROVISIONAL placeholder pending the CRESS SAC source monitor. Not an official charge.'),
  ('ASM-CRESS-RE-SHARE@0.1',       'Malaysia', 'ASM-CRESS-RE-SHARE',       '0.1', 'Renewable share sourced via CRESS (target-aligned)',  40,      '% of annual use','SRC-CRESS-GUIDELINE','2026-07-01', 'demo',   'demo_seed',    true,  '{cress}',                                           false, 'Illustrative allocation to meet the renewable target. Pre-feasibility only.'),
  ('ASM-BESS-CAPEX@0.1',           'Malaysia', 'ASM-BESS-CAPEX',           '0.1', 'Battery energy storage capex (indicative)',           4000000, 'MYR',            'SRC-DEMO-SEED',      '2026-07-01', 'demo',   'demo_seed',    true,  '{bess}',                                            false, 'Indicative system cost. Not a quote.'),
  ('ASM-BESS-BILL-SAVING@0.1',     'Malaysia', 'ASM-BESS-BILL-SAVING',     '0.1', 'BESS bill saving from peak shaving (indicative)',     4,       '% of annual bill','SRC-DEMO-SEED',     '2026-07-01', 'demo',   'demo_seed',    true,  '{bess}',                                            false, 'Indicative peak-shaving saving. Requires interval/demand data to confirm.'),
  ('ASM-TARIFF-ESCALATION@0.1',    'Malaysia', 'ASM-TARIFF-ESCALATION',    '0.1', 'Grid tariff escalation (planning assumption)',        3.0,     '%/year',         'SRC-DEMO-SEED',      '2026-07-01', 'demo',   'demo_seed',    true,  '{baseline_grid,solar_atap,cress,bess,solar_cress}', false, 'Planning assumption only. Not a forecast.');

-- The pending CRESS market update (mirrors data/sources/market_update.cress_sac.json).
-- estimated_impact stays NULL here: it is computed per-study by deterministic code.
insert into market_updates
  (id, source_id, country, title, summary, detected_at, update_date, affected_scenarios, before_value, after_value, unit, confidence, human_review_status) values
  ('MU-CRESS-SAC-2026-07-01', 'SRC-CRESS-SAC', 'Malaysia',
   'Lower SAC improves CRESS economics',
   'Source monitor detected a change to the CRESS System Access Charge reference.',
   '2026-07-01T09:12:00+08:00', '2026-07-01',
   '{cress,solar_cress}', 0.08, 0.045, 'MYR/kWh', 'low', 'needs_review');

-- v0.2 of the CRESS SAC exists but is NOT active — activation happens only when a
-- human approval flips it (approve update -> insert human_reviews row -> deactivate
-- v0.1 row -> activate v0.2). Stored inactive+approved here so the closed loop can
-- be exercised end-to-end without violating active_requires_approval.
insert into assumption_versions
  (id, country, assumption_key, version, label, value, unit, source_id, effective_date, confidence, human_review_status, active, affected_models, provisional, caveat, reviewed_by, created_from_market_update) values
  ('ASM-CRESS-SAC@0.2', 'Malaysia', 'ASM-CRESS-SAC', '0.2',
   'CRESS System Access Charge (approved from source update)',
   0.045, 'MYR/kWh', 'SRC-CRESS-SAC', '2026-07-01', 'medium', 'approved', false,
   '{cress,solar_cress}', false,
   'Demo/pre-feasibility figure approved from the source monitor for illustration. Not an official published charge.',
   'Demo Reviewer', 'MU-CRESS-SAC-2026-07-01');
