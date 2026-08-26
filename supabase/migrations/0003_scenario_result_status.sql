-- Migration 0003 — scenario_results: result_status + run_id.
-- Run ONCE in the Supabase SQL Editor (after 0002).
--
-- result_status: every stored result is explicitly labeled pre_feasibility for now
--                (future stages reserved, never silently upgraded).
-- run_id:        each click of "Run pre-feasibility analysis" (and every recalculate/
--                approved rerun) is an immutable snapshot — rows are never updated,
--                so runs are distinguished by run_id and unique per-run row ids.

alter table scenario_results
  add column if not exists result_status text not null default 'pre_feasibility'
    check (result_status in ('pre_feasibility','feasibility','final'));

alter table scenario_results
  add column if not exists run_id text;

create index if not exists idx_results_run on scenario_results(project_id, run_id);
