-- Migration 0007 — sync_runs: one record per source-sync attempt.
-- Optional but recommended: the sync route works without it (skips with a warning).
-- Run ONCE in the Supabase SQL Editor (after 0006 / APPLY_PENDING.sql).

create table if not exists sync_runs (
  id                text primary key default ('sync-' || gen_random_uuid()::text),
  source_id         text not null references source_registry(id),
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  status            text not null default 'running'
                    check (status in ('running','succeeded','failed','blocked')),
  http_status       int,
  content_hash      text,
  changed           boolean,
  snapshot_id       text references source_snapshots(id),
  market_update_id  text references market_updates(id),
  error             text
);
create index if not exists idx_sync_runs_source on sync_runs(source_id, started_at desc);

alter table sync_runs enable row level security;
