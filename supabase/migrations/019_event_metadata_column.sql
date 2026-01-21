-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 019: Add event_metadata JSONB column to extracted_dates
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- PURPOSE:
-- Store rich event details from EventDetector alongside timeline entries.
-- This enables the Events page to display locality badges, locations, RSVP info,
-- and other rich data without requiring JOINs to email_analyses.
--
-- BACKGROUND:
-- Previously, EventDetector stored rich data in email_analyses.event_detection
-- but the Events page queried extracted_dates. This migration bridges that gap
-- by storing a copy of rich event fields directly in extracted_dates.
--
-- The event_metadata field contains:
-- - locality: 'local' | 'out_of_town' | 'virtual' (relative to user)
-- - locationType: 'in_person' | 'virtual' | 'hybrid' | 'unknown'
-- - location: Physical address or video meeting link
-- - rsvpRequired: Whether RSVP is needed
-- - rsvpUrl: Registration/RSVP link
-- - rsvpDeadline: RSVP deadline date
-- - organizer: Event organizer
-- - cost: Price info ('Free', '$25', etc.)
-- - isKeyDate: Whether this is a key date vs full event
-- - keyDateType: Type of key date if applicable
-- - eventSummary: One-sentence assistant-style summary
-- - keyPoints: Array of 2-4 bullet points
--
-- USAGE:
-- Events with rich data will have event_metadata populated.
-- Non-event dates (deadlines, birthdays) will have NULL event_metadata.
--
-- @since January 2026
-- ═══════════════════════════════════════════════════════════════════════════════

-- Add event_metadata JSONB column for rich event data
-- NULL for non-event date types, populated for events from EventDetector
ALTER TABLE extracted_dates
ADD COLUMN IF NOT EXISTS event_metadata JSONB;

-- Add comment explaining the column's purpose
COMMENT ON COLUMN extracted_dates.event_metadata IS
  'Rich event data from EventDetector: locality, location, RSVP info, etc. NULL for non-event dates.';

-- Create index for querying by locality (common filter in Events page)
-- Uses JSONB containment operator for efficient filtering
CREATE INDEX IF NOT EXISTS idx_extracted_dates_event_locality
  ON extracted_dates USING GIN (event_metadata jsonb_path_ops)
  WHERE date_type = 'event' AND event_metadata IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTION: Get events with full metadata
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- This function returns events with their metadata for the Events page.
-- Includes locality, location, and RSVP information.
--
-- @param p_user_id - User's UUID
-- @param p_include_past - Whether to include past events (default false)
-- @param p_limit - Maximum events to return (default 100)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_events_with_metadata(
  p_user_id UUID,
  p_include_past BOOLEAN DEFAULT FALSE,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  email_id UUID,
  contact_id UUID,
  date DATE,
  event_time TIME,
  end_date DATE,
  end_time TIME,
  title TEXT,
  description TEXT,
  priority_score INTEGER,
  is_acknowledged BOOLEAN,
  is_recurring BOOLEAN,
  confidence DECIMAL,
  event_metadata JSONB,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ed.id,
    ed.email_id,
    ed.contact_id,
    ed.date,
    ed.event_time,
    ed.end_date,
    ed.end_time,
    ed.title,
    ed.description,
    ed.priority_score,
    ed.is_acknowledged,
    ed.is_recurring,
    ed.confidence,
    ed.event_metadata,
    ed.created_at
  FROM extracted_dates ed
  WHERE ed.user_id = p_user_id
    AND ed.date_type = 'event'
    AND ed.is_hidden = FALSE
    AND (p_include_past OR ed.date >= CURRENT_DATE)
  ORDER BY ed.date ASC, ed.event_time ASC NULLS LAST
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_events_with_metadata(UUID, BOOLEAN, INTEGER) TO authenticated;
