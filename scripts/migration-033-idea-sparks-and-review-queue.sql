-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 033: Idea Sparks Analyzer + Review Queue + Enhanced Action Types
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- PURPOSE:
-- 1. Add idea_sparks JSONB column to email_analyses for AI-generated ideas
-- 2. Create email_ideas table for user-saved/starred ideas
-- 3. Add reviewed_at to emails for review queue tracking
-- 4. Update action_type CHECK constraint to include new concrete types
--
-- CONTEXT:
-- This migration supports three new features (Feb 2026):
--
-- A) IDEA SPARK ANALYZER
--    Every non-noise email generates 3 creative ideas by cross-referencing
--    the email content with user context (role, interests, projects, location,
--    family, current season). Ideas span: social posts, networking, business,
--    hobbies, date nights, family activities, personal growth, community.
--
-- B) REVIEW QUEUE (Two-Tier Task System)
--    Most emails just need periodic scanning, not individual tasks. The
--    reviewed_at column tracks when an email was last scanned in the daily
--    review queue. Null = not yet reviewed. This replaces creating "review"
--    tasks for every readable email.
--
-- C) TIGHTENED ACTION TYPES
--    New concrete action types (pay, submit, register, book) distinguish
--    "real" tasks from passive review items. The action extractor is now
--    more discriminating about what constitutes a real task.
--
-- COST IMPACT:
--    Idea Spark Analyzer: ~$0.0002/email × ~175 emails/day = ~$1.05/month
--
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add idea_sparks JSONB column to email_analyses
-- ─────────────────────────────────────────────────────────────────────────────
-- Stores the 3 AI-generated ideas for each email.
-- Structure: { has_ideas: bool, ideas: [{ idea, type, relevance, confidence }], confidence: float }
-- Only populated for non-noise emails (signal_strength != 'noise').

ALTER TABLE email_analyses
  ADD COLUMN IF NOT EXISTS idea_sparks JSONB;

COMMENT ON COLUMN email_analyses.idea_sparks IS
  'AI-generated creative ideas from email content + user context. 3 ideas per email, each with type (social_post, networking, business, etc.), relevance explanation, and confidence score. Only populated for non-noise emails.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Create email_ideas table for saved/starred ideas
-- ─────────────────────────────────────────────────────────────────────────────
-- When a user saves, stars, or acts on an idea from the idea sparks,
-- a row is created here. This separates "all generated ideas" (in JSONB)
-- from "ideas the user cares about" (in this table).

CREATE TABLE IF NOT EXISTS email_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_id UUID REFERENCES emails(id) ON DELETE SET NULL,
  idea TEXT NOT NULL,
  idea_type TEXT NOT NULL CHECK (idea_type IN (
    'social_post', 'networking', 'business', 'content_creation',
    'hobby', 'shopping', 'date_night', 'family_activity',
    'personal_growth', 'community'
  )),
  relevance TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'saved', 'dismissed', 'done')),
  confidence DECIMAL(3,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying user's saved ideas
CREATE INDEX IF NOT EXISTS idx_email_ideas_user_status
  ON email_ideas(user_id, status)
  WHERE status != 'dismissed';

-- Index for finding ideas by source email
CREATE INDEX IF NOT EXISTS idx_email_ideas_email
  ON email_ideas(email_id)
  WHERE email_id IS NOT NULL;

-- RLS policy: users can only see their own ideas
ALTER TABLE email_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own ideas"
  ON email_ideas
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Updated_at trigger
CREATE TRIGGER set_email_ideas_updated_at
  BEFORE UPDATE ON email_ideas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE email_ideas IS
  'User-saved ideas from the AI Idea Spark analyzer. Ideas are generated per-email and stored in email_analyses.idea_sparks. When a user saves/stars an idea, it is promoted to this table for persistence and tracking.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Add reviewed_at to emails for review queue tracking
-- ─────────────────────────────────────────────────────────────────────────────
-- Tracks when the user last scanned this email in the daily review queue.
-- NULL = never reviewed in the queue. This supports the two-tier system:
-- Review Queue (scan-worthy emails) vs Real Tasks (concrete actions).

ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

COMMENT ON COLUMN emails.reviewed_at IS
  'When the user last scanned this email in the daily review queue. NULL = not yet reviewed. Used by the two-tier task system to surface unreviewed, review-worthy emails.';

-- Composite index for review queue queries:
-- "Show me unreviewed, non-archived emails with medium+ signal from the last 7 days"
CREATE INDEX IF NOT EXISTS idx_emails_review_queue
  ON emails(user_id, date DESC)
  WHERE reviewed_at IS NULL
    AND is_archived = false
    AND signal_strength IN ('high', 'medium');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Update action_type constraint for new concrete types
-- ─────────────────────────────────────────────────────────────────────────────
-- Adding: pay, submit, register, book
-- These distinguish real, verb-oriented tasks from passive review items.

-- Drop old constraint if it exists (safe to run multiple times)
ALTER TABLE actions DROP CONSTRAINT IF EXISTS actions_action_type_check;

-- Add updated constraint with new action types
ALTER TABLE actions ADD CONSTRAINT actions_action_type_check CHECK (
  action_type IS NULL OR action_type IN (
    'respond', 'review', 'create', 'schedule', 'decide',
    'pay', 'submit', 'register', 'book',
    'follow_up', 'none'
  )
);
