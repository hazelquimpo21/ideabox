-- Migration 043: Denormalize urgency_score and relationship_signal to emails table
-- These fields exist in email_analyses JSONB but are needed for fast list-view access.
-- See: .plan.md section 1.1, docs/UI_FIELD_AUDIT.md recommendations C and D.

ALTER TABLE emails ADD COLUMN IF NOT EXISTS urgency_score INTEGER;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS relationship_signal TEXT;

-- Add check constraint for relationship_signal valid values
ALTER TABLE emails ADD CONSTRAINT emails_relationship_signal_check
  CHECK (relationship_signal IS NULL OR relationship_signal IN ('positive', 'neutral', 'negative', 'unknown'));

-- Backfill from email_analyses JSONB (action_extraction.urgencyScore and client_tagging.relationship_signal)
UPDATE emails e
SET
  urgency_score = COALESCE(
    (ea.analysis_data->'action_extraction'->>'urgencyScore')::INTEGER,
    NULL
  ),
  relationship_signal = COALESCE(
    ea.analysis_data->'client_tagging'->>'relationship_signal',
    NULL
  )
FROM email_analyses ea
WHERE ea.email_id = e.id
  AND ea.analysis_data IS NOT NULL;

-- Index for filtering high-urgency emails
CREATE INDEX IF NOT EXISTS idx_emails_urgency_score ON emails (urgency_score) WHERE urgency_score IS NOT NULL;
