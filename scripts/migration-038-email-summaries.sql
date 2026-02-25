-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 038 — Email Summaries & Summary State
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Adds two new tables for AI-synthesized email summaries:
--
-- 1. email_summaries — Stores generated summary content (headline, themed
--    sections, stats) along with the coverage window and AI metadata.
--
-- 2. user_summary_state — Lightweight staleness tracking. Updated after each
--    email sync (is_stale = true) and after each summary generation
--    (is_stale = false). The summary generator checks this table to decide
--    whether a new summary is needed (stale + at least 1 hour since last).
--
-- HOW IT WORKS:
--   Email sync completes → SET is_stale = true, increment emails_since_last
--   User visits /home    → GET /api/summaries/latest checks staleness
--   If stale + >1hr old  → POST /api/summaries/generate → AI synthesis
--   After generation     → SET is_stale = false, reset counter
--
-- Safe to run multiple times (idempotent).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Table 1: email_summaries ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Summary content
  headline TEXT NOT NULL,
  sections JSONB NOT NULL DEFAULT '[]',
  stats JSONB NOT NULL DEFAULT '{}',

  -- Coverage window (which emails were included)
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  emails_included INTEGER NOT NULL DEFAULT 0,
  threads_included INTEGER NOT NULL DEFAULT 0,

  -- AI metadata
  tokens_used INTEGER,
  estimated_cost NUMERIC(10,6),
  processing_time_ms INTEGER,
  model TEXT DEFAULT 'gpt-4.1-mini',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast "latest summary for user" query
CREATE INDEX IF NOT EXISTS idx_email_summaries_user_latest
  ON email_summaries (user_id, created_at DESC);

-- RLS policies
ALTER TABLE email_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own summaries" ON email_summaries;
CREATE POLICY "Users can read own summaries"
  ON email_summaries FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own summaries" ON email_summaries;
CREATE POLICY "Users can insert own summaries"
  ON email_summaries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ─── Table 2: user_summary_state ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_summary_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_summary_at TIMESTAMPTZ,
  is_stale BOOLEAN NOT NULL DEFAULT true,
  emails_since_last INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS policies
ALTER TABLE user_summary_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own summary state" ON user_summary_state;
CREATE POLICY "Users can read own summary state"
  ON user_summary_state FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own summary state" ON user_summary_state;
CREATE POLICY "Users can update own summary state"
  ON user_summary_state FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own summary state" ON user_summary_state;
CREATE POLICY "Users can insert own summary state"
  ON user_summary_state FOR INSERT
  WITH CHECK (auth.uid() = user_id);

COMMIT;

-- Verify
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('email_summaries', 'user_summary_state')
ORDER BY table_name;
