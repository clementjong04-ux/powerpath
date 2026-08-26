-- Migration 0002 — align projects.data_status with the Step 3 statuses.
-- Run this ONCE in the Supabase SQL Editor (same way as schema.sql).
--
-- New allowed values:
--   user_entered  — study created by a user through the setup wizard
--   sample_case   — the Johor Electronics Plant sample study
--   demo_grade    — any other seeded/demo data (reserved)

alter table projects drop constraint if exists projects_data_status_check;

update projects set data_status = 'sample_case' where data_status = 'sample';

alter table projects
  add constraint projects_data_status_check
  check (data_status in ('user_entered','sample_case','demo_grade'));

alter table projects alter column data_status set default 'user_entered';
