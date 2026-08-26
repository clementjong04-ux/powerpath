-- Migration 0009 — rebrand: PowerReady AI -> Powerpath (data labels only).
-- Run ONCE in the Supabase SQL Editor.
--
-- LEGACY NOTE (the one sanctioned place the old name lives): the product was
-- renamed from "PowerReady AI" to "Powerpath" on 2026-07-06. This migration
-- updates USER-VISIBLE labels stored in data. It deliberately does NOT touch:
--   * table/column names, API routes, env variable names
--   * the 'powerready.actor' Postgres audit setting (functional, trigger-bound)
--   * historical audit_logs / snapshots (immutable records stay as written)

update source_registry
  set authority = 'Powerpath (internal demo)',
      evidence_note = 'Internal Powerpath demo seed data. Not an official market or tariff source.'
  where id = 'SRC-DEMO-SEED';
