-- Migration 0005 — source verification columns.
-- NOTE: these columns were added manually in the dashboard on 2026-07-05 (verified by
-- Clement); this file captures them so a fresh database gets the same schema.
-- Safe to run on the existing project (add column if not exists).
--
-- Policy (enforced in app logic, documented here):
--   * only verification_status = 'verified_official' sources may drive live source
--     sync, market updates, or assumption updates
--   * not_official_source / internal_demo sources may be displayed and may back
--     clearly-labeled demo assumptions, but never receive or drive live updates
--   * pending / unverified sources show a warning and cannot affect scenario results

alter table source_registry
  add column if not exists official_status text;
alter table source_registry
  add column if not exists verification_status text not null default 'unverified'
    check (verification_status in ('verified_official','pending','unverified','not_official_source'));
alter table source_registry
  add column if not exists verified_by text;
alter table source_registry
  add column if not exists verified_at timestamptz;
alter table source_registry
  add column if not exists evidence_note text;
alter table source_registry
  add column if not exists source_domain text;
