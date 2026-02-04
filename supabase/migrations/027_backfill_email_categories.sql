-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 027: Backfill Email Categories from Analysis
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS DOES:
-- Fixes emails that were analyzed but never had their category synced to the
-- emails table. This was a bug where AI-analyzed emails stored their category
-- only in email_analyses.categorization (JSONB) but not in emails.category.
--
-- The fix in email-processor.ts now syncs categories going forward, but this
-- migration backfills existing data.
--
-- ═══════════════════════════════════════════════════════════════════════════════

-- Step 1: Update emails that have analysis but NULL category
UPDATE public.emails e
SET category = (ea.categorization->>'category')::text
FROM public.email_analyses ea
WHERE e.id = ea.email_id
  AND e.category IS NULL
  AND ea.categorization IS NOT NULL
  AND ea.categorization->>'category' IS NOT NULL;

-- Step 2: Log how many were updated
DO $$
DECLARE
  updated_count INTEGER;
  still_null_count INTEGER;
BEGIN
  -- Count emails that now have categories
  SELECT COUNT(*) INTO updated_count
  FROM public.emails e
  JOIN public.email_analyses ea ON e.id = ea.email_id
  WHERE e.category IS NOT NULL
    AND ea.categorization IS NOT NULL;

  -- Count emails still missing categories (no analysis yet)
  SELECT COUNT(*) INTO still_null_count
  FROM public.emails
  WHERE category IS NULL;

  RAISE NOTICE 'Backfill complete: % emails now have categories synced from analysis', updated_count;
  RAISE NOTICE 'Remaining emails without category (not yet analyzed): %', still_null_count;
END $$;
