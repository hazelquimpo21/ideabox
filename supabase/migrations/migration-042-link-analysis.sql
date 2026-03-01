-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 042: Link Analysis — Deep URL Intelligence from Email Content
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- PURPOSE:
-- 1. Populate the existing url_extraction JSONB column on email_analyses with
--    AI-enriched link analysis (priority, topic, save-worthiness)
-- 2. Create saved_links table for user-promoted links (mirrors email_ideas pattern)
--
-- CONTEXT:
-- ContentDigest already extracts raw links (url, type, title, description,
-- isMainContent) during Phase 1. This migration supports a new Phase 2
-- LinkAnalyzer that ENRICHES those extracted links with:
--   - Priority scoring (must_read, worth_reading, reference, skip)
--   - Topic tagging for filtering/grouping
--   - Save-worthiness assessment
--   - Expiration detection (deals, registrations, limited-time offers)
--
-- The url_extraction column already exists in the schema (marked "Future")
-- so we reuse it rather than adding a new column.
--
-- DATA FLOW:
-- Phase 1: ContentDigest extracts raw links → content_digest.links[]
-- Phase 2: LinkAnalyzer enriches links → url_extraction JSONB (this migration)
-- User:    Saves a link → saved_links table (this migration)
--
-- SCHEMA CHANGES:
-- 1. Comment update on email_analyses.url_extraction (already exists as JSONB)
-- 2. Create saved_links table for user-promoted links
-- 3. Indexes for efficient querying
-- 4. RLS policies for user isolation
--
-- COST IMPACT:
-- LinkAnalyzer: ~$0.0002/email × ~60 emails/day (has_link filter) = ~$0.36/month
--
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Update comment on existing url_extraction column
-- ─────────────────────────────────────────────────────────────────────────────
-- The url_extraction JSONB column already exists on email_analyses but was
-- previously marked "Future". We now populate it with enriched link data.
--
-- Structure:
-- {
--   "has_links": boolean,
--   "links": [
--     {
--       "url": "string",
--       "type": "article|registration|document|video|product|tool|social|unsubscribe|other",
--       "title": "string",
--       "description": "string",
--       "is_main_content": boolean,
--       "priority": "must_read|worth_reading|reference|skip",
--       "topics": ["string"],
--       "save_worthy": boolean,
--       "expires": "YYYY-MM-DD" (optional — for deals, registrations, limited offers),
--       "confidence": number (0-1)
--     }
--   ],
--   "summary": "string (1-sentence overview of the links landscape)",
--   "confidence": number (0-1)
-- }

COMMENT ON COLUMN email_analyses.url_extraction IS
  'AI-enriched link analysis from email content. Extends ContentDigest raw links with priority (must_read, worth_reading, reference, skip), topic tags, save-worthiness, and expiration detection. Phase 2 conditional — only for emails with has_link label. Feb 2026.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Create saved_links table for user-promoted links
-- ─────────────────────────────────────────────────────────────────────────────
-- When a user saves/bookmarks a link from the analyzed URLs, it's promoted
-- from the transient email_analyses.url_extraction to this persistent table.
-- Mirrors the email_ideas pattern (IdeaSpark → email_ideas).

CREATE TABLE IF NOT EXISTS saved_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_id UUID REFERENCES emails(id) ON DELETE SET NULL,

  -- Link content
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  link_type TEXT NOT NULL CHECK (link_type IN (
    'article', 'registration', 'document', 'video',
    'product', 'tool', 'social', 'unsubscribe', 'other'
  )),
  priority TEXT NOT NULL DEFAULT 'reference' CHECK (priority IN (
    'must_read', 'worth_reading', 'reference', 'skip'
  )),
  topics TEXT[] DEFAULT '{}',

  -- User interaction state
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'saved', 'read', 'archived', 'dismissed')),

  -- Temporal metadata
  expires_at DATE,

  -- AI metadata
  confidence DECIMAL(3,2),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE saved_links IS
  'User-promoted links from the LinkAnalyzer. Links are transient in email_analyses.url_extraction; saved here when user explicitly bookmarks them. Supports priority filtering, topic tagging, and expiration tracking. Feb 2026.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Indexes for efficient querying
-- ─────────────────────────────────────────────────────────────────────────────

-- Primary query: "Show me my saved links that aren't dismissed"
CREATE INDEX IF NOT EXISTS idx_saved_links_user_status
  ON saved_links(user_id, status)
  WHERE status != 'dismissed';

-- Find links by source email
CREATE INDEX IF NOT EXISTS idx_saved_links_email
  ON saved_links(email_id)
  WHERE email_id IS NOT NULL;

-- Filter by priority (e.g., "show me must_read links")
CREATE INDEX IF NOT EXISTS idx_saved_links_user_priority
  ON saved_links(user_id, priority)
  WHERE status NOT IN ('dismissed', 'archived');

-- Expiring links query (e.g., "links expiring within 7 days")
CREATE INDEX IF NOT EXISTS idx_saved_links_expires
  ON saved_links(user_id, expires_at)
  WHERE expires_at IS NOT NULL AND status NOT IN ('dismissed', 'archived');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS policies — users can only manage their own links
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE saved_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY saved_links_select ON saved_links
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY saved_links_insert ON saved_links
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY saved_links_update ON saved_links
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY saved_links_delete ON saved_links
  FOR DELETE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Updated_at trigger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TRIGGER set_saved_links_updated_at
  BEFORE UPDATE ON saved_links
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
