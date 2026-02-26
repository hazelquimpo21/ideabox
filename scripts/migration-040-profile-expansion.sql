-- Migration 040: Profile Expansion
-- Adds personal profile fields to user_context for richer onboarding.
-- New fields: identity (gender, birthday), address, other cities,
-- employment details, household members, and pets.
--
-- The existing family_context JSONB is kept for backward compatibility
-- but household_members provides a richer, structured replacement.

-- ═══════════════════════════════════════════════════════════════════════════════
-- IDENTITY
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE user_context
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS birthday DATE;

COMMENT ON COLUMN user_context.gender IS 'Optional: male, female, non-binary, prefer_not_to_say';
COMMENT ON COLUMN user_context.birthday IS 'User birthday (date only, no time)';

-- ═══════════════════════════════════════════════════════════════════════════════
-- ADDRESS
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE user_context
  ADD COLUMN IF NOT EXISTS address_street TEXT,
  ADD COLUMN IF NOT EXISTS address_city TEXT,
  ADD COLUMN IF NOT EXISTS address_state TEXT,
  ADD COLUMN IF NOT EXISTS address_zip TEXT,
  ADD COLUMN IF NOT EXISTS address_country TEXT DEFAULT 'US';

COMMENT ON COLUMN user_context.address_street IS 'Street address line';
COMMENT ON COLUMN user_context.address_city IS 'City name';
COMMENT ON COLUMN user_context.address_state IS 'State/province abbreviation';
COMMENT ON COLUMN user_context.address_zip IS 'ZIP/postal code';
COMMENT ON COLUMN user_context.address_country IS 'Country code (default US)';

-- ═══════════════════════════════════════════════════════════════════════════════
-- OTHER CITIES
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE user_context
  ADD COLUMN IF NOT EXISTS other_cities JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN user_context.other_cities IS 'Array of { city, tag, note? }. Tags: hometown, travel, family, other';

-- ═══════════════════════════════════════════════════════════════════════════════
-- EMPLOYMENT
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE user_context
  ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'employed',
  ADD COLUMN IF NOT EXISTS other_jobs JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN user_context.employment_type IS 'employed, self_employed, or both';
COMMENT ON COLUMN user_context.other_jobs IS 'Array of { role, company, is_self_employed }';

-- ═══════════════════════════════════════════════════════════════════════════════
-- HOUSEHOLD
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE user_context
  ADD COLUMN IF NOT EXISTS household_members JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pets JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN user_context.household_members IS 'Array of { name, relationship, gender?, birthday?, school? }';
COMMENT ON COLUMN user_context.pets IS 'Array of { name, type }';
