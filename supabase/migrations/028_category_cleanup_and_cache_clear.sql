-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 028: Category Cleanup and Cache Clear
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- CONTEXT:
-- Migration 018 introduced new life-bucket categories and mapped old values.
-- Migration 027 backfilled categories from email_analyses.categorization.
-- However, old category values are still appearing in the UI because:
--   1. The email_analyses.categorization JSONB may contain old category values
--   2. The user_profiles.sync_progress JSONB caches discovery results with old categories
--   3. Some emails may have been missed by previous migrations
--
-- WHAT THIS MIGRATION DOES:
-- 1. Temporarily drops the category CHECK constraint
-- 2. Re-runs the category mapping on the emails table (catches any missed rows)
-- 3. Updates email_analyses.categorization JSONB to use new category values
-- 4. Clears the cached sync_progress.result so it rebuilds with correct categories
-- 5. Re-adds the CHECK constraint
--
-- LEGACY CATEGORY MAPPING:
--   action_required -> client_pipeline
--   event           -> local
--   newsletter      -> newsletters_general
--   promo           -> shopping
--   admin           -> finance
--   personal        -> personal_friends_family
--   noise           -> newsletters_general
--
-- @since Feb 2026
-- @see src/types/discovery.ts for LEGACY_CATEGORY_MAP
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 0: Drop existing CHECK constraint to allow updates
-- ═══════════════════════════════════════════════════════════════════════════════
-- This constraint may be blocking updates if old values exist

ALTER TABLE public.emails DROP CONSTRAINT IF EXISTS emails_category_check;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 1: Update emails table - catch any missed rows
-- ═══════════════════════════════════════════════════════════════════════════════

-- Track counts for logging
DO $$
DECLARE
  action_required_count INTEGER;
  event_count INTEGER;
  newsletter_count INTEGER;
  promo_count INTEGER;
  admin_count INTEGER;
  personal_count INTEGER;
  noise_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO action_required_count FROM public.emails WHERE category = 'action_required';
  SELECT COUNT(*) INTO event_count FROM public.emails WHERE category = 'event';
  SELECT COUNT(*) INTO newsletter_count FROM public.emails WHERE category = 'newsletter';
  SELECT COUNT(*) INTO promo_count FROM public.emails WHERE category = 'promo';
  SELECT COUNT(*) INTO admin_count FROM public.emails WHERE category = 'admin';
  SELECT COUNT(*) INTO personal_count FROM public.emails WHERE category = 'personal';
  SELECT COUNT(*) INTO noise_count FROM public.emails WHERE category = 'noise';

  RAISE NOTICE '=== BEFORE MIGRATION - Legacy categories found in emails table ===';
  RAISE NOTICE 'action_required: %', action_required_count;
  RAISE NOTICE 'event: %', event_count;
  RAISE NOTICE 'newsletter: %', newsletter_count;
  RAISE NOTICE 'promo: %', promo_count;
  RAISE NOTICE 'admin: %', admin_count;
  RAISE NOTICE 'personal: %', personal_count;
  RAISE NOTICE 'noise: %', noise_count;
END $$;

-- Map old categories to new (same mapping as migration 018)
UPDATE public.emails SET category = 'client_pipeline' WHERE category = 'action_required';
UPDATE public.emails SET category = 'local' WHERE category = 'event';
UPDATE public.emails SET category = 'newsletters_general' WHERE category = 'newsletter';
UPDATE public.emails SET category = 'shopping' WHERE category = 'promo';
UPDATE public.emails SET category = 'finance' WHERE category = 'admin';
UPDATE public.emails SET category = 'personal_friends_family' WHERE category = 'personal';
UPDATE public.emails SET category = 'newsletters_general' WHERE category = 'noise';

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 2: Update email_analyses.categorization JSONB
-- ═══════════════════════════════════════════════════════════════════════════════
-- The categorization column stores { "category": "old_value", ... }
-- We need to update the category value inside the JSONB

UPDATE public.email_analyses
SET categorization = jsonb_set(categorization, '{category}', '"client_pipeline"')
WHERE categorization->>'category' = 'action_required';

UPDATE public.email_analyses
SET categorization = jsonb_set(categorization, '{category}', '"local"')
WHERE categorization->>'category' = 'event';

UPDATE public.email_analyses
SET categorization = jsonb_set(categorization, '{category}', '"newsletters_general"')
WHERE categorization->>'category' = 'newsletter';

UPDATE public.email_analyses
SET categorization = jsonb_set(categorization, '{category}', '"shopping"')
WHERE categorization->>'category' = 'promo';

UPDATE public.email_analyses
SET categorization = jsonb_set(categorization, '{category}', '"finance"')
WHERE categorization->>'category' = 'admin';

UPDATE public.email_analyses
SET categorization = jsonb_set(categorization, '{category}', '"personal_friends_family"')
WHERE categorization->>'category' = 'personal';

UPDATE public.email_analyses
SET categorization = jsonb_set(categorization, '{category}', '"newsletters_general"')
WHERE categorization->>'category' = 'noise';

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 3: Clear cached sync_progress.result
-- ═══════════════════════════════════════════════════════════════════════════════
-- The sync_progress JSONB column in user_profiles caches the discovery response
-- which includes category summaries. These may contain old category values.
-- Clearing the result forces the UI to refresh with correct data.

UPDATE public.user_profiles
SET sync_progress = CASE
  WHEN sync_progress IS NULL THEN NULL
  WHEN sync_progress = '{}'::jsonb THEN '{}'::jsonb
  ELSE jsonb_set(
    sync_progress,
    '{result}',
    'null'::jsonb
  )
END
WHERE sync_progress IS NOT NULL
  AND sync_progress->'result' IS NOT NULL;

-- Also reset status to 'pending' so the UI knows to re-run sync
UPDATE public.user_profiles
SET sync_progress = jsonb_set(
  COALESCE(sync_progress, '{}'::jsonb),
  '{status}',
  '"pending"'::jsonb
)
WHERE sync_progress IS NOT NULL
  AND sync_progress->>'status' = 'completed';

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 4: Re-add CHECK constraint
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.emails
ADD CONSTRAINT emails_category_check CHECK (
  category IS NULL OR category IN (
    'newsletters_general',
    'news_politics',
    'product_updates',
    'local',
    'shopping',
    'travel',
    'finance',
    'family_kids_school',
    'family_health_appointments',
    'client_pipeline',
    'business_work_general',
    'personal_friends_family'
  )
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 5: Verification
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  old_email_count INTEGER;
  old_analysis_count INTEGER;
  cleared_profiles INTEGER;
BEGIN
  -- Check for any remaining old categories in emails
  SELECT COUNT(*) INTO old_email_count
  FROM public.emails
  WHERE category IN ('action_required', 'event', 'newsletter', 'promo', 'admin', 'personal', 'noise');

  -- Check for any remaining old categories in email_analyses
  SELECT COUNT(*) INTO old_analysis_count
  FROM public.email_analyses
  WHERE categorization->>'category' IN ('action_required', 'event', 'newsletter', 'promo', 'admin', 'personal', 'noise');

  -- Count cleared profiles
  SELECT COUNT(*) INTO cleared_profiles
  FROM public.user_profiles
  WHERE sync_progress->>'status' = 'pending';

  RAISE NOTICE '=== AFTER MIGRATION ===';
  RAISE NOTICE 'Remaining old categories in emails table: % (should be 0)', old_email_count;
  RAISE NOTICE 'Remaining old categories in email_analyses: % (should be 0)', old_analysis_count;
  RAISE NOTICE 'User profiles with cleared sync cache: %', cleared_profiles;

  IF old_email_count > 0 THEN
    RAISE WARNING 'Some emails still have old categories! Check data integrity.';
  END IF;

  IF old_analysis_count > 0 THEN
    RAISE WARNING 'Some email_analyses still have old categories! Check data integrity.';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- DOCUMENTATION
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE public.emails IS '
Email storage table with life-bucket categorization.

CATEGORY VALUES (as of Feb 2026):
- newsletters_general: Substacks, digests, curated content
- news_politics: News outlets, political updates
- product_updates: Tech products, SaaS tools you use
- local: Community events, neighborhood, local orgs
- shopping: Orders, shipping, deals, retail
- travel: Flights, hotels, bookings, trip info
- finance: Bills, banking, investments, receipts
- family_kids_school: School emails, kid activities, logistics
- family_health_appointments: Medical, appointments, family scheduling
- client_pipeline: Direct client correspondence, project work
- business_work_general: Team, industry, professional (not direct clients)
- personal_friends_family: Social, relationships, personal correspondence

MIGRATION HISTORY:
- Migration 018: Initial category refactor from action-focused to life-bucket
- Migration 027: Backfill categories from email_analyses
- Migration 028: Cleanup remaining old values and clear cached sync data
';
