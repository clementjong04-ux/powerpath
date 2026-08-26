-- Migration 0006 — database-backed human approval loop.
-- Run ONCE in the Supabase SQL Editor (after 0005 / APPLY_PENDING.sql).
--
-- 1. market_updates gains 'approved_demo' and 'ignored' review statuses (demo-phase
--    approvals are labeled as demo — never presented as real sign-off), plus an
--    affects_assumption column so an update knows which assumption it versions.
-- 2. human_reviews gains matching decision vocabulary.

alter table market_updates drop constraint if exists market_updates_human_review_status_check;
alter table market_updates
  add constraint market_updates_human_review_status_check
  check (human_review_status in ('needs_review','pending_review','approved','approved_demo','ignored','rejected'));

alter table market_updates
  add column if not exists affects_assumption text;

update market_updates
   set affects_assumption = 'ASM-CRESS-SAC'
 where id = 'MU-CRESS-SAC-2026-07-01' and affects_assumption is null;

alter table human_reviews drop constraint if exists human_reviews_decision_check;
alter table human_reviews
  add constraint human_reviews_decision_check
  check (decision in ('approved','approved_demo','rejected','needs_changes','ignored'));
