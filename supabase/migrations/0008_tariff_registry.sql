-- Migration 0008 — tariff registry + site tariff context.
-- Run ONCE in the Supabase SQL Editor (after APPLY_PENDING.sql / 0007).
--
-- TRUST NOTE: tariff_registry rows are CATEGORY REFERENCES for pre-feasibility
-- labeling only. They carry NO prices and are never used for tariff-grade bill
-- calculation. The calculation engine keeps deriving the average unit cost from
-- the user's own bill (annual cost ÷ annual kWh).

-- 1. The registry ------------------------------------------------------------
create table if not exists tariff_registry (
  id                    text primary key,        -- e.g. 'MY-TNB-MV-GEN'
  country               text not null,
  region                text not null,           -- e.g. 'Peninsular Malaysia'
  state                 text,                    -- null = applies to all states in the region
  utility               text not null,           -- e.g. 'TNB'
  market                text not null default 'regulated',
  customer_segment      text not null default 'non_domestic',
  user_type_hint        text not null default 'any'
                        check (user_type_hint in ('industrial','commercial','any')),
  supply_voltage_level  text not null check (supply_voltage_level in ('LV','MV','HV')),
  tariff_code           text not null,
  display_name          text not null,
  description           text,
  legacy_label          text,                    -- reference only, never tariff-grade billing
  effective_from        date,
  effective_to          date,
  source_id             text,                    -- source_registry id (reference)
  verification_status   text not null default 'pending'
                        check (verification_status in ('verified_official','pending','unverified','not_official_source')),
  official_status       text not null default 'pre_feasibility_reference',
  active                boolean not null default true,
  caveat                text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_tariff_registry_lookup
  on tariff_registry(country, utility, supply_voltage_level, active);
alter table tariff_registry enable row level security;

-- 2. Site tariff context (selection stored with the study's site) -------------
alter table sites add column if not exists state text;
alter table sites add column if not exists region text;
alter table sites add column if not exists utility text;
alter table sites add column if not exists supply_voltage_level text;
alter table sites add column if not exists tariff_code text;
alter table sites add column if not exists tariff_source_id text;
alter table sites add column if not exists tariff_verification_status text;

-- 3. Register the TNB tariff-structure reference source (pending until a human
--    verifies it in the registry workflow).
insert into source_registry (id, country, source_type, source_name, authority, url, cadence, parser_type, priority, active, trust_note)
values (
  'SRC-TNB-TARIFF',
  'Malaysia',
  'document',
  'TNB non-domestic tariff structure reference',
  'Tenaga Nasional Berhad (TNB)',
  'https://www.mytnb.com.my/tariff',
  'manual',
  'manual',
  2,
  true,
  'Category-structure reference for labeling only. No rate from this source is applied without a verified, human-approved assumption version.'
)
on conflict (id) do nothing;
update source_registry
  set verification_status = coalesce(verification_status, 'pending'),
      official_status = coalesce(official_status, 'official_utility_reference'),
      source_domain = coalesce(source_domain, 'mytnb.com.my')
  where id = 'SRC-TNB-TARIFF';

-- 4. Seed — Malaysia MVP (Peninsular / TNB, non-domestic references, NO prices).
--    Sabah (SESB) and Sarawak (SEB) are deliberately NOT seeded: those modules
--    show "coming soon" and must never silently fall back to TNB categories.
insert into tariff_registry
  (id, country, region, state, utility, market, customer_segment, user_type_hint,
   supply_voltage_level, tariff_code, display_name, description, legacy_label,
   source_id, verification_status, official_status, active, caveat)
values
  ('MY-TNB-LV-GEN',  'Malaysia', 'Peninsular Malaysia', null, 'TNB', 'regulated', 'non_domestic', 'commercial',
   'LV', 'MY-TNB-LV-GEN',  'Non-Domestic Low Voltage — General (reference)',
   'Low-voltage non-domestic connection (typically shops, offices, small commercial premises).',
   'Context: historically Tariff B / C1 family (pre-2024 labels, reference only)',
   'SRC-TNB-TARIFF', 'pending', 'pre_feasibility_reference', true,
   'Category reference only — not a tariff-grade rate. Average unit cost still comes from your bill.'),
  ('MY-TNB-LV-TOU',  'Malaysia', 'Peninsular Malaysia', null, 'TNB', 'regulated', 'non_domestic', 'any',
   'LV', 'MY-TNB-LV-TOU',  'Non-Domestic Low Voltage — Time-of-Use (reference)',
   'Low-voltage non-domestic with time-of-use structure (peak/off-peak periods).',
   'Context: TOU variants of the LV non-domestic family (reference only)',
   'SRC-TNB-TARIFF', 'pending', 'pre_feasibility_reference', true,
   'Category reference only — not a tariff-grade rate. Average unit cost still comes from your bill.'),
  ('MY-TNB-MV-GEN',  'Malaysia', 'Peninsular Malaysia', null, 'TNB', 'regulated', 'non_domestic', 'industrial',
   'MV', 'MY-TNB-MV-GEN',  'Non-Domestic Medium Voltage — General (reference)',
   'Medium-voltage non-domestic connection (typical for factories and larger commercial sites).',
   'Context: historically E1 / C1 (MV) family (pre-2024 labels, reference only)',
   'SRC-TNB-TARIFF', 'pending', 'pre_feasibility_reference', true,
   'Category reference only — not a tariff-grade rate. Average unit cost still comes from your bill.'),
  ('MY-TNB-MV-TOU',  'Malaysia', 'Peninsular Malaysia', null, 'TNB', 'regulated', 'non_domestic', 'industrial',
   'MV', 'MY-TNB-MV-TOU',  'Non-Domestic Medium Voltage — Time-of-Use (reference)',
   'Medium-voltage non-domestic with time-of-use structure (peak/off-peak demand management).',
   'Context: historically E2 / C2 family (pre-2024 labels, reference only)',
   'SRC-TNB-TARIFF', 'pending', 'pre_feasibility_reference', true,
   'Category reference only — not a tariff-grade rate. Average unit cost still comes from your bill.'),
  ('MY-TNB-HV-GEN',  'Malaysia', 'Peninsular Malaysia', null, 'TNB', 'regulated', 'non_domestic', 'industrial',
   'HV', 'MY-TNB-HV-GEN',  'Non-Domestic High Voltage — General (reference)',
   'High-voltage non-domestic connection (large industrial plants, heavy loads).',
   'Context: historically E3 family (pre-2024 labels, reference only)',
   'SRC-TNB-TARIFF', 'pending', 'pre_feasibility_reference', true,
   'Category reference only — not a tariff-grade rate. Average unit cost still comes from your bill.'),
  ('MY-TNB-HV-TOU',  'Malaysia', 'Peninsular Malaysia', null, 'TNB', 'regulated', 'non_domestic', 'industrial',
   'HV', 'MY-TNB-HV-TOU',  'Non-Domestic High Voltage — Time-of-Use (reference)',
   'High-voltage non-domestic with time-of-use structure.',
   'Context: TOU variants of the HV non-domestic family (reference only)',
   'SRC-TNB-TARIFF', 'pending', 'pre_feasibility_reference', true,
   'Category reference only — not a tariff-grade rate. Average unit cost still comes from your bill.')
on conflict (id) do nothing;
