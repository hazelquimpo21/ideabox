-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 037 — Email Type & AI Brief Columns
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Adds two new columns to the emails table:
--
-- 1. email_type TEXT — The nature of the communication, orthogonal to category.
--    Category answers "what life area?" (finance, clients, family).
--    Email type answers "what kind of email?" (personal, promo, newsletter, etc.)
--    Values: personal, transactional, newsletter, notification, promo,
--            cold_outreach, needs_response, fyi, automated
--
-- 2. ai_brief TEXT — A dense, structured summary for a future AI to read
--    when batch-summarizing emails. Not styled for humans.
--    Format: "IMPORTANCE | From WHO (relationship) | What about | Action | Context"
--
-- Both columns are populated by the categorizer analyzer at zero extra API cost.
--
-- Safe to run multiple times (idempotent).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Step 1: Add email_type column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emails' AND column_name = 'email_type'
  ) THEN
    ALTER TABLE emails ADD COLUMN email_type TEXT;
  END IF;
END $$;

-- Step 2: Add ai_brief column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emails' AND column_name = 'ai_brief'
  ) THEN
    ALTER TABLE emails ADD COLUMN ai_brief TEXT;
  END IF;
END $$;

-- Step 3: Add CHECK constraint for email_type
ALTER TABLE emails DROP CONSTRAINT IF EXISTS emails_email_type_check;
ALTER TABLE emails ADD CONSTRAINT emails_email_type_check CHECK (
  email_type IS NULL OR email_type IN (
    'personal', 'transactional', 'newsletter', 'notification',
    'promo', 'cold_outreach', 'needs_response', 'fyi', 'automated'
  )
);

-- Step 4: Create index on email_type for fast filtering
CREATE INDEX IF NOT EXISTS idx_emails_email_type ON emails (email_type)
  WHERE email_type IS NOT NULL;

COMMIT;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'emails' AND column_name IN ('email_type', 'ai_brief')
ORDER BY column_name;
