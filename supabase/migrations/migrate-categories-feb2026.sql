-- ═══════════════════════════════════════════════════════════════════════════════
-- Category Migration — February 2026
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Renames/merges email categories in the emails table:
--   client_pipeline          → clients
--   business_work_general    → work
--   family_kids_school       → family
--   family_health_appointments → family
--   newsletters_general      → newsletters_creator
--
-- Also updates the CHECK constraint to enforce the new 12 valid categories.
--
-- Run this against your Supabase database via the SQL editor or psql.
-- Safe to run multiple times (idempotent — only updates rows with old values).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Step 1: Drop the old CHECK constraint so we can write new category values
ALTER TABLE emails DROP CONSTRAINT IF EXISTS emails_category_check;

-- Step 2: Rename/merge old category values
UPDATE emails SET category = 'clients' WHERE category = 'client_pipeline';
UPDATE emails SET category = 'work' WHERE category = 'business_work_general';
UPDATE emails SET category = 'family' WHERE category = 'family_kids_school';
UPDATE emails SET category = 'family' WHERE category = 'family_health_appointments';
UPDATE emails SET category = 'newsletters_creator' WHERE category = 'newsletters_general';

-- Step 3: Map any legacy categories that may still exist
UPDATE emails SET category = 'clients' WHERE category = 'action_required';
UPDATE emails SET category = 'local' WHERE category = 'event';
UPDATE emails SET category = 'newsletters_creator' WHERE category = 'newsletter';
UPDATE emails SET category = 'shopping' WHERE category IN ('promo', 'promotional');
UPDATE emails SET category = 'finance' WHERE category = 'admin';
UPDATE emails SET category = 'personal_friends_family' WHERE category = 'personal';
UPDATE emails SET category = 'product_updates' WHERE category = 'noise';
UPDATE emails SET category = 'product_updates' WHERE category = 'other';

-- Step 4: Re-add CHECK constraint with the 12 valid categories (no 'other')
-- Category can be NULL temporarily during re-analysis, but must be valid when set
ALTER TABLE emails ADD CONSTRAINT emails_category_check CHECK (
  category IS NULL OR category IN (
    'clients', 'work', 'personal_friends_family', 'family',
    'finance', 'travel', 'shopping', 'local',
    'newsletters_creator', 'newsletters_industry',
    'news_politics', 'product_updates'
  )
);

COMMIT;

-- Verify the migration
SELECT category, COUNT(*) as count
FROM emails
WHERE category IN (
  'clients', 'work', 'family', 'newsletters_creator', 'newsletters_industry',
  'personal_friends_family', 'finance', 'travel', 'shopping', 'local',
  'news_politics', 'product_updates'
)
GROUP BY category
ORDER BY count DESC;
