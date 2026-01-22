-- =============================================================================
-- IdeaBox Migration 025: Content Digest and Multi-Action Support
-- =============================================================================
-- Adds support for:
-- 1. Content Digest analyzer - extracts gist, key points, and links from emails
-- 2. Multi-action support - allows extracting multiple action items per email
--
-- This enables smarter email intelligence:
-- - Users see key points without reading full emails
-- - Links are extracted with context (article, registration, document, etc.)
-- - Multiple action items can be tracked from a single email
--
-- See: docs/AI_ANALYZER_SYSTEM.md for analyzer documentation
-- =============================================================================

-- =============================================================================
-- PART 1: Add content_digest column to email_analyses
-- =============================================================================
-- Stores the output from ContentDigestAnalyzer:
-- {
--   "gist": "One-two sentence briefing...",
--   "key_points": [{"point": "...", "relevance": "..."}],
--   "links": [{"url": "...", "type": "...", "title": "...", "description": "..."}],
--   "content_type": "single_topic|multi_topic_digest|curated_links|personal_update",
--   "topics_highlighted": ["AI", "TypeScript"],
--   "confidence": 0.9
-- }

ALTER TABLE email_analyses
ADD COLUMN IF NOT EXISTS content_digest JSONB;

COMMENT ON COLUMN email_analyses.content_digest IS 'Content digest extraction: gist, key points, and links. Helps users quickly understand email substance without reading it fully.';

-- =============================================================================
-- PART 2: Add key_points column to emails table (denormalized for fast display)
-- =============================================================================
-- Denormalizing key_points enables fast list views without joining to email_analyses.
-- This is the same pattern used for summary, quick_action, and labels.

ALTER TABLE emails
ADD COLUMN IF NOT EXISTS key_points TEXT[];

COMMENT ON COLUMN emails.key_points IS 'Key bullet points from AI content digest. Denormalized from email_analyses.content_digest for fast list queries.';

-- Create GIN index for array queries on key_points
CREATE INDEX IF NOT EXISTS idx_emails_key_points ON emails USING GIN(key_points)
  WHERE key_points IS NOT NULL;

-- =============================================================================
-- PART 3: Add gist column to emails table (denormalized for fast display)
-- =============================================================================
-- The gist is a 1-2 sentence "assistant briefing" about the email content.
-- Different from summary (which is action-focused), gist is content-focused.

ALTER TABLE emails
ADD COLUMN IF NOT EXISTS gist TEXT;

COMMENT ON COLUMN emails.gist IS 'One-two sentence content briefing from AI content digest. Written like an assistant telling you what the email is about.';

-- =============================================================================
-- PART 4: Update action_extraction schema in email_analyses for multi-actions
-- =============================================================================
-- The action_extraction JSONB column already exists. This migration documents
-- the schema change from single action to multiple actions:
--
-- OLD schema (still supported for backwards compatibility):
-- {
--   "has_action": true,
--   "action_type": "review",
--   "title": "Review proposal",
--   "urgency_score": 7,
--   ...
-- }
--
-- NEW schema (supports multiple actions):
-- {
--   "has_action": true,
--   "actions": [
--     {"type": "review", "title": "Review Q1 proposal", "deadline": "Friday", "priority": 1},
--     {"type": "respond", "title": "Confirm availability", "priority": 2}
--   ],
--   "primary_action_index": 0,
--   "urgency_score": 7,  -- highest urgency from all actions
--   ...
-- }
--
-- The ActionExtractor code handles both formats for backwards compatibility.
-- No schema migration needed since JSONB is schema-flexible.

-- Add comment documenting the schema evolution
COMMENT ON COLUMN email_analyses.action_extraction IS 'Action extraction results. Supports both single-action (legacy) and multi-action (Jan 2026+) formats. Multi-action format has "actions" array with individual priorities.';

-- =============================================================================
-- PART 5: Create index for content type filtering
-- =============================================================================
-- Allow efficient filtering by content_type (newsletter digest vs single topic, etc.)

CREATE INDEX IF NOT EXISTS idx_email_analyses_content_type
ON email_analyses ((content_digest->>'content_type'))
WHERE content_digest IS NOT NULL;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- Log the columns added for verification
DO $$
BEGIN
  RAISE NOTICE 'Migration 025 complete: Added content_digest column to email_analyses';
  RAISE NOTICE 'Migration 025 complete: Added key_points column to emails table';
  RAISE NOTICE 'Migration 025 complete: Added gist column to emails table';
  RAISE NOTICE 'Migration 025 complete: Documented multi-action schema for action_extraction';
END $$;
