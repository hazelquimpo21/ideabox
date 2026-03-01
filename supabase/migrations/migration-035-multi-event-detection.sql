-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 035: Multi-Event Detection Column
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- PURPOSE:
-- Add multi_event_detection JSONB column to email_analyses so the
-- MultiEventDetector analyzer can persist results. Previously the analyzer
-- ran but its output was discarded because the column didn't exist.
--
-- CONTEXT:
-- The MultiEventDetector is a Phase 2 conditional analyzer that fires when
-- the Categorizer assigns BOTH has_event AND has_multiple_events labels.
-- It extracts up to 10 individual events from roundup-style emails (e.g.,
-- community event calendars, weekly class schedules, course catalogs).
--
-- Without this column, multi-event emails only showed the single "best"
-- event via event_detection. With it, all events are preserved and
-- displayed in the email detail UI.
--
-- SCHEMA CHANGES:
-- 1. Add multi_event_detection JSONB column to email_analyses
--
-- COST IMPACT:
-- No additional AI cost — the analyzer already runs. This just persists
-- the results that were previously thrown away.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add multi_event_detection JSONB column to email_analyses
-- ─────────────────────────────────────────────────────────────────────────────
-- Stores the full multi-event detection result:
-- {
--   "has_multiple_events": boolean,
--   "event_count": number,
--   "events": [
--     {
--       "has_event": true,
--       "event_title": "string",
--       "event_date": "YYYY-MM-DD",
--       "event_time": "HH:MM" (optional),
--       "event_end_time": "HH:MM" (optional),
--       "event_end_date": "YYYY-MM-DD" (optional),
--       "location_type": "in_person|virtual|hybrid|unknown",
--       "event_locality": "local|out_of_town|virtual" (optional),
--       "location": "string" (optional),
--       "registration_deadline": "YYYY-MM-DD" (optional),
--       "rsvp_required": boolean,
--       "rsvp_url": "string" (optional),
--       "organizer": "string" (optional),
--       "cost": "string" (optional),
--       "additional_details": "string" (optional),
--       "event_summary": "string" (optional),
--       "key_points": ["string"] (optional),
--       "confidence": number
--     }
--   ],
--   "source_description": "string" (optional),
--   "confidence": number
-- }
-- Only populated for emails with both has_event and has_multiple_events labels.
-- Max 10 events per email to cap token cost.

ALTER TABLE email_analyses
ADD COLUMN IF NOT EXISTS multi_event_detection JSONB;

COMMENT ON COLUMN email_analyses.multi_event_detection IS
  'Multiple events extracted from roundup-style emails (calendars, schedules, event digests). Phase 2 conditional — only when both has_event and has_multiple_events labels are present. Up to 10 events per email. Feb 2026.';
