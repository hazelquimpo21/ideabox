-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 034: Insight Extraction & News Brief Analyzers
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- NEW (Feb 2026): Two new Phase 2 analyzers that fill the gap between
-- ContentDigest ("what does the email say") and IdeaSpark ("what should I do"):
--
-- 1. InsightExtractor: Synthesizes interesting ideas, tips, frameworks from
--    email content → "what's worth knowing"
-- 2. NewsBrief: Extracts factual news items from email content →
--    "what happened in the world"
--
-- These analyzers run conditionally on newsletter/substantive content types,
-- saving tokens on personal/transactional emails.
--
-- SCHEMA CHANGES:
-- 1. Add insight_extraction JSONB column to email_analyses
-- 2. Add news_brief JSONB column to email_analyses
-- 3. Create saved_insights table (user-promoted insights, like email_ideas)
-- 4. Create saved_news table (user-promoted news items)
-- 5. Add indexes for efficient querying
--
-- ESTIMATED COST IMPACT:
-- InsightExtractor: ~$0.24/month (40 emails/day × $0.0002)
-- NewsBrief:        ~$0.11/month (25 emails/day × $0.00015)
-- Total:            ~$0.35/month additional
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add insight_extraction JSONB column to email_analyses
-- ─────────────────────────────────────────────────────────────────────────────
-- Stores the full insight extraction result:
-- {
--   "has_insights": boolean,
--   "insights": [
--     {
--       "insight": "string",
--       "type": "tip|framework|observation|counterintuitive|trend",
--       "topics": ["string"],
--       "confidence": number
--     }
--   ],
--   "confidence": number
-- }

ALTER TABLE email_analyses
ADD COLUMN IF NOT EXISTS insight_extraction JSONB;

COMMENT ON COLUMN email_analyses.insight_extraction IS
  'Synthesized insights from email content (tips, frameworks, observations). Phase 2 conditional — only for newsletter/substantive content. Feb 2026.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add news_brief JSONB column to email_analyses
-- ─────────────────────────────────────────────────────────────────────────────
-- Stores the full news brief result:
-- {
--   "has_news": boolean,
--   "news_items": [
--     {
--       "headline": "string",
--       "detail": "string",
--       "topics": ["string"],
--       "date_mentioned": "YYYY-MM-DD" (optional),
--       "confidence": number
--     }
--   ],
--   "confidence": number
-- }

ALTER TABLE email_analyses
ADD COLUMN IF NOT EXISTS news_brief JSONB;

COMMENT ON COLUMN email_analyses.news_brief IS
  'Factual news items extracted from email content (announcements, launches, changes). Phase 2 conditional — only for news/digest content. Feb 2026.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Create saved_insights table
-- ─────────────────────────────────────────────────────────────────────────────
-- When a user saves/stars an insight, it's promoted from the transient
-- email_analyses.insight_extraction to this persistent table.
-- Mirrors the email_ideas pattern (IdeaSpark → email_ideas).

CREATE TABLE IF NOT EXISTS saved_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_id UUID REFERENCES emails(id) ON DELETE SET NULL,

  -- Insight content
  insight TEXT NOT NULL,
  insight_type TEXT NOT NULL CHECK (insight_type IN ('tip', 'framework', 'observation', 'counterintuitive', 'trend')),
  topics TEXT[] DEFAULT '{}',

  -- User interaction state
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'saved', 'dismissed', 'archived')),

  -- AI metadata
  confidence DECIMAL(3,2),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE saved_insights IS
  'User-promoted insights from InsightExtractor. Insights are transient in email_analyses; saved here when user explicitly saves them. Feb 2026.';

-- Index for querying user's saved insights by status
CREATE INDEX IF NOT EXISTS idx_saved_insights_user_status
  ON saved_insights(user_id, status);

-- Index for finding insights by source email
CREATE INDEX IF NOT EXISTS idx_saved_insights_email
  ON saved_insights(email_id)
  WHERE email_id IS NOT NULL;

-- RLS: Users can only manage their own insights
ALTER TABLE saved_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY saved_insights_user_policy ON saved_insights
  FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Create saved_news table
-- ─────────────────────────────────────────────────────────────────────────────
-- When a user saves/stars a news item, it's promoted from the transient
-- email_analyses.news_brief to this persistent table.

CREATE TABLE IF NOT EXISTS saved_news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_id UUID REFERENCES emails(id) ON DELETE SET NULL,

  -- News content
  headline TEXT NOT NULL,
  detail TEXT,
  topics TEXT[] DEFAULT '{}',
  date_mentioned DATE,

  -- User interaction state
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'saved', 'dismissed', 'archived')),

  -- AI metadata
  confidence DECIMAL(3,2),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE saved_news IS
  'User-promoted news items from NewsBrief. News items are transient in email_analyses; saved here when user explicitly saves them. Feb 2026.';

-- Index for querying user's saved news by status
CREATE INDEX IF NOT EXISTS idx_saved_news_user_status
  ON saved_news(user_id, status);

-- Index for finding news by source email
CREATE INDEX IF NOT EXISTS idx_saved_news_email
  ON saved_news(email_id)
  WHERE email_id IS NOT NULL;

-- Index for date-based news queries (timeline view)
CREATE INDEX IF NOT EXISTS idx_saved_news_date
  ON saved_news(user_id, date_mentioned DESC)
  WHERE date_mentioned IS NOT NULL;

-- RLS: Users can only manage their own news
ALTER TABLE saved_news ENABLE ROW LEVEL SECURITY;

CREATE POLICY saved_news_user_policy ON saved_news
  FOR ALL USING (auth.uid() = user_id);
