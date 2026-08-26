-- ============================================================================
-- APPLY_PENDING — all migrations not yet run on your Supabase project.
-- Combines 0002 + 0003 + 0004 (kept individually in supabase/migrations/).
-- Safe to run more than once. Run the WHOLE file in the SQL Editor.
-- ============================================================================

-- ---- 0002: projects.data_status -> user_entered | sample_case | demo_grade ----
alter table projects drop constraint if exists projects_data_status_check;
update projects set data_status = 'sample_case' where data_status = 'sample';
alter table projects
  add constraint projects_data_status_check
  check (data_status in ('user_entered','sample_case','demo_grade'));
alter table projects alter column data_status set default 'user_entered';

-- ---- 0003: scenario_results.result_status + run_id ----
alter table scenario_results
  add column if not exists result_status text not null default 'pre_feasibility'
    check (result_status in ('pre_feasibility','feasibility','final'));
alter table scenario_results
  add column if not exists run_id text;
create index if not exists idx_results_run on scenario_results(project_id, run_id);

-- ---- 0004: memo_versions scenario links + approved_demo status ----
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

-- ---- 0006: approval loop (approved_demo / ignored statuses + affects_assumption) ----
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

-- ---- verify ----
select 'projects.data_status ok' as check_1
 where exists (select 1 from information_schema.check_constraints
               where constraint_name = 'projects_data_status_check');
select 'scenario_results.result_status ok' as check_2
 where exists (select 1 from information_schema.columns
               where table_name = 'scenario_results' and column_name = 'result_status');
select 'memo_versions.scenario_result_ids ok' as check_3
 where exists (select 1 from information_schema.columns
               where table_name = 'memo_versions' and column_name = 'scenario_result_ids');
