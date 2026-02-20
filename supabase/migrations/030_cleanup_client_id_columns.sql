-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 030: Cleanup — Drop client_id columns, archive clients table
-- Phase 4 of the Navigation Redesign
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Step 1: Drop client_id from emails ─────────────────────────────────────
ALTER TABLE emails DROP COLUMN IF EXISTS client_id;

-- ─── Step 2: Drop client_id from actions ─────────────────────────────────────
ALTER TABLE actions DROP COLUMN IF EXISTS client_id;

-- ─── Step 3: Archive the clients table ───────────────────────────────────────
-- Rename rather than drop so we can recover data if needed.
ALTER TABLE clients RENAME TO clients_deprecated;
