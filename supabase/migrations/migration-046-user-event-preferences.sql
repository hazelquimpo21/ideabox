-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 046: User Event Preferences (Phase 4 — Preference Learning)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- PURPOSE:
-- Creates the user_event_preferences table for Phase 4 preference learning.
-- This table accumulates user signals from dismiss/maybe/save actions to
-- personalize event ranking via the composite weight algorithm.
--
-- HOW IT WORKS:
-- 1. User dismisses a webinar → preference_score for event_type='webinar' decreases
-- 2. User saves a community event → preference_score for event_type='community' increases
-- 3. getBehaviorWeight() in composite-weight.ts reads these preferences
-- 4. Future events of that type are ranked higher/lower accordingly
--
-- PREFERENCE TYPES:
-- - event_type:    "I don't care about webinars" (maps to 18-type event taxonomy)
-- - sender_domain: "I love events from meetup.com"
-- - category:      "I care about local events" (maps to email category)
-- - keyword:       Reserved for future use
--
-- SCORING:
-- Uses exponential moving average (EMA) with count-aware decay:
--   alpha = max(0.1, 1 / (total_count + 1))
--   new_score = old_score * (1 - alpha) + action_weight * alpha
-- This gives early signals more impact and stabilizes over time.
--
-- Action weights: saved_to_calendar=+1.0, maybe=+0.5, dismissed=-1.0
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Create user_event_preferences table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_event_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What kind of preference this is
  preference_type TEXT NOT NULL CHECK (preference_type IN (
    'event_type',      -- e.g., key='webinar', score=-0.8
    'sender_domain',   -- e.g., key='meetup.com', score=0.6
    'category',        -- e.g., key='community', score=0.4
    'keyword'          -- Reserved for future use
  )),

  -- The specific value (event type name, domain, category name, etc.)
  preference_key TEXT NOT NULL,

  -- Accumulated preference score: -1.0 (strongly dislike) to +1.0 (strongly like)
  preference_score REAL NOT NULL DEFAULT 0.0,

  -- Counters for debugging and adaptive decay
  positive_count INT NOT NULL DEFAULT 0,   -- maybe + saved_to_calendar actions
  negative_count INT NOT NULL DEFAULT 0,   -- dismiss actions
  total_count INT NOT NULL DEFAULT 0,      -- all actions

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One preference per user + type + key
  UNIQUE(user_id, preference_type, preference_key)
);

COMMENT ON TABLE user_event_preferences IS
  'Accumulated user preferences for event types, sender domains, and categories. '
  'Scores range from -1.0 (strongly dislike) to +1.0 (strongly like). '
  'Fed by dismiss/maybe/save actions via the event state API. '
  'Read by composite-weight.ts getBehaviorWeight() for personalized ranking. '
  'Phase 4 — March 2026.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE user_event_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_event_preferences_select ON user_event_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY user_event_preferences_insert ON user_event_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_event_preferences_update ON user_event_preferences
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_event_preferences_delete ON user_event_preferences
  FOR DELETE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- Primary lookup: fetch all preferences for a user (batch read in events API)
CREATE INDEX IF NOT EXISTS idx_user_event_prefs_user_id
  ON user_event_preferences(user_id);

-- Specific preference lookup (used during upsert on state change)
CREATE INDEX IF NOT EXISTS idx_user_event_prefs_lookup
  ON user_event_preferences(user_id, preference_type, preference_key);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Auto-update updated_at trigger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_user_event_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_user_event_preferences_updated_at
  BEFORE UPDATE ON user_event_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_user_event_preferences_updated_at();
