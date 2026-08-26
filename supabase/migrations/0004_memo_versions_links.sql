-- Migration 0004 — memo_versions: scenario result links + demo approval status.
-- Run ONCE in the Supabase SQL Editor (after 0003).
--
-- scenario_result_ids: a memo records exactly which stored scenario_results rows
--                      it was assembled from (the audit chain memo -> results -> assumptions).
-- approved_demo:       until real auth lands, approvals are demo approvals and are
--                      labeled as such in the database — never presented as real sign-off.

alter table memo_versions
  add column if not exists scenario_result_ids text[] not null default '{}';

alter table memo_versions drop constraint if exists memo_versions_human_review_status_check;
alter table memo_versions
  add constraint memo_versions_human_review_status_check
  check (human_review_status in ('approved','approved_demo','pending_review','needs_review','rejected'));

alter table memo_versions drop constraint if exists approved_memo_has_approver;
alter table memo_versions
  add constraint approved_memo_has_approver
  check (human_review_status not in ('approved','approved_demo') or approved_at is not null);
