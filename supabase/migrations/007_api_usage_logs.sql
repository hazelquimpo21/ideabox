-- Ensure pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- IdeaBox Migration 007: API Usage Logs Table (corrected, idempotent)
-- =============================================================================

-- Create table if not exists
CREATE TABLE IF NOT EXISTS api_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which user's operation (nullable for system-level calls)
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- API details
  service TEXT NOT NULL CHECK (service IN ('openai', 'gmail')),
  endpoint TEXT,
  model TEXT,

  -- Token usage (for OpenAI calls)
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  tokens_total INTEGER DEFAULT 0,

  CHECK (tokens_total >= 0 AND tokens_input >= 0 AND tokens_output >= 0),

  -- Cost estimate in USD (6 decimal places for precision)
  estimated_cost NUMERIC(10,6),

  -- Context
  email_id UUID REFERENCES emails(id) ON DELETE SET NULL,
  analyzer_name TEXT,

  -- Performance
  duration_ms INTEGER,

  -- Result
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,

  -- Timestamp (no updated_at since logs are immutable)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for queries
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_user_id ON api_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_created_at ON api_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_service ON api_usage_logs(service, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_cost_date ON api_usage_logs(user_id, created_at, estimated_cost);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_cleanup_created_at ON api_usage_logs(created_at);

-- Enable Row Level Security
ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;

-- Idempotent policy creation: SELECT policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON p.polrelid = c.oid
    WHERE c.relname = 'api_usage_logs' AND p.polname = 'users_select_own_api_usage'
  ) THEN
    CREATE POLICY "users_select_own_api_usage"
      ON api_usage_logs FOR SELECT
      TO authenticated
      USING ((select auth.uid()) IS NOT NULL AND (select auth.uid()) = user_id);
  END IF;
END
$$;

-- Idempotent policy creation: INSERT policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON p.polrelid = c.oid
    WHERE c.relname = 'api_usage_logs' AND p.polname = 'users_insert_own_api_usage'
  ) THEN
    CREATE POLICY "users_insert_own_api_usage"
      ON api_usage_logs FOR INSERT
      TO authenticated
      WITH CHECK ((select auth.uid()) = user_id OR user_id IS NULL);
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- Helper Functions for Cost Queries
-- -----------------------------------------------------------------------------

-- Get daily API cost for a user
CREATE OR REPLACE FUNCTION get_daily_api_cost(
  p_user_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS NUMERIC(10,6)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN COALESCE(
    (SELECT SUM(estimated_cost)::NUMERIC(10,6)
     FROM api_usage_logs
     WHERE user_id = p_user_id
       AND created_at >= p_date::timestamptz
       AND created_at < (p_date + INTERVAL '1 day')::timestamptz),
    0::NUMERIC(10,6)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION get_daily_api_cost(uuid, date) FROM anon, authenticated;

-- Get monthly API cost for a user
CREATE OR REPLACE FUNCTION get_monthly_api_cost(
  p_user_id UUID,
  p_month DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE)::DATE
)
RETURNS NUMERIC(10,6)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN COALESCE(
    (SELECT SUM(estimated_cost)::NUMERIC(10,6)
     FROM api_usage_logs
     WHERE user_id = p_user_id
       AND created_at >= p_month::timestamptz
       AND created_at < (p_month + INTERVAL '1 month')::timestamptz),
    0::NUMERIC(10,6)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION get_monthly_api_cost(uuid, date) FROM anon, authenticated;
