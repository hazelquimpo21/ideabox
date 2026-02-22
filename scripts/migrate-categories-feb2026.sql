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
-- Run this against your Supabase database via the SQL editor or psql.
-- Safe to run multiple times (idempotent — only updates rows with old values).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Rename client_pipeline → clients
UPDATE emails SET category = 'clients' WHERE category = 'client_pipeline';

-- Rename business_work_general → work
UPDATE emails SET category = 'work' WHERE category = 'business_work_general';

-- Merge family_kids_school → family
UPDATE emails SET category = 'family' WHERE category = 'family_kids_school';

-- Merge family_health_appointments → family
UPDATE emails SET category = 'family' WHERE category = 'family_health_appointments';

-- Split newsletters_general → newsletters_creator (default; AI will re-sort on next analysis)
UPDATE emails SET category = 'newsletters_creator' WHERE category = 'newsletters_general';

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
