-- =============================================================================
-- IdeaBox Migration 017: Add Analysis Display Fields to Emails Table
-- =============================================================================
-- Adds summary, quick_action, and labels columns to the emails table for fast
-- display without joining to email_analyses.
--
-- This denormalization improves performance for list views while keeping the
-- full analysis data in email_analyses for detailed views.
--
-- See: docs/AI_ANALYZER_SYSTEM.md for field descriptions
-- =============================================================================

-- Add summary column (one-sentence assistant-style summary)
-- Example: "Sarah from Acme Corp wants you to review the Q1 proposal by Friday"
ALTER TABLE emails ADD COLUMN IF NOT EXISTS summary TEXT;

-- Add quick_action column (suggested triage action)
-- Values: respond, review, archive, save, calendar, unsubscribe, follow_up, none
ALTER TABLE emails ADD COLUMN IF NOT EXISTS quick_action TEXT CHECK (
  quick_action IS NULL OR quick_action IN (
    'respond',
    'review',
    'archive',
    'save',
    'calendar',
    'unsubscribe',
    'follow_up',
    'none'
  )
);

-- Add labels column (secondary classification labels)
-- Examples: ['needs_reply', 'urgent', 'from_vip', 'has_deadline']
ALTER TABLE emails ADD COLUMN IF NOT EXISTS labels TEXT[];

-- Create index on quick_action for filtering by suggested action
CREATE INDEX IF NOT EXISTS idx_emails_quick_action ON emails(user_id, quick_action)
  WHERE quick_action IS NOT NULL;

-- Create GIN index on labels for array containment queries
CREATE INDEX IF NOT EXISTS idx_emails_labels ON emails USING GIN(labels)
  WHERE labels IS NOT NULL;

-- Add comment explaining the denormalization
COMMENT ON COLUMN emails.summary IS 'One-sentence assistant-style summary from AI analysis. Denormalized from email_analyses.categorization.summary for fast list queries.';
COMMENT ON COLUMN emails.quick_action IS 'Suggested triage action from AI analysis. Denormalized from email_analyses.categorization.quick_action for fast list queries.';
COMMENT ON COLUMN emails.labels IS 'Secondary classification labels from AI analysis. Denormalized from email_analyses.categorization.labels for fast filtering.';
