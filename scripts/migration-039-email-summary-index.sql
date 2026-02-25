-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 039 — Add email_index to email_summaries
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Adds an email_index JSONB column that maps each referenced email_id to its
-- subject, sender, and category. This lets the UI render clickable links to
-- source emails without needing extra API calls at render time.
--
-- Structure: { "email-uuid-1": { "subject": "...", "sender": "...", "category": "..." }, ... }
--
-- Safe to run multiple times (idempotent).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Add email_index column (nullable, defaults to empty object for new rows)
ALTER TABLE email_summaries
  ADD COLUMN IF NOT EXISTS email_index JSONB NOT NULL DEFAULT '{}';

COMMIT;
