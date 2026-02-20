-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 031: Profile Suggestions Column
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Adds columns to user_context for storing AI-generated profile suggestions.
-- These are populated by POST /api/onboarding/profile-suggestions and consumed
-- by the Mad Libs onboarding step (Phase 3) to show smart defaults.
--
-- The suggestions are NOT auto-saved to role/company/etc. — the user must
-- explicitly confirm them in the Mad Libs step before they become "real" context.
--
-- COLUMNS ADDED:
--   profile_suggestions        JSONB   — Raw AI suggestions (role, company, etc.)
--   profile_suggestions_generated_at TIMESTAMPTZ — When suggestions were last generated
-- ═══════════════════════════════════════════════════════════════════════════════

-- Add profile_suggestions JSONB column to user_context
-- Stores AI-generated profile suggestions for the Mad Libs onboarding step
ALTER TABLE user_context ADD COLUMN IF NOT EXISTS
  profile_suggestions JSONB DEFAULT NULL;

-- Add profile_suggestions_generated_at timestamp
-- Used for cache invalidation: if suggestions are < 1 hour old, return cached
ALTER TABLE user_context ADD COLUMN IF NOT EXISTS
  profile_suggestions_generated_at TIMESTAMPTZ DEFAULT NULL;
