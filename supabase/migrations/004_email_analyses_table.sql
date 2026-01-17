-- =============================================================================
-- IdeaBox Migration 004: Email Analyses Table
-- =============================================================================
-- Stores AI analyzer outputs for each email.
--
-- WHY SEPARATE TABLE?
--   - Keeps emails table lean (analyses can be large JSON blobs)
--   - Allows re-running analysis without modifying email record
--   - Each analyzer's output is a separate JSONB column for flexibility
--   - Supports versioning of analyzer outputs
-- =============================================================================

CREATE TABLE email_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to email (one analysis per email)
  email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Analyzer outputs (JSONB for schema flexibility)
  --
  -- Each analyzer writes its structured output here.
  -- JSONB allows us to evolve the schema without migrations.

  -- Categorizer output: {category, confidence, reasoning, topics}
  categorization JSONB,

  -- Action extractor output: {has_action, action_type, title, description, urgency_score, deadline}
  action_extraction JSONB,

  -- Client tagger output: {client_match, client_name, confidence, project_name, new_client_suggestion}
  client_tagging JSONB,

  -- Phase 2 analyzers (columns ready for future use)
  event_detection JSONB,      -- {event_name, date, time, location, rsvp_required}
  url_extraction JSONB,       -- [{url, type, relevance_score}]
  content_opportunity JSONB,  -- {tweet_idea, networking_value, talking_points}

  -- Versioning
  -- Allows tracking which version of analyzers produced this output
  analyzer_version TEXT DEFAULT '1.0',

  -- Cost tracking
  -- tokens_used: Total tokens across all analyzers
  -- processing_time_ms: How long analysis took
  tokens_used INTEGER,
  processing_time_ms INTEGER,

  -- Timestamp (no updated_at since analyses are immutable after creation)
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- One analysis per email
  UNIQUE(email_id)
);

-- Indexes
CREATE INDEX idx_email_analyses_email_id ON email_analyses(email_id);
CREATE INDEX idx_email_analyses_user_id ON email_analyses(user_id);

-- GIN index for querying JSONB content
CREATE INDEX idx_email_analyses_categorization ON email_analyses USING GIN(categorization);

-- Enable Row Level Security
ALTER TABLE email_analyses ENABLE ROW LEVEL SECURITY;

-- Users can view their own analyses
CREATE POLICY "Users can view own analyses"
  ON email_analyses FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert analyses (background jobs)
-- Note: This is handled by using service role key which bypasses RLS
CREATE POLICY "Users can insert own analyses"
  ON email_analyses FOR INSERT
  WITH CHECK (auth.uid() = user_id);
