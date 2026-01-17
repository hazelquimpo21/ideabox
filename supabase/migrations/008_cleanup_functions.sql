-- =============================================================================
-- IdeaBox Migration 008: Cleanup Functions
-- =============================================================================
-- Functions for log retention and maintenance.
--
-- SETUP REQUIRED:
--   1. Enable pg_cron extension in Supabase Dashboard
--      (Database > Extensions > Search for "pg_cron" > Enable)
--
--   2. After enabling pg_cron, run the cron.schedule() command at the bottom
--      to set up automatic daily cleanup at 3am.
--
-- RETENTION POLICY:
--   - sync_logs: 30 days
--   - api_usage_logs: 30 days
-- =============================================================================

-- -----------------------------------------------------------------------------
-- cleanup_old_logs: Deletes logs older than 30 days
-- -----------------------------------------------------------------------------
-- Called daily by pg_cron to prevent unbounded table growth.
-- Logs are sufficient for debugging recent issues; older logs provide
-- diminishing value.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS void AS $$
DECLARE
  sync_deleted INTEGER;
  api_deleted INTEGER;
BEGIN
  -- Delete old sync logs
  WITH deleted AS (
    DELETE FROM sync_logs
    WHERE started_at < NOW() - INTERVAL '30 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO sync_deleted FROM deleted;

  -- Delete old API usage logs
  WITH deleted AS (
    DELETE FROM api_usage_logs
    WHERE created_at < NOW() - INTERVAL '30 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO api_deleted FROM deleted;

  -- Log the cleanup (useful for auditing)
  RAISE NOTICE 'Log cleanup completed at %: sync_logs=%, api_usage_logs=%',
    NOW(), sync_deleted, api_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- get_active_clients: Helper function to get user's active clients
-- -----------------------------------------------------------------------------
-- Used by client tagger analyzer to get list of clients for matching.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_active_clients(p_user_id UUID)
RETURNS SETOF clients AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM clients
  WHERE user_id = p_user_id AND status = 'active'
  ORDER BY priority DESC, name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- pg_cron Setup (RUN THIS MANUALLY AFTER ENABLING pg_cron EXTENSION)
-- -----------------------------------------------------------------------------
-- Uncomment and run after enabling pg_cron in Supabase Dashboard:
--
-- SELECT cron.schedule(
--   'cleanup-old-logs',           -- Job name
--   '0 3 * * *',                  -- Run daily at 3am UTC
--   'SELECT cleanup_old_logs()'   -- Function to call
-- );
--
-- To verify the job was created:
-- SELECT * FROM cron.job;
--
-- To unschedule:
-- SELECT cron.unschedule('cleanup-old-logs');
-- -----------------------------------------------------------------------------
