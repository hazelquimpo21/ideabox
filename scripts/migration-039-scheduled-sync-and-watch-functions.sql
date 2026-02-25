-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 039: Scheduled Sync Infrastructure & Watch Management
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Creates database objects needed for:
-- 1. Automated email sync via pg_cron (accounts_needing_sync VIEW)
-- 2. Gmail push notification watch management (RPC functions)
-- 3. Background backfill after initial sync (backfill_completed_at column)
-- 4. Cleanup of old sync/push logs
--
-- Dependencies:
--   - gmail_accounts table (migration 003)
--   - scheduled_sync_runs table (migration 015)
--   - gmail_push_logs table (migration 015)
--
-- Run with: psql or Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add backfill tracking column to gmail_accounts
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE gmail_accounts
  ADD COLUMN IF NOT EXISTS backfill_completed_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN gmail_accounts.backfill_completed_at IS
  'Timestamp when post-initial-sync background backfill completed (20 days / 1K emails)';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. accounts_needing_sync VIEW
--    Used by sync-emails Edge Function to find accounts due for sync.
--    Returns accounts with sync_enabled=true sorted by staleness.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW accounts_needing_sync AS
SELECT
  ga.id AS account_id,
  ga.user_id,
  ga.email,
  COALESCE(
    EXTRACT(EPOCH FROM (NOW() - ga.last_sync_at)) / 60,
    999999
  ) AS minutes_since_sync,
  -- Flag accounts that completed initial sync but haven't had background backfill
  CASE
    WHEN ga.backfill_completed_at IS NULL
     AND up.initial_sync_completed_at IS NOT NULL
    THEN true
    ELSE false
  END AS needs_backfill
FROM gmail_accounts ga
JOIN user_profiles up ON up.id = ga.user_id
WHERE ga.sync_enabled = true
ORDER BY ga.last_sync_at ASC NULLS FIRST;

COMMENT ON VIEW accounts_needing_sync IS
  'Accounts eligible for scheduled sync, sorted by staleness. Used by sync-emails Edge Function.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Watch management RPC functions
-- ─────────────────────────────────────────────────────────────────────────────

-- 3a. update_gmail_watch — Called by watch-service.ts after creating a watch
CREATE OR REPLACE FUNCTION update_gmail_watch(
  p_account_id uuid,
  p_history_id text,
  p_expiration timestamptz,
  p_resource_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE gmail_accounts
  SET
    watch_history_id = p_history_id,
    watch_expiration = p_expiration,
    watch_resource_id = p_resource_id,
    push_enabled = true,
    updated_at = NOW()
  WHERE id = p_account_id;
END;
$$;

-- 3b. clear_gmail_watch — Called when stopping a watch or on disconnect
CREATE OR REPLACE FUNCTION clear_gmail_watch(
  p_account_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE gmail_accounts
  SET
    watch_history_id = NULL,
    watch_expiration = NULL,
    watch_resource_id = NULL,
    push_enabled = false,
    watch_renewal_failures = 0,
    watch_last_error = NULL,
    watch_alert_sent_at = NULL,
    updated_at = NOW()
  WHERE id = p_account_id;
END;
$$;

-- 3c. get_expiring_watches — Find watches expiring within N hours
CREATE OR REPLACE FUNCTION get_expiring_watches(
  p_hours_ahead integer DEFAULT 24
)
RETURNS TABLE(
  account_id uuid,
  user_id uuid,
  email text,
  hours_until_expiry double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ga.id AS account_id,
    ga.user_id,
    ga.email,
    EXTRACT(EPOCH FROM (ga.watch_expiration - NOW())) / 3600 AS hours_until_expiry
  FROM gmail_accounts ga
  WHERE ga.sync_enabled = true
    AND ga.push_enabled = true
    AND ga.watch_expiration IS NOT NULL
    AND ga.watch_expiration < NOW() + (p_hours_ahead || ' hours')::interval
    AND ga.watch_expiration > NOW() -- Not already expired
  ORDER BY ga.watch_expiration ASC;
END;
$$;

-- 3d. get_accounts_needing_watch — Accounts with push_enabled but no active watch
CREATE OR REPLACE FUNCTION get_accounts_needing_watch()
RETURNS TABLE(
  account_id uuid,
  user_id uuid,
  email text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ga.id AS account_id,
    ga.user_id,
    ga.email
  FROM gmail_accounts ga
  WHERE ga.sync_enabled = true
    AND ga.push_enabled = true
    AND (ga.watch_expiration IS NULL OR ga.watch_expiration < NOW());
END;
$$;

-- 3e. record_watch_failure — Increment failure count and store error
CREATE OR REPLACE FUNCTION record_watch_failure(
  p_account_id uuid,
  p_error_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE gmail_accounts
  SET
    watch_renewal_failures = COALESCE(watch_renewal_failures, 0) + 1,
    watch_last_error = p_error_message,
    updated_at = NOW()
  WHERE id = p_account_id;
END;
$$;

-- 3f. reset_watch_failures — Clear failure count after successful renewal
CREATE OR REPLACE FUNCTION reset_watch_failures(
  p_account_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE gmail_accounts
  SET
    watch_renewal_failures = 0,
    watch_last_error = NULL,
    updated_at = NOW()
  WHERE id = p_account_id;
END;
$$;

-- 3g. get_accounts_with_watch_problems — Find accounts with repeated failures
CREATE OR REPLACE FUNCTION get_accounts_with_watch_problems(
  p_min_failures integer DEFAULT 3
)
RETURNS TABLE(
  account_id uuid,
  user_id uuid,
  email text,
  failure_count integer,
  last_error text,
  alert_sent_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ga.id AS account_id,
    ga.user_id,
    ga.email,
    ga.watch_renewal_failures AS failure_count,
    ga.watch_last_error AS last_error,
    ga.watch_alert_sent_at AS alert_sent_at
  FROM gmail_accounts ga
  WHERE ga.sync_enabled = true
    AND ga.push_enabled = true
    AND ga.watch_renewal_failures >= p_min_failures;
END;
$$;

-- 3h. mark_watch_alert_sent — Track when we notified about watch problems
CREATE OR REPLACE FUNCTION mark_watch_alert_sent(
  p_account_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE gmail_accounts
  SET
    watch_alert_sent_at = NOW(),
    updated_at = NOW()
  WHERE id = p_account_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. History management RPCs (used by webhook handler)
-- ─────────────────────────────────────────────────────────────────────────────

-- 4a. mark_history_stale — Flag account for full sync when history ID expires
CREATE OR REPLACE FUNCTION mark_history_stale(
  p_account_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE gmail_accounts
  SET
    needs_full_sync = true,
    updated_at = NOW()
  WHERE id = p_account_id;
END;
$$;

-- 4b. validate_history_id — Record successful history ID validation
CREATE OR REPLACE FUNCTION validate_history_id(
  p_account_id uuid,
  p_history_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE gmail_accounts
  SET
    last_history_id = p_history_id,
    history_id_validated_at = NOW(),
    needs_full_sync = false,
    updated_at = NOW()
  WHERE id = p_account_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Cleanup functions
-- ─────────────────────────────────────────────────────────────────────────────

-- 5a. cleanup_old_sync_runs — Prune old scheduled_sync_runs rows
CREATE OR REPLACE FUNCTION cleanup_old_sync_runs(
  p_days_to_keep integer DEFAULT 30
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM scheduled_sync_runs
  WHERE started_at < NOW() - (p_days_to_keep || ' days')::interval;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- 5b. cleanup_old_push_logs — Prune old gmail_push_logs rows
CREATE OR REPLACE FUNCTION cleanup_old_push_logs(
  p_days_to_keep integer DEFAULT 14
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM gmail_push_logs
  WHERE created_at < NOW() - (p_days_to_keep || ' days')::interval;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Mark backfill complete helper
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION mark_backfill_complete(
  p_account_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE gmail_accounts
  SET
    backfill_completed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_account_id;
END;
$$;

COMMIT;
