-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 047: Add firmness field to project_items
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Adds a `firmness` column to distinguish task obligation levels:
--   hard     — contractual, financial, legal (rent, taxes, deadlines with penalties)
--   soft     — social commitments, follow-ups (RSVP, meetings)
--   flexible — nice-to-have, aspirational (try restaurant, read article)
--
-- This enables:
-- 1. Dismiss protection for hard tasks (confirmation required)
-- 2. Overdue escalation ordering (hard > soft > flexible)
-- 3. Visual differentiation in triage cards
--
-- Default is 'flexible' for backwards compatibility.
--
-- @since March 2026
-- ═══════════════════════════════════════════════════════════════════════════════

-- Create enum type
DO $$ BEGIN
  CREATE TYPE project_item_firmness AS ENUM ('hard', 'soft', 'flexible');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add column with default
ALTER TABLE project_items
  ADD COLUMN IF NOT EXISTS firmness project_item_firmness NOT NULL DEFAULT 'flexible';

-- Add index for filtering overdue by firmness
CREATE INDEX IF NOT EXISTS idx_project_items_firmness_due
  ON project_items (firmness, due_date)
  WHERE status NOT IN ('completed', 'cancelled');

-- Comment
COMMENT ON COLUMN project_items.firmness IS
  'Obligation level: hard (contractual/financial), soft (social/personal), flexible (nice-to-have). Affects dismiss friction and overdue escalation.';
