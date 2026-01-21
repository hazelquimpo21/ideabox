-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 018: Category Refactor and Event Locality
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- OVERVIEW:
-- This migration refactors email categories from action-focused to life-bucket
-- focused categories, and adds event locality support.
--
-- CHANGES:
-- 1. Update email category values from old action-focused to new life-bucket categories
-- 2. Add migration mapping for existing data
-- 3. Document new event_locality and key_date fields in event_detection JSONB
--
-- OLD CATEGORIES (action-focused):
--   action_required, event, newsletter, promo, admin, personal, noise
--
-- NEW CATEGORIES (life-bucket focused):
--   newsletters_general, news_politics, product_updates, local, shopping,
--   travel, finance, family_kids_school, family_health_appointments,
--   client_pipeline, business_work_general, personal_friends_family
--
-- CATEGORY MIGRATION MAPPING:
--   action_required -> client_pipeline (most action emails are client/work)
--   event           -> local (events will be re-categorized by life bucket)
--   newsletter      -> newsletters_general
--   promo           -> shopping
--   admin           -> finance (receipts, confirmations)
--   personal        -> personal_friends_family
--   noise           -> newsletters_general (will be re-analyzed)
--
-- EVENT DETECTION JSONB ADDITIONS:
--   event_locality: 'local' | 'out_of_town' | 'virtual' | null
--   event_end_date: ISO date string for multi-day events
--   is_key_date: boolean (for deadlines, open houses vs full events)
--   key_date_type: 'registration_deadline' | 'open_house' | 'deadline' | 'release_date' | 'other'
--
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 0: Drop the existing CHECK constraint on category
-- ═══════════════════════════════════════════════════════════════════════════════
-- The old constraint only allows: action_required, event, newsletter, promo, admin, personal, noise
-- We need to drop it before we can update to the new category values.

ALTER TABLE public.emails DROP CONSTRAINT IF EXISTS emails_category_check;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 1: Document the category mapping (no actual type change needed)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Note: The `category` column in `emails` table is TEXT, not an ENUM.
-- This means we don't need to alter the column type.
-- The application code defines the valid categories.

-- Add a comment to the category column explaining the change
COMMENT ON COLUMN public.emails.category IS '
Email life-bucket category (refactored Jan 2026).

VALID VALUES:
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

DEPRECATED (old action-focused values may still exist in legacy data):
- action_required -> now use client_pipeline or business_work_general
- event -> events are now detected via has_event label
- newsletter -> now use newsletters_general
- promo -> now use shopping
- admin -> now use finance
- personal -> now use personal_friends_family
- noise -> re-analyze to determine correct bucket
';

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 2: Update existing emails with old categories to new categories
-- ═══════════════════════════════════════════════════════════════════════════════

-- Map action_required -> client_pipeline (most action emails are work-related)
UPDATE public.emails
SET category = 'client_pipeline'
WHERE category = 'action_required';

-- Map event -> local (events will get proper category on re-analysis)
UPDATE public.emails
SET category = 'local'
WHERE category = 'event';

-- Map newsletter -> newsletters_general
UPDATE public.emails
SET category = 'newsletters_general'
WHERE category = 'newsletter';

-- Map promo -> shopping
UPDATE public.emails
SET category = 'shopping'
WHERE category = 'promo';

-- Map admin -> finance (receipts, confirmations)
UPDATE public.emails
SET category = 'finance'
WHERE category = 'admin';

-- Map personal -> personal_friends_family
UPDATE public.emails
SET category = 'personal_friends_family'
WHERE category = 'personal';

-- Map noise -> newsletters_general (will be re-analyzed)
UPDATE public.emails
SET category = 'newsletters_general'
WHERE category = 'noise';

-- Log the migration results
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count
  FROM public.emails
  WHERE category IN (
    'newsletters_general', 'news_politics', 'product_updates', 'local',
    'shopping', 'travel', 'finance', 'family_kids_school',
    'family_health_appointments', 'client_pipeline', 'business_work_general',
    'personal_friends_family'
  );

  RAISE NOTICE 'Category migration complete. % emails now have new category values.', updated_count;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 3: Document event_detection JSONB structure changes
-- ═══════════════════════════════════════════════════════════════════════════════

-- Add comment to email_analyses table documenting the event_detection structure
COMMENT ON COLUMN public.email_analyses.event_detection IS '
Event detection results (JSONB) - ENHANCED Jan 2026

STRUCTURE:
{
  "has_event": boolean,
  "event_title": string,
  "event_date": string (ISO YYYY-MM-DD),
  "event_time": string (HH:MM 24-hour),
  "event_end_date": string (ISO YYYY-MM-DD) - NEW: for multi-day events,
  "event_end_time": string (HH:MM 24-hour),
  "location_type": "in_person" | "virtual" | "hybrid" | "unknown",
  "event_locality": "local" | "out_of_town" | "virtual" | null - NEW: relative to user,
  "location": string,
  "registration_deadline": string (ISO date),
  "rsvp_required": boolean,
  "rsvp_url": string,
  "organizer": string,
  "cost": string,
  "additional_details": string,
  "event_summary": string,
  "key_points": string[],
  "is_key_date": boolean - NEW: true for deadlines/dates vs full events,
  "key_date_type": "registration_deadline" | "open_house" | "deadline" | "release_date" | "other" - NEW,
  "confidence": number (0-1)
}

EVENT LOCALITY (NEW Jan 2026):
- "local": Event is in or near users metro area
- "out_of_town": Event requires travel to another city
- "virtual": Event is online-only
- null: Unknown or not determined

KEY DATES vs FULL EVENTS (NEW Jan 2026):
- Full events (is_key_date = false): Things you attend (meetups, meetings, conferences)
- Key dates (is_key_date = true): Important dates to note (deadlines, open houses)
';

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 4: Add index for efficient category filtering
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop old index if it exists
DROP INDEX IF EXISTS idx_emails_category;

-- Create new index for category filtering (if not exists)
CREATE INDEX IF NOT EXISTS idx_emails_category_user
ON public.emails(user_id, category)
WHERE category IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 5: Update categorization JSONB comment
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN public.email_analyses.categorization IS '
Categorization results (JSONB) - REFACTORED Jan 2026

Changed from action-focused to life-bucket categorization.
Events are now detected via the "has_event" label.

STRUCTURE:
{
  "category": string (see emails.category for valid values),
  "labels": string[] (secondary labels like "has_event", "needs_reply", "urgent"),
  "confidence": number (0-1),
  "reasoning": string,
  "topics": string[],
  "summary": string (assistant-style one-liner),
  "quick_action": "respond" | "review" | "archive" | "save" | "calendar" | "unsubscribe" | "follow_up" | "none"
}

IMPORTANT LABELS:
- has_event: Email contains a calendar-worthy event (triggers EventDetector)
- needs_reply: Someone is waiting for a response
- urgent: Marked urgent or time-critical
- has_deadline: Specific deadline mentioned
- from_vip: Sender is on users VIP list
- local_event: Event is in users metro area
';

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 6: Add new CHECK constraint with updated category values
-- ═══════════════════════════════════════════════════════════════════════════════
-- Re-add the CHECK constraint with the new life-bucket category values.
-- This ensures data integrity going forward.

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
-- STEP 7: Add sender_patterns column to user_profiles
-- ═══════════════════════════════════════════════════════════════════════════════
-- Stores learned sender patterns for auto-categorization without AI.
-- Used by the email prefilter service.

ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS sender_patterns JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.user_profiles.sender_patterns IS '
Learned sender patterns for auto-categorization (JSONB array).

Each pattern:
{
  "pattern": string (email or domain),
  "isDomain": boolean (true if domain-level pattern),
  "category": EmailCategory,
  "confidence": number (0-1),
  "sampleSize": number (emails that contributed to pattern),
  "updatedAt": ISO timestamp
}

Used by EmailPreFilterService to skip AI analysis for known senders.
';

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════════════

-- Verify no old category values remain
DO $$
DECLARE
  old_category_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO old_category_count
  FROM public.emails
  WHERE category IN ('action_required', 'event', 'newsletter', 'promo', 'admin', 'personal', 'noise');

  IF old_category_count > 0 THEN
    RAISE WARNING 'Found % emails with old category values. These should be re-analyzed.', old_category_count;
  ELSE
    RAISE NOTICE 'All emails have been migrated to new category values.';
  END IF;
END $$;
