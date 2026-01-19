-- IMPORTANT: If gen_random_uuid() is not available, enable pgcrypto:
--   CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Or replace gen_random_uuid() with uuid_generate_v4() after enabling:
--   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 015: Gmail Push Notifications Support
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- ADD WATCH STATE COLUMNS TO GMAIL_ACCOUNTS
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.gmail_accounts
  ADD COLUMN IF NOT EXISTS watch_expiration TIMESTAMPTZ;

COMMENT ON COLUMN public.gmail_accounts.watch_expiration IS
  'When the Gmail watch subscription expires. Must renew before expiration.';

ALTER TABLE public.gmail_accounts
  ADD COLUMN IF NOT EXISTS watch_history_id TEXT;

COMMENT ON COLUMN public.gmail_accounts.watch_history_id IS
  'Gmail history ID from when watch was started. Used for incremental sync on push.';

ALTER TABLE public.gmail_accounts
  ADD COLUMN IF NOT EXISTS watch_resource_id TEXT;

COMMENT ON COLUMN public.gmail_accounts.watch_resource_id IS
  'Gmail watch resource ID. Used when stopping or managing the watch.';

ALTER TABLE public.gmail_accounts
  ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN public.gmail_accounts.push_enabled IS
  'Whether to use push notifications for this account. Falls back to polling if false.';

ALTER TABLE public.gmail_accounts
  ADD COLUMN IF NOT EXISTS last_push_at TIMESTAMPTZ;

COMMENT ON COLUMN public.gmail_accounts.last_push_at IS
  'Timestamp of last push notification received for this account.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- INDEXES FOR WATCH MANAGEMENT
-- ═══════════════════════════════════════════════════════════════════════════════
-- Avoid nondeterministic expressions (like NOW()) inside partial index predicates.

CREATE INDEX IF NOT EXISTS idx_gmail_accounts_watch_expiration
  ON public.gmail_accounts(watch_expiration);

CREATE INDEX IF NOT EXISTS idx_gmail_accounts_user_watch_expiration
  ON public.gmail_accounts(user_id, watch_expiration);

CREATE INDEX IF NOT EXISTS idx_gmail_accounts_no_watch
  ON public.gmail_accounts(user_id)
  WHERE watch_expiration IS NULL
    AND sync_enabled = TRUE
    AND push_enabled = TRUE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- GMAIL PUSH NOTIFICATION LOG
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.gmail_push_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_account_id UUID REFERENCES public.gmail_accounts(id) ON DELETE CASCADE,
  email_address TEXT NOT NULL,
  history_id TEXT NOT NULL,
  pubsub_message_id TEXT,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  processing_time_ms INTEGER,
  messages_found INTEGER DEFAULT 0,
  messages_synced INTEGER DEFAULT 0,
  messages_analyzed INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processing', 'completed', 'skipped', 'failed')),
  skip_reason TEXT,
  error TEXT
);

COMMENT ON TABLE public.gmail_push_logs IS
  'Logs all Gmail push notifications received for debugging and monitoring';

-- ═══════════════════════════════════════════════════════════════════════════════
-- PUSH LOG INDEXES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_gmail_push_logs_processed_at
  ON public.gmail_push_logs(processed_at DESC);

CREATE INDEX IF NOT EXISTS idx_gmail_push_logs_account
  ON public.gmail_push_logs(gmail_account_id, processed_at DESC);

CREATE INDEX IF NOT EXISTS idx_gmail_push_logs_failures
  ON public.gmail_push_logs(status, processed_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gmail_push_logs_pubsub_id
  ON public.gmail_push_logs(pubsub_message_id)
  WHERE pubsub_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gmail_push_logs_cleanup
  ON public.gmail_push_logs(processed_at);

-- ═══════════════════════════════════════════════════════════════════════════════
-- CLEANUP FUNCTION
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cleanup_old_push_logs(
  p_retention_days INTEGER DEFAULT 3
)
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM public.gmail_push_logs
  WHERE processed_at < NOW() - (p_retention_days || ' days')::INTERVAL;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RAISE LOG 'cleanup_old_push_logs: Deleted % records older than % days',
    v_deleted_count, p_retention_days;

  RETURN COALESCE(v_deleted_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.cleanup_old_push_logs IS
  'Removes gmail_push_logs records older than retention period (default 3 days)';

-- ═══════════════════════════════════════════════════════════════════════════════
-- WATCH MANAGEMENT FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_gmail_watch(
  p_account_id UUID,
  p_history_id TEXT,
  p_expiration TIMESTAMPTZ,
  p_resource_id TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.gmail_accounts
  SET
    watch_history_id = p_history_id,
    watch_expiration = p_expiration,
    watch_resource_id = p_resource_id,
    updated_at = NOW()
  WHERE id = p_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.update_gmail_watch IS
  'Updates Gmail account with watch subscription details after successful watch creation';

CREATE OR REPLACE FUNCTION public.clear_gmail_watch(
  p_account_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.gmail_accounts
  SET
    watch_history_id = NULL,
    watch_expiration = NULL,
    watch_resource_id = NULL,
    updated_at = NOW()
  WHERE id = p_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.clear_gmail_watch IS
  'Clears Gmail watch status when watch is stopped or expires';

CREATE OR REPLACE FUNCTION public.get_expiring_watches(
  p_hours_ahead INTEGER DEFAULT 24
)
RETURNS TABLE (
  account_id UUID,
  user_id UUID,
  email TEXT,
  watch_expiration TIMESTAMPTZ,
  hours_until_expiry NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ga.id AS account_id,
    ga.user_id,
    ga.email,
    ga.watch_expiration,
    EXTRACT(EPOCH FROM (ga.watch_expiration - NOW())) / 3600 AS hours_until_expiry
  FROM public.gmail_accounts ga
  WHERE ga.sync_enabled = TRUE
    AND ga.push_enabled = TRUE
    AND ga.watch_expiration IS NOT NULL
    AND ga.watch_expiration < NOW() + (p_hours_ahead || ' hours')::INTERVAL
    AND ga.watch_expiration > NOW()
  ORDER BY ga.watch_expiration ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_expiring_watches IS
  'Returns accounts with watches expiring within specified hours (default 24) for renewal';

CREATE OR REPLACE FUNCTION public.get_accounts_needing_watch()
RETURNS TABLE (
  account_id UUID,
  user_id UUID,
  email TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ga.id AS account_id,
    ga.user_id,
    ga.email
  FROM public.gmail_accounts ga
  WHERE ga.sync_enabled = TRUE
    AND ga.push_enabled = TRUE
    AND (
      ga.watch_expiration IS NULL
      OR ga.watch_expiration < NOW()
    )
  ORDER BY ga.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_accounts_needing_watch IS
  'Returns accounts that need Gmail watch setup (no watch or expired)';

-- ═══════════════════════════════════════════════════════════════════════════════
-- PUSH STATISTICS FUNCTION
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_push_statistics(
  p_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
  total_notifications INTEGER,
  completed INTEGER,
  failed INTEGER,
  skipped INTEGER,
  total_messages_synced INTEGER,
  total_messages_analyzed INTEGER,
  avg_processing_time_ms NUMERIC,
  accounts_with_push INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH stats AS (
    SELECT
      COUNT(*)::INTEGER AS total_notifications,
      COUNT(*) FILTER (WHERE status = 'completed')::INTEGER AS completed,
      COUNT(*) FILTER (WHERE status = 'failed')::INTEGER AS failed,
      COUNT(*) FILTER (WHERE status = 'skipped')::INTEGER AS skipped,
      COALESCE(SUM(messages_synced), 0)::INTEGER AS total_messages_synced,
      COALESCE(SUM(messages_analyzed), 0)::INTEGER AS total_messages_analyzed,
      COALESCE(AVG(processing_time_ms), 0) AS avg_processing_time_ms
    FROM public.gmail_push_logs
    WHERE processed_at >= NOW() - (p_hours || ' hours')::INTERVAL
  ),
  account_stats AS (
    SELECT COUNT(*)::INTEGER AS accounts_with_push
    FROM public.gmail_accounts
    WHERE push_enabled = TRUE
      AND watch_expiration IS NOT NULL
      AND watch_expiration > NOW()
  )
  SELECT
    stats.total_notifications,
    stats.completed,
    stats.failed,
    stats.skipped,
    stats.total_messages_synced,
    stats.total_messages_analyzed,
    stats.avg_processing_time_ms,
    account_stats.accounts_with_push
  FROM stats, account_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_push_statistics IS
  'Returns push notification statistics for monitoring over specified hours (default 24)';

-- ═══════════════════════════════════════════════════════════════════════════════
-- VIEWS FOR MONITORING
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.gmail_accounts_watch_status AS
SELECT
  ga.id,
  ga.email,
  ga.user_id,
  ga.sync_enabled,
  ga.push_enabled,
  ga.watch_expiration,
  ga.last_push_at,
  ga.last_sync_at,
  CASE
    WHEN ga.watch_expiration IS NULL THEN 'no_watch'
    WHEN ga.watch_expiration < NOW() THEN 'expired'
    WHEN ga.watch_expiration < NOW() + INTERVAL '24 hours' THEN 'expiring_soon'
    ELSE 'active'
  END AS watch_status,
  EXTRACT(EPOCH FROM (ga.watch_expiration - NOW())) / 3600 AS hours_until_expiry
FROM public.gmail_accounts ga
WHERE ga.sync_enabled = TRUE;

COMMENT ON VIEW public.gmail_accounts_watch_status IS
  'Shows Gmail accounts with their push notification watch status';

-- ═══════════════════════════════════════════════════════════════════════════════
-- PG_CRON SETUP INSTRUCTIONS (manual steps)
-- ═══════════════════════════════════════════════════════════════════════════════
-- 1) Schedule watch renewal check (every 6 hours), example using net.http_post via cron:
-- SELECT cron.schedule(
--   'renew-gmail-watches',
--   '0 */6 * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/renew-watches',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret'),
--       'Content-Type', 'application/json'
--     ),
--     body := '{}'
--   );
--   $$
-- );
--
-- 2) Schedule push log cleanup (daily at 4am UTC):
-- SELECT cron.schedule(
--   'cleanup-push-logs',
--   '0 4 * * *',
--   'SELECT public.cleanup_old_push_logs(3)'
-- );

-- End of migration