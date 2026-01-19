-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 014: Scheduled Sync Infrastructure (Fixed: removed invalid partial index)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- This migration adds infrastructure for automatic background email sync:
-- 1. Table to track scheduled sync runs for monitoring
-- 2. Cleanup function for old sync run records
-- 3. RLS policies for admin access
--
-- The actual scheduling is done via:
-- - Supabase Edge Function (sync-emails)
-- - pg_cron (configured separately after migration)
--
-- Note: removed partial index that used NOW() in predicate because Postgres
-- requires functions in index predicates to be IMMUTABLE.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- SCHEDULED SYNC RUNS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════
-- Tracks each execution of the scheduled sync job for monitoring and debugging.

CREATE TABLE IF NOT EXISTS scheduled_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Summary Statistics
  accounts_processed INTEGER DEFAULT 0,
  accounts_succeeded INTEGER DEFAULT 0,
  accounts_failed INTEGER DEFAULT 0,
  accounts_skipped INTEGER DEFAULT 0,
  emails_fetched INTEGER DEFAULT 0,
  emails_created INTEGER DEFAULT 0,
  emails_analyzed INTEGER DEFAULT 0,

  -- Status
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'partial')),

  -- Details (for debugging)
  results JSONB DEFAULT '[]'::jsonb,
  error TEXT,
  trigger_source TEXT DEFAULT 'cron'
);

COMMENT ON TABLE scheduled_sync_runs IS
  'Tracks each execution of the background email sync job for monitoring and debugging';

-- ═══════════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ╚══════════════════════════════════════════════════════════════════════════════

-- Primary index for recent runs (dashboard view)
CREATE INDEX IF NOT EXISTS idx_scheduled_sync_runs_started_at
  ON scheduled_sync_runs(started_at DESC);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_scheduled_sync_runs_status
  ON scheduled_sync_runs(status, started_at DESC);

-- NOTE: removed the invalid partial index that used NOW() in the WHERE predicate.
-- The following index was removed to avoid "functions in index predicate must be IMMUTABLE":
--   CREATE INDEX idx_scheduled_sync_runs_cleanup
--     ON scheduled_sync_runs(started_at)
--     WHERE started_at < NOW() - INTERVAL '7 days';
-- If you want a cleanup-targeted index, consider the alternatives:
-- - maintain a boolean column and index that column, or
-- - recreate a partial index periodically using a fixed timestamp cutoff.

-- ═══════════════════════════════════════════════════════════════════════════════
-- SYNC ELIGIBILITY VIEW
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW accounts_needing_sync AS
SELECT
  ga.id AS account_id,
  ga.user_id,
  ga.email,
  ga.display_name,
  ga.last_sync_at,
  ga.sync_enabled,
  EXTRACT(EPOCH FROM (NOW() - COALESCE(ga.last_sync_at, '1970-01-01'::timestamptz))) / 60
    AS minutes_since_sync,
  COALESCE(ga.last_sync_at, '1970-01-01'::timestamptz) < NOW() - INTERVAL '15 minutes'
    AS sync_overdue
FROM gmail_accounts ga
WHERE ga.sync_enabled = TRUE
ORDER BY ga.last_sync_at ASC NULLS FIRST;

COMMENT ON VIEW accounts_needing_sync IS
  'Helper view showing Gmail accounts that need syncing, ordered by most stale first';

-- ═══════════════════════════════════════════════════════════════════════════════
-- CLEANUP FUNCTION
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION cleanup_old_sync_runs(
  p_retention_days INTEGER DEFAULT 7
)
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM scheduled_sync_runs
  WHERE started_at < NOW() - (p_retention_days || ' days')::INTERVAL;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RAISE LOG 'cleanup_old_sync_runs: Deleted % records older than % days',
    v_deleted_count, p_retention_days;

  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cleanup_old_sync_runs IS
  'Removes scheduled_sync_runs records older than retention period (default 7 days)';

-- ═══════════════════════════════════════════════════════════════════════════════
-- GET SYNC STATISTICS FUNCTION
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_sync_statistics(
  p_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
  total_runs INTEGER,
  successful_runs INTEGER,
  failed_runs INTEGER,
  partial_runs INTEGER,
  total_accounts_processed INTEGER,
  total_emails_created INTEGER,
  avg_duration_ms NUMERIC,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH stats AS (
    SELECT
      COUNT(*)::INTEGER AS total_runs,
      COUNT(*) FILTER (WHERE status = 'completed')::INTEGER AS successful_runs,
      COUNT(*) FILTER (WHERE status = 'failed')::INTEGER AS failed_runs,
      COUNT(*) FILTER (WHERE status = 'partial')::INTEGER AS partial_runs,
      COALESCE(SUM(accounts_processed), 0)::INTEGER AS total_accounts_processed,
      COALESCE(SUM(emails_created), 0)::INTEGER AS total_emails_created,
      COALESCE(AVG(duration_ms), 0) AS avg_duration_ms
    FROM scheduled_sync_runs
    WHERE started_at >= NOW() - (p_hours || ' hours')::INTERVAL
  ),
  last_run AS (
    SELECT
      started_at,
      status
    FROM scheduled_sync_runs
    ORDER BY started_at DESC
    LIMIT 1
  )
  SELECT
    stats.total_runs,
    stats.successful_runs,
    stats.failed_runs,
    stats.partial_runs,
    stats.total_accounts_processed,
    stats.total_emails_created,
    stats.avg_duration_ms,
    last_run.started_at AS last_run_at,
    last_run.status AS last_run_status
  FROM stats
  LEFT JOIN last_run ON TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_sync_statistics IS
  'Returns sync statistics for monitoring dashboard over specified hours (default 24)';

-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS POLICIES (Admin only - no user access needed)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Note: scheduled_sync_runs is only accessed by the service role from Edge Functions.
-- No RLS policies needed as service role bypasses RLS.

-- ═══════════════════════════════════════════════════════════════════════════════
-- PG_CRON SETUP INSTRUCTIONS
-- ═══════════════════════════════════════════════════════════════════════════════
-- After running this migration, set up pg_cron in Supabase Dashboard > SQL Editor:
-- (see original migration comments for steps)