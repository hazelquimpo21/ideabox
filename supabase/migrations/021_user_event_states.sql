-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 021_user_event_states.sql
-- Purpose: Create user_event_states table for tracking event dismiss/maybe/saved states
-- Date: January 2026
-- Author: IdeaBox Team
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- OVERVIEW
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- This migration creates a table to track user decisions about events:
--   - dismissed: User doesn't want to see this event anymore
--   - maybe: User is interested but not committed (watch list)
--   - saved_to_calendar: User has added this event to their calendar
--
-- This table is separate from email_analyses to keep user preferences distinct
-- from AI-generated analysis data. It also allows multiple states per event
-- (e.g., both "saved_to_calendar" AND "maybe" could apply).
--
-- WHY THIS DESIGN?
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 1. SEPARATION OF CONCERNS: AI analysis (email_analyses) vs user preferences
--    (user_event_states) are kept separate. This makes it easier to:
--    - Re-run AI analysis without losing user preferences
--    - Query user preferences without complex joins to AI data
--
-- 2. FLEXIBILITY: A user might save an event to calendar AND mark it as "maybe"
--    (e.g., tentatively added). The current design allows this via multiple rows.
--
-- 3. AUDITABILITY: Each state change is a separate row with timestamps, making
--    it easy to track when users made decisions about events.
--
-- USAGE EXAMPLE
-- ═══════════════════════════════════════════════════════════════════════════════
--
--   -- Dismiss an event
--   INSERT INTO user_event_states (user_id, email_id, state)
--   VALUES ('user-uuid', 'email-uuid', 'dismissed');
--
--   -- Check if event is dismissed
--   SELECT EXISTS(
--     SELECT 1 FROM user_event_states
--     WHERE user_id = 'user-uuid'
--       AND email_id = 'email-uuid'
--       AND state = 'dismissed'
--   );
--
--   -- Get all events NOT dismissed
--   SELECT e.*
--   FROM emails e
--   WHERE e.user_id = 'user-uuid'
--     AND NOT EXISTS (
--       SELECT 1 FROM user_event_states ues
--       WHERE ues.email_id = e.id
--         AND ues.state = 'dismissed'
--     );
--
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────────
-- STEP 1: Create the user_event_states table
-- ─────────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_event_states (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  -- user_id: Links to the Supabase auth.users table
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- email_id: Links to the emails table (event source)
  -- Note: We use email_id because the /api/events endpoint uses email ID as event ID
  -- This ensures consistency with the frontend event data structure
  email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,

  -- State: The user's decision about this event
  -- Valid values: 'dismissed', 'maybe', 'saved_to_calendar'
  -- Using TEXT instead of ENUM for flexibility (can add states without migration)
  state TEXT NOT NULL CHECK (state IN ('dismissed', 'maybe', 'saved_to_calendar')),

  -- Optional notes (for future use - e.g., "tentatively booked", "waiting for confirmation")
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint: One state per user per email
  -- This prevents duplicate entries for the same state
  -- A user CAN have multiple states for the same event (e.g., dismissed AND saved_to_calendar)
  -- but cannot have duplicate "dismissed" entries for the same event
  UNIQUE(user_id, email_id, state)
);

-- ─────────────────────────────────────────────────────────────────────────────────
-- STEP 2: Create indexes for efficient querying
-- ─────────────────────────────────────────────────────────────────────────────────

-- Index for looking up all states for a user (e.g., "show me all my dismissed events")
CREATE INDEX idx_user_event_states_user_id
  ON user_event_states(user_id);

-- Index for looking up states by email (e.g., "what states does this event have?")
CREATE INDEX idx_user_event_states_email_id
  ON user_event_states(email_id);

-- Index for filtering by state (e.g., "get all maybe events for this user")
CREATE INDEX idx_user_event_states_user_state
  ON user_event_states(user_id, state);

-- Composite index for the most common query pattern:
-- "Is this specific event dismissed for this user?"
CREATE INDEX idx_user_event_states_lookup
  ON user_event_states(user_id, email_id, state);

-- ─────────────────────────────────────────────────────────────────────────────────
-- STEP 3: Enable Row Level Security (RLS)
-- ─────────────────────────────────────────────────────────────────────────────────

ALTER TABLE user_event_states ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────────
-- STEP 4: Create RLS Policies
-- ─────────────────────────────────────────────────────────────────────────────────

-- Policy: Users can view their own event states
-- This is used when filtering events to exclude dismissed ones
CREATE POLICY "Users can view own event states"
  ON user_event_states
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own event states
-- This is used when dismissing, saving to maybe, or tracking calendar saves
CREATE POLICY "Users can insert own event states"
  ON user_event_states
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own event states
-- This is used for future features like adding notes
CREATE POLICY "Users can update own event states"
  ON user_event_states
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own event states
-- This is used when un-dismissing or removing from maybe list
CREATE POLICY "Users can delete own event states"
  ON user_event_states
  FOR DELETE
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────────
-- STEP 5: Create trigger for updated_at
-- ─────────────────────────────────────────────────────────────────────────────────

-- Reuse the existing update_updated_at_column() function from earlier migrations
-- If it doesn't exist, this will fail gracefully

DO $$
BEGIN
  -- Check if the function exists before creating the trigger
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'update_updated_at_column'
  ) THEN
    -- Create trigger for auto-updating updated_at
    DROP TRIGGER IF EXISTS update_user_event_states_updated_at ON user_event_states;
    CREATE TRIGGER update_user_event_states_updated_at
      BEFORE UPDATE ON user_event_states
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();

    RAISE NOTICE 'Created updated_at trigger for user_event_states';
  ELSE
    RAISE NOTICE 'update_updated_at_column function not found, skipping trigger creation';
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────────
-- STEP 6: Add helpful comments for documentation
-- ─────────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE user_event_states IS
  'Stores user decisions about events (dismissed, maybe, saved_to_calendar). '
  'Separate from AI analysis to keep user preferences distinct from generated data.';

COMMENT ON COLUMN user_event_states.state IS
  'User decision: dismissed (hide from view), maybe (watch list), saved_to_calendar (tracked calendar add)';

COMMENT ON COLUMN user_event_states.notes IS
  'Optional user notes about the decision (future feature)';

-- ─────────────────────────────────────────────────────────────────────────────────
-- STEP 7: Create helper function for checking event state
-- ─────────────────────────────────────────────────────────────────────────────────

-- Function to check if an event has a specific state for a user
-- This simplifies queries in the API layer
CREATE OR REPLACE FUNCTION has_event_state(
  p_user_id UUID,
  p_email_id UUID,
  p_state TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_event_states
    WHERE user_id = p_user_id
      AND email_id = p_email_id
      AND state = p_state
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION has_event_state IS
  'Checks if a user has set a specific state (dismissed, maybe, saved_to_calendar) for an event';

-- ─────────────────────────────────────────────────────────────────────────────────
-- STEP 8: Create helper function to get all states for an event
-- ─────────────────────────────────────────────────────────────────────────────────

-- Function to get all states for a specific event
-- Returns an array of state names
CREATE OR REPLACE FUNCTION get_event_states(
  p_user_id UUID,
  p_email_id UUID
)
RETURNS TEXT[] AS $$
BEGIN
  RETURN ARRAY(
    SELECT state FROM user_event_states
    WHERE user_id = p_user_id
      AND email_id = p_email_id
    ORDER BY state
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_event_states IS
  'Returns all states (dismissed, maybe, saved_to_calendar) for an event as an array';

-- ─────────────────────────────────────────────────────────────────────────────────
-- MIGRATION COMPLETE
-- ─────────────────────────────────────────────────────────────────────────────────
--
-- Next steps for the developer:
-- 1. Run this migration: supabase db push (or apply via Supabase dashboard)
-- 2. Create API endpoint: POST /api/events/[id]/state
-- 3. Update useEvents hook to call the new API
-- 4. Update EventCard to show dismiss/maybe/calendar buttons
-- 5. Update Events page to filter out dismissed events
--
-- ─────────────────────────────────────────────────────────────────────────────────
