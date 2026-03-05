-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 045: Create user_event_states table (if missing)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- PURPOSE:
-- Ensures the user_event_states table exists. This table was documented in
-- DATABASE_SCHEMA.md as migration 021 but the actual SQL file was never
-- created. The API route (events/[id]/state) has graceful fallbacks for
-- when the table is missing, but Phase 4 preference learning depends on it.
--
-- SCHEMA:
-- Stores user decisions about events: dismissed, maybe, saved_to_calendar.
-- These signals feed into the preference learning system (migration 046).
--
-- NOTE: Uses CREATE TABLE IF NOT EXISTS so this is safe to run even if
-- the table was manually created in Supabase dashboard.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Create user_event_states table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_event_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,

  -- The state: what did the user decide about this event?
  state TEXT NOT NULL CHECK (state IN ('dismissed', 'maybe', 'saved_to_calendar')),

  -- Optional event_index for multi-event emails (e.g., 0, 1, 2)
  -- NULL means the state applies to the single event from this email.
  -- Non-NULL means it targets a specific event from a multi-event email.
  event_index INT,

  -- Optional notes (e.g., "Check schedule first")
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One state per user+email+event_index combination
  UNIQUE(user_id, email_id, state, event_index)
);

COMMENT ON TABLE user_event_states IS
  'User decisions about events extracted from emails. Tracks dismiss/maybe/calendar-save actions. Feeds Phase 4 preference learning.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE user_event_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS user_event_states_select ON user_event_states
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS user_event_states_insert ON user_event_states
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS user_event_states_update ON user_event_states
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS user_event_states_delete ON user_event_states
  FOR DELETE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Indexes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_user_event_states_user_id
  ON user_event_states(user_id);

CREATE INDEX IF NOT EXISTS idx_user_event_states_email_id
  ON user_event_states(user_id, email_id);

CREATE INDEX IF NOT EXISTS idx_user_event_states_state
  ON user_event_states(user_id, state);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Auto-update updated_at trigger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_user_event_states_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_event_states_updated_at ON user_event_states;
CREATE TRIGGER trigger_user_event_states_updated_at
  BEFORE UPDATE ON user_event_states
  FOR EACH ROW
  EXECUTE FUNCTION update_user_event_states_updated_at();
