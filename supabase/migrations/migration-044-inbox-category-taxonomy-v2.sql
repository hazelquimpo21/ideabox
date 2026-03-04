-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 044 — Inbox Category Taxonomy v2
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- A comprehensive overhaul of IdeaBox's email classification system:
--
-- 1. CATEGORIES: Expand from 13 → 20 life-bucket categories
--    - Renamed: personal_friends_family → personal
--    - Split: news_politics → news + politics
--    - Merged: newsletters_creator + newsletters_industry → newsletters
--    - New: job_search, parenting, health, billing, deals, civic, sports
--
-- 2. TIMELINESS: New JSONB column capturing email's relationship to time
--    - nature: ephemeral | today | upcoming | asap | reference | evergreen
--    - relevant_date: when the thing itself happens
--    - late_after: consequence threshold (soft deadline)
--    - expires: hard cutoff (no action possible after)
--    - perishable: boolean — worthless after its moment?
--
-- 3. SCORING: Five new computed score columns (0.0–1.0 scale)
--    - importance_score: how much does this matter to your life?
--    - action_score: do you need to DO something?
--    - cognitive_load: how much mental energy does this demand?
--    - missability_score: what's the cost of NOT seeing this?
--    - surface_priority: composite score for inbox ranking
--    (urgency_score already exists, redefined to 0.0–1.0 scale)
--
-- 4. EMAIL TYPE: Simplified from 9 → 6 values
--    - Kept: needs_response, personal, newsletter, automated
--    - Merged: transactional+notification → automated, promo → marketing
--    - New: fyi, marketing
--
-- Safe to run multiple times (idempotent).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 1: Migrate category values to new taxonomy
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop the old CHECK constraint so we can write new category values
ALTER TABLE emails DROP CONSTRAINT IF EXISTS emails_category_check;

-- Rename: personal_friends_family → personal
UPDATE emails SET category = 'personal' WHERE category = 'personal_friends_family';

-- Split: news_politics → news (default — politics requires re-analysis)
UPDATE emails SET category = 'news' WHERE category = 'news_politics';

-- Merge: newsletters_creator + newsletters_industry → newsletters
UPDATE emails SET category = 'newsletters' WHERE category IN ('newsletters_creator', 'newsletters_industry');

-- Also update additional_categories arrays
UPDATE emails
SET additional_categories = array_replace(additional_categories, 'personal_friends_family', 'personal')
WHERE 'personal_friends_family' = ANY(additional_categories);

UPDATE emails
SET additional_categories = array_replace(additional_categories, 'news_politics', 'news')
WHERE 'news_politics' = ANY(additional_categories);

UPDATE emails
SET additional_categories = array_replace(additional_categories, 'newsletters_creator', 'newsletters')
WHERE 'newsletters_creator' = ANY(additional_categories);

UPDATE emails
SET additional_categories = array_replace(additional_categories, 'newsletters_industry', 'newsletters')
WHERE 'newsletters_industry' = ANY(additional_categories);

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 2: Add new CHECK constraint with all 20 categories
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE emails ADD CONSTRAINT emails_category_check CHECK (
  category IS NULL OR category IN (
    'clients',           -- Direct client work, billable relationships
    'work',              -- Professional non-client
    'job_search',        -- Applications, recruiters, interviews, offers
    'personal',          -- Friends, social relationships, adult hobbies/clubs
    'family',            -- Family relationships
    'parenting',         -- Kids: school, childcare, pediatrician, extracurriculars, tutors
    'health',            -- Medical, dental, prescriptions, insurance EOBs, vet
    'finance',           -- Banking, investments, tax, financial planning
    'billing',           -- Receipts, subscriptions, autopay, bills, payment failures
    'travel',            -- Flights, hotels, bookings, trip planning
    'shopping',          -- Orders, shipping, returns, tracking
    'deals',             -- Sales, discounts, coupons, limited-time offers
    'local',             -- Community, neighborhood, local businesses/events
    'civic',             -- Government, council, school board, HOA, voting
    'sports',            -- Fan sports: scores, fantasy leagues, team updates
    'news',              -- News outlets, current events, breaking news
    'politics',          -- Political news, campaigns, policy
    'newsletters',       -- Substacks, digests, curated content
    'product_updates',   -- SaaS tools, release notes, changelogs
    'notifications'      -- Verification codes, OTPs, 2FA, login alerts
  )
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 3: Add timeliness JSONB column
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Structure:
-- {
--   "nature": "ephemeral"|"today"|"upcoming"|"asap"|"reference"|"evergreen",
--   "relevant_date": "2026-03-20",    -- ISO date, nullable
--   "late_after": "2026-03-18",       -- ISO date, nullable
--   "expires": "2026-03-15",          -- ISO date, nullable
--   "perishable": true|false
-- }

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emails' AND column_name = 'timeliness'
  ) THEN
    ALTER TABLE emails ADD COLUMN timeliness JSONB;
    RAISE NOTICE 'Added timeliness JSONB column to emails table';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 4: Add scoring columns
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- All scores are REAL (0.0–1.0 scale).
-- These are denormalized from the scoring engine for fast list queries.

DO $$
BEGIN
  -- importance_score: How much does this email matter to the user's life?
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emails' AND column_name = 'importance_score'
  ) THEN
    ALTER TABLE emails ADD COLUMN importance_score REAL;
    RAISE NOTICE 'Added importance_score column';
  END IF;

  -- action_score: Does the user need to DO something?
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emails' AND column_name = 'action_score'
  ) THEN
    ALTER TABLE emails ADD COLUMN action_score REAL;
    RAISE NOTICE 'Added action_score column';
  END IF;

  -- cognitive_load: How much mental energy does this email demand?
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emails' AND column_name = 'cognitive_load'
  ) THEN
    ALTER TABLE emails ADD COLUMN cognitive_load REAL;
    RAISE NOTICE 'Added cognitive_load column';
  END IF;

  -- missability_score: What's the cost of NOT seeing this email?
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emails' AND column_name = 'missability_score'
  ) THEN
    ALTER TABLE emails ADD COLUMN missability_score REAL;
    RAISE NOTICE 'Added missability_score column';
  END IF;

  -- surface_priority: Composite score for inbox ranking (the "master" score)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emails' AND column_name = 'surface_priority'
  ) THEN
    ALTER TABLE emails ADD COLUMN surface_priority REAL;
    RAISE NOTICE 'Added surface_priority column';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 5: Update email_type CHECK constraint
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Simplified from 9 → 6 values. Old values are mapped:
--   transactional → automated
--   notification  → automated
--   promo         → marketing
--   cold_outreach → marketing

-- Migrate old email_type values first
UPDATE emails SET email_type = 'automated' WHERE email_type = 'transactional';
UPDATE emails SET email_type = 'automated' WHERE email_type = 'notification';
UPDATE emails SET email_type = 'marketing' WHERE email_type = 'promo';
UPDATE emails SET email_type = 'marketing' WHERE email_type = 'cold_outreach';

-- Drop and recreate the constraint
ALTER TABLE emails DROP CONSTRAINT IF EXISTS emails_email_type_check;
ALTER TABLE emails ADD CONSTRAINT emails_email_type_check CHECK (
  email_type IS NULL OR email_type IN (
    'needs_response',  -- Someone is waiting for a reply
    'personal',        -- Direct human-to-human correspondence
    'newsletter',      -- Content/digest delivery
    'automated',       -- Machine-generated (receipts, alerts, 2FA, notifications)
    'marketing',       -- Promotional, sales, deals, cold outreach
    'fyi'              -- Informational — worth knowing but no action needed
  )
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 6: Create indexes for fast queries
-- ═══════════════════════════════════════════════════════════════════════════════

-- Surface priority index: for sorting inbox by importance
CREATE INDEX IF NOT EXISTS idx_emails_surface_priority
  ON emails (surface_priority DESC NULLS LAST)
  WHERE surface_priority IS NOT NULL;

-- Timeliness nature index: for smart views (today, upcoming, etc.)
CREATE INDEX IF NOT EXISTS idx_emails_timeliness_nature
  ON emails (((timeliness->>'nature')))
  WHERE timeliness IS NOT NULL;

-- Timeliness relevant_date index: for calendar/upcoming views
CREATE INDEX IF NOT EXISTS idx_emails_timeliness_relevant_date
  ON emails (((timeliness->>'relevant_date')))
  WHERE timeliness IS NOT NULL AND timeliness->>'relevant_date' IS NOT NULL;

-- Timeliness expires index: for auto-archive cron job
CREATE INDEX IF NOT EXISTS idx_emails_timeliness_expires
  ON emails (((timeliness->>'expires')))
  WHERE timeliness IS NOT NULL AND timeliness->>'expires' IS NOT NULL;

-- GIN index on timeliness for flexible JSONB queries
CREATE INDEX IF NOT EXISTS idx_emails_timeliness_gin
  ON emails USING GIN (timeliness)
  WHERE timeliness IS NOT NULL;

-- Composite index for smart "today" view
CREATE INDEX IF NOT EXISTS idx_emails_user_surface_priority
  ON emails (user_id, surface_priority DESC NULLS LAST)
  WHERE is_archived = false AND surface_priority IS NOT NULL;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════════════

-- Verify category migration
SELECT category, COUNT(*) as count
FROM emails
WHERE category IS NOT NULL
GROUP BY category
ORDER BY count DESC;

-- Verify new columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'emails'
  AND column_name IN ('timeliness', 'importance_score', 'action_score',
                       'cognitive_load', 'missability_score', 'surface_priority')
ORDER BY column_name;

-- Verify email_type migration
SELECT email_type, COUNT(*) as count
FROM emails
WHERE email_type IS NOT NULL
GROUP BY email_type
ORDER BY count DESC;
