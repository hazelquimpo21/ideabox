-- =============================================================================
-- IdeaBox Migration 006: Sync Logs Table
-- =============================================================================
-- Tracks email sync operations for debugging and monitoring.
--
-- RETENTION:
--   Logs older than 30 days are automatically deleted by cleanup function.
--   See migration 009 for the cleanup function.
-- =============================================================================

CREATE TABLE sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who and what was synced
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_account_id UUID REFERENCES gmail_accounts(id) ON DELETE CASCADE,

  -- Sync type
  -- full: Initial sync or forced full re-sync
  -- incremental: Normal hourly sync using history ID
  sync_type TEXT NOT NULL CHECK (sync_type IN ('full', 'incremental')),

  -- Results
  emails_fetched INTEGER DEFAULT 0,
  emails_analyzed INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,

  -- Status
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),

  -- Error details (if failed)
  error_message TEXT,

  -- Performance tracking
  duration_ms INTEGER,

  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_sync_logs_user_id ON sync_logs(user_id);
CREATE INDEX idx_sync_logs_gmail_account_id ON sync_logs(gmail_account_id);
CREATE INDEX idx_sync_logs_started_at ON sync_logs(started_at DESC);

-- Index for cleanup query (finding old logs to delete)
CREATE INDEX idx_sync_logs_cleanup ON sync_logs(started_at)
  WHERE started_at < NOW() - INTERVAL '30 days';

-- Enable Row Level Security
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Users can only view their own sync logs
CREATE POLICY "Users can view own sync logs"
  ON sync_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert logs (background jobs)
-- This works because service role key bypasses RLS
CREATE POLICY "Users can insert own sync logs"
  ON sync_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);
