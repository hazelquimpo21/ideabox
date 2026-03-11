-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 047: Add event source columns to project_items
--
-- Adds source_event_email_id and source_event_index to project_items so
-- tasks created from calendar events can link back to their source event.
--
-- Both columns are nullable — existing data is unaffected.
--
-- @since March 2026 — Phase 2 Create Task From Event
-- ═══════════════════════════════════════════════════════════════════════════════

-- Add event source reference (which email contained the event)
ALTER TABLE project_items
  ADD COLUMN IF NOT EXISTS source_event_email_id UUID REFERENCES emails(id);

-- Add event index within the email (for multi-event emails)
ALTER TABLE project_items
  ADD COLUMN IF NOT EXISTS source_event_index INTEGER;

-- Index for efficient lookups by event source
CREATE INDEX IF NOT EXISTS idx_project_items_source_event_email_id
  ON project_items(source_event_email_id)
  WHERE source_event_email_id IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN project_items.source_event_email_id IS 'Email ID containing the source event (for tasks created from calendar events)';
COMMENT ON COLUMN project_items.source_event_index IS 'Index of the event within the email (for multi-event emails)';
