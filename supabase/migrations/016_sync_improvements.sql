-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 016: Email Sync Improvements
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- This migration adds:
-- 1. Sync lock column to prevent concurrent syncs on same account
-- 2. History ID expiration tracking for full sync fallback
-- 3. Watch renewal failure tracking for alerting
-- 4. Sync trigger for post-onboarding skip
--
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. SYNC LOCK COLUMN
-- ═══════════════════════════════════════════════════════════════════════════════
-- Prevents concurrent syncs on the same account by using a lock timestamp.
-- If sync_lock_until > NOW(), another sync is in progress.

ALTER TABLE public.gmail_accounts
  ADD COLUMN IF NOT EXISTS sync_lock_until TIMESTAMPTZ;

COMMENT ON COLUMN public.gmail_accounts.sync_lock_until IS
  'Lock timestamp to prevent concurrent syncs. If sync_lock_until > NOW(), sync is locked.';

-- Index for finding locked accounts
CREATE INDEX IF NOT EXISTS idx_gmail_accounts_sync_lock
  ON public.gmail_accounts(sync_lock_until)
  WHERE sync_lock_until IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. HISTORY ID EXPIRATION TRACKING
-- ═══════════════════════════════════════════════════════════════════════════════
-- Track when history ID was last validated to detect stale IDs (>30 days old).

ALTER TABLE public.gmail_accounts
  ADD COLUMN IF NOT EXISTS history_id_validated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.gmail_accounts.history_id_validated_at IS
  'When the history ID was last successfully used. If >30 days, need full sync.';

ALTER TABLE public.gmail_accounts
  ADD COLUMN IF NOT EXISTS needs_full_sync BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.gmail_accounts.needs_full_sync IS
  'Flag indicating history ID is stale and full sync is required.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. WATCH RENEWAL FAILURE TRACKING
-- ═══════════════════════════════════════════════════════════════════════════════
-- Track consecutive watch renewal failures for alerting.

ALTER TABLE public.gmail_accounts
  ADD COLUMN IF NOT EXISTS watch_renewal_failures INTEGER DEFAULT 0;

COMMENT ON COLUMN public.gmail_accounts.watch_renewal_failures IS
  'Count of consecutive watch renewal failures. Reset on success.';

ALTER TABLE public.gmail_accounts
  ADD COLUMN IF NOT EXISTS watch_last_error TEXT;

COMMENT ON COLUMN public.gmail_accounts.watch_last_error IS
  'Last watch renewal error message for debugging.';

ALTER TABLE public.gmail_accounts
  ADD COLUMN IF NOT EXISTS watch_alert_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.gmail_accounts.watch_alert_sent_at IS
  'When we last alerted the user about watch failures.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. PENDING SYNC FLAG FOR SKIPPED ONBOARDING
-- ═══════════════════════════════════════════════════════════════════════════════
-- Track if user skipped initial sync to trigger background sync later.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS initial_sync_pending BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.user_profiles.initial_sync_pending IS
  'True if user skipped onboarding sync. Background job should pick this up.';

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS initial_sync_triggered_at TIMESTAMPTZ;

COMMENT ON COLUMN public.user_profiles.initial_sync_triggered_at IS
  'When the background initial sync was triggered (if skipped during onboarding).';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. SYNC LOCK FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Acquire sync lock (returns true if lock acquired, false if already locked)
CREATE OR REPLACE FUNCTION public.acquire_sync_lock(
  p_account_id UUID,
  p_lock_duration_seconds INTEGER DEFAULT 300  -- 5 minutes default
)
RETURNS BOOLEAN AS $$
DECLARE
  v_locked BOOLEAN;
BEGIN
  -- Try to acquire lock only if not currently locked
  UPDATE public.gmail_accounts
  SET sync_lock_until = NOW() + (p_lock_duration_seconds || ' seconds')::INTERVAL
  WHERE id = p_account_id
    AND (sync_lock_until IS NULL OR sync_lock_until < NOW())
  RETURNING TRUE INTO v_locked;

  RETURN COALESCE(v_locked, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.acquire_sync_lock IS
  'Attempts to acquire a sync lock for an account. Returns true if successful.';

-- Release sync lock
CREATE OR REPLACE FUNCTION public.release_sync_lock(
  p_account_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.gmail_accounts
  SET sync_lock_until = NULL
  WHERE id = p_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.release_sync_lock IS
  'Releases the sync lock for an account.';

-- Check if account is locked
CREATE OR REPLACE FUNCTION public.is_sync_locked(
  p_account_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_lock_until TIMESTAMPTZ;
BEGIN
  SELECT sync_lock_until INTO v_lock_until
  FROM public.gmail_accounts
  WHERE id = p_account_id;

  RETURN v_lock_until IS NOT NULL AND v_lock_until > NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.is_sync_locked IS
  'Checks if an account is currently locked for syncing.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. HISTORY ID EXPIRATION FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Mark history ID as stale (triggers full sync on next run)
CREATE OR REPLACE FUNCTION public.mark_history_stale(
  p_account_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.gmail_accounts
  SET
    needs_full_sync = TRUE,
    last_history_id = NULL,  -- Clear stale history ID
    updated_at = NOW()
  WHERE id = p_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.mark_history_stale IS
  'Marks an account as needing full sync due to stale history ID.';

-- Validate history ID (call after successful incremental sync)
CREATE OR REPLACE FUNCTION public.validate_history_id(
  p_account_id UUID,
  p_history_id TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.gmail_accounts
  SET
    last_history_id = p_history_id,
    history_id_validated_at = NOW(),
    needs_full_sync = FALSE,
    updated_at = NOW()
  WHERE id = p_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.validate_history_id IS
  'Marks history ID as validated after successful incremental sync.';

-- Get accounts with stale history (>30 days without validation)
CREATE OR REPLACE FUNCTION public.get_accounts_with_stale_history()
RETURNS TABLE (
  account_id UUID,
  user_id UUID,
  email TEXT,
  days_since_validation INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ga.id AS account_id,
    ga.user_id,
    ga.email,
    EXTRACT(DAY FROM (NOW() - COALESCE(ga.history_id_validated_at, ga.created_at)))::INTEGER AS days_since_validation
  FROM public.gmail_accounts ga
  WHERE ga.sync_enabled = TRUE
    AND ga.last_history_id IS NOT NULL
    AND (
      ga.history_id_validated_at IS NULL
      OR ga.history_id_validated_at < NOW() - INTERVAL '30 days'
    )
  ORDER BY ga.history_id_validated_at ASC NULLS FIRST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_accounts_with_stale_history IS
  'Returns accounts that may have stale history IDs (not validated in 30+ days).';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. WATCH RENEWAL FAILURE FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Record watch renewal failure
CREATE OR REPLACE FUNCTION public.record_watch_failure(
  p_account_id UUID,
  p_error_message TEXT
)
RETURNS INTEGER AS $$
DECLARE
  v_failure_count INTEGER;
BEGIN
  UPDATE public.gmail_accounts
  SET
    watch_renewal_failures = watch_renewal_failures + 1,
    watch_last_error = p_error_message,
    updated_at = NOW()
  WHERE id = p_account_id
  RETURNING watch_renewal_failures INTO v_failure_count;

  RETURN COALESCE(v_failure_count, 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.record_watch_failure IS
  'Records a watch renewal failure and returns the new failure count.';

-- Reset watch failure count (call after successful renewal)
CREATE OR REPLACE FUNCTION public.reset_watch_failures(
  p_account_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.gmail_accounts
  SET
    watch_renewal_failures = 0,
    watch_last_error = NULL,
    updated_at = NOW()
  WHERE id = p_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.reset_watch_failures IS
  'Resets watch failure count after successful renewal.';

-- Get accounts with watch problems (for alerting)
CREATE OR REPLACE FUNCTION public.get_accounts_with_watch_problems(
  p_min_failures INTEGER DEFAULT 3
)
RETURNS TABLE (
  account_id UUID,
  user_id UUID,
  email TEXT,
  failure_count INTEGER,
  last_error TEXT,
  alert_sent_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ga.id AS account_id,
    ga.user_id,
    ga.email,
    ga.watch_renewal_failures AS failure_count,
    ga.watch_last_error AS last_error,
    ga.watch_alert_sent_at
  FROM public.gmail_accounts ga
  WHERE ga.sync_enabled = TRUE
    AND ga.push_enabled = TRUE
    AND ga.watch_renewal_failures >= p_min_failures
  ORDER BY ga.watch_renewal_failures DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_accounts_with_watch_problems IS
  'Returns accounts with multiple watch renewal failures for alerting.';

-- Mark alert as sent
CREATE OR REPLACE FUNCTION public.mark_watch_alert_sent(
  p_account_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.gmail_accounts
  SET watch_alert_sent_at = NOW()
  WHERE id = p_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.mark_watch_alert_sent IS
  'Marks that a watch failure alert was sent to the user.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. PENDING SYNC FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Get users with pending initial sync
CREATE OR REPLACE FUNCTION public.get_users_with_pending_sync()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    up.id AS user_id,
    ga.email,
    up.created_at
  FROM public.user_profiles up
  JOIN public.gmail_accounts ga ON ga.user_id = up.id
  WHERE up.initial_sync_pending = TRUE
    AND up.initial_sync_triggered_at IS NULL
    AND ga.sync_enabled = TRUE
  ORDER BY up.created_at ASC
  LIMIT 10;  -- Process 10 at a time
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_users_with_pending_sync IS
  'Returns users who skipped onboarding and need background sync.';

-- Mark pending sync as triggered
CREATE OR REPLACE FUNCTION public.mark_pending_sync_triggered(
  p_user_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.user_profiles
  SET
    initial_sync_triggered_at = NOW(),
    updated_at = NOW()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.mark_pending_sync_triggered IS
  'Marks that a pending background sync has been triggered for a user.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. VIEW FOR ACCOUNT HEALTH MONITORING
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.gmail_accounts_health AS
SELECT
  ga.id,
  ga.email,
  ga.user_id,
  ga.sync_enabled,
  ga.push_enabled,
  ga.last_sync_at,
  ga.last_push_at,
  ga.watch_expiration,
  ga.watch_renewal_failures,
  ga.needs_full_sync,
  ga.sync_lock_until,
  CASE
    WHEN ga.sync_lock_until > NOW() THEN 'locked'
    WHEN ga.needs_full_sync THEN 'needs_full_sync'
    WHEN ga.watch_renewal_failures >= 3 THEN 'watch_failing'
    WHEN ga.watch_expiration IS NULL THEN 'no_watch'
    WHEN ga.watch_expiration < NOW() THEN 'watch_expired'
    WHEN ga.watch_expiration < NOW() + INTERVAL '24 hours' THEN 'watch_expiring'
    WHEN ga.last_sync_at IS NULL THEN 'never_synced'
    WHEN ga.last_sync_at < NOW() - INTERVAL '1 hour' THEN 'sync_stale'
    ELSE 'healthy'
  END AS health_status,
  EXTRACT(EPOCH FROM (NOW() - COALESCE(ga.last_sync_at, ga.created_at))) / 60 AS minutes_since_sync
FROM public.gmail_accounts ga
WHERE ga.sync_enabled = TRUE;

COMMENT ON VIEW public.gmail_accounts_health IS
  'Shows Gmail accounts with their health status for monitoring.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- END OF MIGRATION
-- ═══════════════════════════════════════════════════════════════════════════════
