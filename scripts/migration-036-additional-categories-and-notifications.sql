-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 036 — Additional Categories Column & Notifications Category
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 1. Adds additional_categories TEXT[] column to emails table
--    (for multi-bucket filtering — an email can appear in multiple inbox views)
--
-- 2. Updates the category CHECK constraint to include 'notifications'
--    (verification codes, OTPs, login alerts, password resets, system alerts)
--
-- Safe to run multiple times (idempotent).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Step 1: Add additional_categories column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emails' AND column_name = 'additional_categories'
  ) THEN
    ALTER TABLE emails ADD COLUMN additional_categories TEXT[];
  END IF;
END $$;

-- Step 2: Drop the old CHECK constraint
ALTER TABLE emails DROP CONSTRAINT IF EXISTS emails_category_check;

-- Step 3: Re-add CHECK constraint with 13 valid categories (now includes 'notifications')
ALTER TABLE emails ADD CONSTRAINT emails_category_check CHECK (
  category IS NULL OR category IN (
    'clients', 'work', 'personal_friends_family', 'family',
    'finance', 'travel', 'shopping', 'local',
    'newsletters_creator', 'newsletters_industry',
    'news_politics', 'product_updates',
    'notifications'
  )
);

COMMIT;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'emails' AND column_name = 'additional_categories';
