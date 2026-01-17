-- =============================================================================
-- IdeaBox Migration 007: API Usage Logs Table
-- =============================================================================
-- Tracks API calls to OpenAI and Gmail for cost monitoring.
--
-- WHY TRACK THIS?
--   - Stay within $50/month budget
--   - Identify expensive operations
--   - Debug API failures
--   - Per-user cost attribution
--
-- RETENTION:
--   Logs older than 30 days are automatically deleted by cleanup function.
--   See migration 009 for the cleanup function.
-- =============================================================================

CREATE TABLE api_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which user's operation (nullable for system-level calls)
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- API details
  service TEXT NOT NULL CHECK (service IN ('openai', 'gmail')),
  endpoint TEXT,     -- e.g., 'chat.completions', 'users.messages.list'
  model TEXT,        -- e.g., 'gpt-4.1-mini'

  -- Token usage (for OpenAI calls)
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  tokens_total INTEGER DEFAULT 0,

  -- Cost estimate in USD (6 decimal places for precision)
  -- GPT-4.1-mini: $0.15/M input, $0.60/M output
  estimated_cost DECIMAL(10, 6),

  -- Context
  email_id UUID REFERENCES emails(id) ON DELETE SET NULL,
  analyzer_name TEXT,  -- 'categorizer', 'action_extractor', 'client_tagger'

  -- Performance
  duration_ms INTEGER,

  -- Result
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,

  -- Timestamp (no updated_at since logs are immutable)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for queries
CREATE INDEX idx_api_usage_logs_user_id ON api_usage_logs(user_id);
CREATE INDEX idx_api_usage_logs_created_at ON api_usage_logs(created_at DESC);
CREATE INDEX idx_api_usage_logs_service ON api_usage_logs(service, created_at DESC);

-- Index for daily/monthly cost aggregation
CREATE INDEX idx_api_usage_logs_cost_date ON api_usage_logs(user_id, created_at, estimated_cost);

-- Index for cleanup query
CREATE INDEX idx_api_usage_logs_cleanup ON api_usage_logs(created_at)
  WHERE created_at < NOW() - INTERVAL '30 days';

-- Enable Row Level Security
ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own API usage
CREATE POLICY "Users can view own API usage"
  ON api_usage_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert logs
CREATE POLICY "Users can insert own API usage"
  ON api_usage_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- -----------------------------------------------------------------------------
-- Helper Functions for Cost Queries
-- -----------------------------------------------------------------------------

-- Get daily API cost for a user
CREATE OR REPLACE FUNCTION get_daily_api_cost(
  p_user_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS DECIMAL AS $$
BEGIN
  RETURN COALESCE(
    (SELECT SUM(estimated_cost)
     FROM api_usage_logs
     WHERE user_id = p_user_id
       AND created_at >= p_date
       AND created_at < p_date + INTERVAL '1 day'),
    0
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get monthly API cost for a user
CREATE OR REPLACE FUNCTION get_monthly_api_cost(
  p_user_id UUID,
  p_month DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE)::DATE
)
RETURNS DECIMAL AS $$
BEGIN
  RETURN COALESCE(
    (SELECT SUM(estimated_cost)
     FROM api_usage_logs
     WHERE user_id = p_user_id
       AND created_at >= p_month
       AND created_at < p_month + INTERVAL '1 month'),
    0
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
