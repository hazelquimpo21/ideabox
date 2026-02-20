-- Migration 032: Add signal_strength and reply_worthiness columns to emails table
-- Part of the Email Taxonomy Refinement (Feb 2026)
--
-- These fields are denormalized from the categorizer analysis to enable fast
-- filtering and Hub priority scoring without joining to email_analyses.
--
-- signal_strength: How important is this email? (high/medium/low/noise)
-- reply_worthiness: Should the user reply? (must_reply/should_reply/optional_reply/no_reply)

-- Add signal_strength column
ALTER TABLE emails
ADD COLUMN IF NOT EXISTS signal_strength text DEFAULT NULL;

-- Add reply_worthiness column
ALTER TABLE emails
ADD COLUMN IF NOT EXISTS reply_worthiness text DEFAULT NULL;

-- Add index on signal_strength for filtering noise in list views
CREATE INDEX IF NOT EXISTS idx_emails_signal_strength
ON emails (user_id, signal_strength)
WHERE signal_strength IS NOT NULL;

-- Add composite index for Hub priority queries that filter by signal strength
CREATE INDEX IF NOT EXISTS idx_emails_hub_signal
ON emails (user_id, is_archived, signal_strength, date DESC)
WHERE is_archived = false AND signal_strength IS NOT NULL;

-- Comment the columns
COMMENT ON COLUMN emails.signal_strength IS 'AI-assessed relevance: high (direct correspondence), medium (useful info), low (background noise), noise (auto-archive candidate). Denormalized from categorizer analysis.';
COMMENT ON COLUMN emails.reply_worthiness IS 'AI-assessed reply need: must_reply (someone waiting), should_reply (networking opportunity), optional_reply (could if interested), no_reply (broadcast/automated). Denormalized from categorizer analysis.';
