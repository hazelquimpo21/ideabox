-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Historical Email Sync for CRM Contact Data
-- Description: Adds columns to support metadata-only historical email sync
--              for populating contact communication history without AI costs.
-- Created: January 2026
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- OVERVIEW
-- ════════════════════════════════════════════════════════════════════════════════
-- This migration enables a two-tier email sync strategy:
--
-- Tier 1: Full Analysis (existing)
--   - Recent emails (30-90 days)
--   - Full AI analysis (categorization, action extraction, events)
--   - Store body_text + body_html
--   - Cost: ~$0.0004 per email
--
-- Tier 2: Metadata-Only Historical Sync (NEW)
--   - Older emails (6-36 months back)
--   - NO AI analysis - zero OpenAI cost
--   - Store only metadata needed for CRM:
--     - gmail_id, thread_id, sender_email, sender_name
--     - recipient_email, subject, date, snippet, gmail_labels
--   - Updates contact stats via upsert_contact_from_email
--   - Cost: ~$0 (Gmail API free within quotas)
--
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 1: Add sync_type column to emails table
-- ═══════════════════════════════════════════════════════════════════════════════

-- Track whether an email was fully analyzed or just metadata-synced
ALTER TABLE emails ADD COLUMN IF NOT EXISTS sync_type TEXT DEFAULT 'full';

COMMENT ON COLUMN emails.sync_type IS
  'Sync type: "full" = AI analyzed with body stored, "metadata" = historical CRM data only (no body, no AI analysis)';

-- Set existing emails as 'full' (they were all AI analyzed)
UPDATE emails SET sync_type = 'full' WHERE sync_type IS NULL;

-- Add constraint for valid values
ALTER TABLE emails ADD CONSTRAINT emails_sync_type_check
  CHECK (sync_type IN ('full', 'metadata'));

-- Index for filtering by sync type
CREATE INDEX IF NOT EXISTS idx_emails_sync_type ON emails(user_id, sync_type);

-- Compound index for contact page queries (emails by contact, filtered by sync type)
CREATE INDEX IF NOT EXISTS idx_emails_contact_sync ON emails(user_id, sender_email, sync_type, date DESC);


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 2: Add historical sync tracking to gmail_accounts
-- ═══════════════════════════════════════════════════════════════════════════════

-- Track historical sync progress per account
ALTER TABLE gmail_accounts
  ADD COLUMN IF NOT EXISTS historical_sync_status TEXT DEFAULT 'not_started';

ALTER TABLE gmail_accounts
  ADD COLUMN IF NOT EXISTS historical_sync_oldest_date TIMESTAMPTZ;

ALTER TABLE gmail_accounts
  ADD COLUMN IF NOT EXISTS historical_sync_email_count INTEGER DEFAULT 0;

ALTER TABLE gmail_accounts
  ADD COLUMN IF NOT EXISTS historical_sync_contacts_updated INTEGER DEFAULT 0;

ALTER TABLE gmail_accounts
  ADD COLUMN IF NOT EXISTS historical_sync_started_at TIMESTAMPTZ;

ALTER TABLE gmail_accounts
  ADD COLUMN IF NOT EXISTS historical_sync_completed_at TIMESTAMPTZ;

ALTER TABLE gmail_accounts
  ADD COLUMN IF NOT EXISTS historical_sync_page_token TEXT;

ALTER TABLE gmail_accounts
  ADD COLUMN IF NOT EXISTS historical_sync_error TEXT;

COMMENT ON COLUMN gmail_accounts.historical_sync_status IS
  'Historical sync status: not_started, in_progress, completed, failed';

COMMENT ON COLUMN gmail_accounts.historical_sync_oldest_date IS
  'Oldest email date found during historical sync';

COMMENT ON COLUMN gmail_accounts.historical_sync_email_count IS
  'Number of historical emails synced (metadata only)';

COMMENT ON COLUMN gmail_accounts.historical_sync_contacts_updated IS
  'Number of contacts whose stats were updated during historical sync';

COMMENT ON COLUMN gmail_accounts.historical_sync_page_token IS
  'Gmail API page token for resuming interrupted historical sync';

COMMENT ON COLUMN gmail_accounts.historical_sync_error IS
  'Error message if historical sync failed (for debugging)';

-- Add constraint for valid status values
ALTER TABLE gmail_accounts ADD CONSTRAINT gmail_accounts_historical_sync_status_check
  CHECK (historical_sync_status IN ('not_started', 'in_progress', 'completed', 'failed'));


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 3: Create helper function for bulk metadata email insert
-- ═══════════════════════════════════════════════════════════════════════════════

-- Function to insert metadata-only email and update contact in one transaction
-- Returns the email ID, or NULL if duplicate (gmail_id already exists)
CREATE OR REPLACE FUNCTION insert_metadata_email(
  p_user_id UUID,
  p_gmail_account_id UUID,
  p_gmail_id TEXT,
  p_thread_id TEXT,
  p_sender_email TEXT,
  p_sender_name TEXT,
  p_recipient_email TEXT,
  p_subject TEXT,
  p_snippet TEXT,
  p_date TIMESTAMPTZ,
  p_gmail_labels TEXT[],
  p_is_sent BOOLEAN DEFAULT FALSE
) RETURNS UUID AS $$
DECLARE
  v_email_id UUID;
  v_contact_id UUID;
BEGIN
  -- Insert email (skip if duplicate)
  INSERT INTO emails (
    user_id,
    gmail_account_id,
    gmail_id,
    thread_id,
    sender_email,
    sender_name,
    recipient_email,
    subject,
    snippet,
    date,
    gmail_labels,
    sync_type,
    is_read,
    created_at,
    updated_at
  ) VALUES (
    p_user_id,
    p_gmail_account_id,
    p_gmail_id,
    p_thread_id,
    p_sender_email,
    p_sender_name,
    p_recipient_email,
    p_subject,
    p_snippet,
    p_date,
    COALESCE(p_gmail_labels, '{}'),
    'metadata',  -- Mark as metadata-only
    TRUE,        -- Historical emails are assumed read
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, gmail_id) DO NOTHING
  RETURNING id INTO v_email_id;

  -- If email was inserted (not duplicate), update contact stats
  IF v_email_id IS NOT NULL THEN
    -- Use existing upsert function to update contact
    SELECT upsert_contact_from_email(
      p_user_id,
      p_sender_email,
      p_sender_name,
      p_date,
      p_is_sent
    ) INTO v_contact_id;
  END IF;

  RETURN v_email_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION insert_metadata_email IS
  'Insert a metadata-only email (for historical sync) and update contact stats. Returns NULL if duplicate.';


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 4: Create function to update historical sync progress
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_historical_sync_progress(
  p_account_id UUID,
  p_status TEXT,
  p_email_count INTEGER DEFAULT NULL,
  p_contacts_updated INTEGER DEFAULT NULL,
  p_oldest_date TIMESTAMPTZ DEFAULT NULL,
  p_page_token TEXT DEFAULT NULL,
  p_error TEXT DEFAULT NULL
) RETURNS void AS $$
BEGIN
  UPDATE gmail_accounts
  SET
    historical_sync_status = p_status,
    historical_sync_email_count = COALESCE(p_email_count, historical_sync_email_count),
    historical_sync_contacts_updated = COALESCE(p_contacts_updated, historical_sync_contacts_updated),
    historical_sync_oldest_date = COALESCE(p_oldest_date, historical_sync_oldest_date),
    historical_sync_page_token = p_page_token,  -- Always update (can be NULL to clear)
    historical_sync_error = p_error,
    historical_sync_started_at = CASE
      WHEN p_status = 'in_progress' AND historical_sync_started_at IS NULL
      THEN NOW()
      ELSE historical_sync_started_at
    END,
    historical_sync_completed_at = CASE
      WHEN p_status IN ('completed', 'failed')
      THEN NOW()
      ELSE historical_sync_completed_at
    END,
    updated_at = NOW()
  WHERE id = p_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_historical_sync_progress IS
  'Update historical sync progress for a Gmail account. Used by the sync service to track progress.';


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 5: Create function to get historical sync status for all user accounts
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_historical_sync_status(p_user_id UUID)
RETURNS TABLE (
  account_id UUID,
  account_email TEXT,
  status TEXT,
  email_count INTEGER,
  contacts_updated INTEGER,
  oldest_date TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  has_page_token BOOLEAN,
  error TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ga.id AS account_id,
    ga.email AS account_email,
    ga.historical_sync_status AS status,
    ga.historical_sync_email_count AS email_count,
    ga.historical_sync_contacts_updated AS contacts_updated,
    ga.historical_sync_oldest_date AS oldest_date,
    ga.historical_sync_started_at AS started_at,
    ga.historical_sync_completed_at AS completed_at,
    ga.historical_sync_page_token IS NOT NULL AS has_page_token,
    ga.historical_sync_error AS error
  FROM gmail_accounts ga
  WHERE ga.user_id = p_user_id
    AND ga.sync_enabled = TRUE
  ORDER BY ga.email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_historical_sync_status IS
  'Get historical sync status for all Gmail accounts belonging to a user.';


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 6: Create index for efficient contact history queries
-- ═══════════════════════════════════════════════════════════════════════════════

-- This index helps when loading email history for a contact
-- (common query in CRM-style contact detail view)
CREATE INDEX IF NOT EXISTS idx_emails_sender_date
  ON emails(user_id, sender_email, date DESC);

-- Index for counting emails by sync type per user
CREATE INDEX IF NOT EXISTS idx_emails_user_sync_type_count
  ON emails(user_id, sync_type);


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 7: Grant permissions
-- ═══════════════════════════════════════════════════════════════════════════════

-- Grant execute on new functions to authenticated users
GRANT EXECUTE ON FUNCTION insert_metadata_email TO authenticated;
GRANT EXECUTE ON FUNCTION update_historical_sync_progress TO authenticated;
GRANT EXECUTE ON FUNCTION get_historical_sync_status TO authenticated;
