-- Create table
CREATE TABLE sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_account_id UUID REFERENCES gmail_accounts(id) ON DELETE CASCADE,

  sync_type TEXT NOT NULL CHECK (sync_type IN ('full', 'incremental')),

  emails_fetched INTEGER DEFAULT 0,
  emails_analyzed INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,

  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')) DEFAULT 'started',

  error_message TEXT,

  duration_ms INTEGER,

  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_sync_logs_user_id ON sync_logs(user_id);
CREATE INDEX idx_sync_logs_gmail_account_id ON sync_logs(gmail_account_id);
CREATE INDEX idx_sync_logs_started_at ON sync_logs(started_at DESC);

-- For cleanup, use a normal index; partial time-based predicate is invalid
CREATE INDEX idx_sync_logs_started_at_cleanup ON sync_logs(started_at);

-- Enable Row Level Security
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own sync logs"
  ON sync_logs FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

-- Allow authenticated users to insert only for themselves (keep if clients insert)
CREATE POLICY "Users can insert own sync logs"
  ON sync_logs FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Optional: allow users to update their own logs (e.g., to set completed_at/status)
CREATE POLICY "Users can update own sync logs"
  ON sync_logs FOR UPDATE
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Optional: allow users to delete their own logs (if desired)
CREATE POLICY "Users can delete own sync logs"
  ON sync_logs FOR DELETE
  USING ((SELECT auth.uid()) = user_id);