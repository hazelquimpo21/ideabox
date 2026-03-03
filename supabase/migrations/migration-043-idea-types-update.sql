-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 043: Update Idea Types for Solopreneur Focus
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- PURPOSE:
-- Update the email_ideas.idea_type CHECK constraint to include new idea types
-- added in the Mar 2026 Idea Spark refinement:
--   - tweet_draft (replaces social_post)
--   - learning (replaces hobby)
--   - tool_to_try (new)
--   - place_to_visit (new)
--
-- Old types (social_post, hobby, shopping) are kept in the constraint for
-- backward compatibility with existing saved ideas. The analyzer now maps
-- them to new types, but the DB should accept both.
--
-- CONTEXT:
-- The Idea Spark analyzer was refined to:
-- - Generate 0-3 ideas (was always 3) — skip emails that don't warrant ideas
-- - Add solopreneur-oriented types (learning, tools, places)
-- - Skip automated, transactional, notification, and low-signal emails
--
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop the old constraint
ALTER TABLE email_ideas DROP CONSTRAINT IF EXISTS email_ideas_idea_type_check;

-- Add updated constraint with new + legacy types
ALTER TABLE email_ideas ADD CONSTRAINT email_ideas_idea_type_check CHECK (idea_type IN (
  -- New types (Mar 2026)
  'tweet_draft', 'networking', 'business', 'content_creation',
  'learning', 'tool_to_try', 'place_to_visit',
  'date_night', 'family_activity', 'personal_growth', 'community',
  -- Legacy types (kept for backward compat with existing data)
  'social_post', 'hobby', 'shopping'
));

COMMENT ON COLUMN email_ideas.idea_type IS
  'Idea category. New types (Mar 2026): tweet_draft, learning, tool_to_try, place_to_visit. Legacy types still accepted: social_post (→tweet_draft), hobby (→learning), shopping (→personal_growth).';
