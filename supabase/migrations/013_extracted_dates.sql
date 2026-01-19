-- Extracted Dates Table
-- Stores dates extracted from emails for timeline intelligence.
-- Powers the Hub "upcoming things" view with deadlines, payments, birthdays, etc.
--
-- See docs/ENHANCED_EMAIL_INTELLIGENCE.md for full documentation.

-- ═══════════════════════════════════════════════════════════════════════════════
-- DATE TYPES ENUM (for documentation - we use TEXT for flexibility)
-- ═══════════════════════════════════════════════════════════════════════════════
-- 'deadline'     - Task/response deadlines
-- 'event'        - Calendar events (also in events table)
-- 'appointment'  - Scheduled appointments
-- 'payment_due'  - Invoice/bill due dates
-- 'expiration'   - Subscription/offer expirations
-- 'follow_up'    - Suggested follow-up times
-- 'birthday'     - Birthday mentions
-- 'anniversary'  - Work/personal anniversaries
-- 'recurring'    - Recurring events/meetings
-- 'reminder'     - General reminders
-- 'other'        - Other date-related items

-- ═══════════════════════════════════════════════════════════════════════════════
-- EXTRACTED DATES TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE extracted_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- ═══════════════════════════════════════════════════════════════════════════
  -- Source References
  -- ═══════════════════════════════════════════════════════════════════════════
  email_id UUID REFERENCES emails(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,

  -- ═══════════════════════════════════════════════════════════════════════════
  -- Date Information
  -- ═══════════════════════════════════════════════════════════════════════════
  date_type TEXT NOT NULL,      -- 'deadline', 'birthday', 'payment_due', etc.
  date DATE NOT NULL,           -- The primary date
  event_time TIME,              -- Time if known (NULL for all-day)
  end_date DATE,                -- End date for ranges
  end_time TIME,                -- End time for ranges
  timezone TEXT DEFAULT 'America/Chicago',

  -- ═══════════════════════════════════════════════════════════════════════════
  -- Context
  -- ═══════════════════════════════════════════════════════════════════════════
  title TEXT NOT NULL,          -- "Invoice #1234 due", "Sarah's birthday"
  description TEXT,             -- Additional context
  source_snippet TEXT,          -- Original text that contained the date
  related_entity TEXT,          -- Company, person, or project this relates to

  -- ═══════════════════════════════════════════════════════════════════════════
  -- Recurrence
  -- ═══════════════════════════════════════════════════════════════════════════
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_pattern TEXT,      -- 'daily', 'weekly', 'monthly', 'yearly', 'quarterly'
  recurrence_end_date DATE,     -- When recurrence stops

  -- ═══════════════════════════════════════════════════════════════════════════
  -- Extraction Metadata
  -- ═══════════════════════════════════════════════════════════════════════════
  confidence DECIMAL(3,2),      -- 0.00-1.00 confidence in extraction
  extracted_by TEXT DEFAULT 'date_extractor',  -- Which analyzer extracted this

  -- ═══════════════════════════════════════════════════════════════════════════
  -- Hub Display & User Interaction
  -- ═══════════════════════════════════════════════════════════════════════════
  priority_score INTEGER DEFAULT 5,     -- 1-10, for Hub ranking
  is_acknowledged BOOLEAN DEFAULT FALSE,  -- User has seen/handled this
  acknowledged_at TIMESTAMPTZ,
  is_hidden BOOLEAN DEFAULT FALSE,       -- User chose to hide this
  snoozed_until TIMESTAMPTZ,             -- Snooze until this time

  -- ═══════════════════════════════════════════════════════════════════════════
  -- Metadata
  -- ═══════════════════════════════════════════════════════════════════════════
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Primary lookup: user's upcoming dates
CREATE INDEX idx_extracted_dates_user_date ON extracted_dates(user_id, date);

-- Filter by type
CREATE INDEX idx_extracted_dates_type ON extracted_dates(user_id, date_type, date);

-- Source email lookup
CREATE INDEX idx_extracted_dates_email ON extracted_dates(email_id);

-- Contact lookup (for birthday aggregation)
CREATE INDEX idx_extracted_dates_contact ON extracted_dates(contact_id);

-- Hub query optimization: unacknowledged dates in date range
CREATE INDEX idx_extracted_dates_hub ON extracted_dates(user_id, date, is_acknowledged, is_hidden)
  WHERE is_acknowledged = FALSE AND is_hidden = FALSE;

-- Recurring dates
CREATE INDEX idx_extracted_dates_recurring ON extracted_dates(user_id, is_recurring)
  WHERE is_recurring = TRUE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE extracted_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own extracted dates"
  ON extracted_dates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own extracted dates"
  ON extracted_dates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own extracted dates"
  ON extracted_dates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own extracted dates"
  ON extracted_dates FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update updated_at timestamp
CREATE TRIGGER update_extracted_dates_updated_at
  BEFORE UPDATE ON extracted_dates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Get upcoming dates for Hub (next N days)
CREATE OR REPLACE FUNCTION get_upcoming_dates(
  p_user_id UUID,
  p_days_ahead INTEGER DEFAULT 7,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  date_type TEXT,
  date DATE,
  event_time TIME,
  title TEXT,
  description TEXT,
  priority_score INTEGER,
  email_id UUID,
  contact_id UUID,
  is_recurring BOOLEAN,
  hours_until DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ed.id,
    ed.date_type,
    ed.date,
    ed.event_time,
    ed.title,
    ed.description,
    ed.priority_score,
    ed.email_id,
    ed.contact_id,
    ed.is_recurring,
    EXTRACT(EPOCH FROM (
      (ed.date + COALESCE(ed.event_time, '00:00:00'::TIME))::TIMESTAMP -
      NOW()
    )) / 3600 as hours_until
  FROM extracted_dates ed
  WHERE ed.user_id = p_user_id
    AND ed.is_acknowledged = FALSE
    AND ed.is_hidden = FALSE
    AND (ed.snoozed_until IS NULL OR ed.snoozed_until <= NOW())
    AND ed.date >= CURRENT_DATE
    AND ed.date <= CURRENT_DATE + p_days_ahead
  ORDER BY ed.date, ed.event_time NULLS LAST, ed.priority_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get dates by type
CREATE OR REPLACE FUNCTION get_dates_by_type(
  p_user_id UUID,
  p_date_type TEXT,
  p_days_ahead INTEGER DEFAULT 30
)
RETURNS TABLE (
  id UUID,
  date DATE,
  event_time TIME,
  title TEXT,
  description TEXT,
  related_entity TEXT,
  email_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ed.id,
    ed.date,
    ed.event_time,
    ed.title,
    ed.description,
    ed.related_entity,
    ed.email_id
  FROM extracted_dates ed
  WHERE ed.user_id = p_user_id
    AND ed.date_type = p_date_type
    AND ed.is_hidden = FALSE
    AND ed.date >= CURRENT_DATE
    AND ed.date <= CURRENT_DATE + p_days_ahead
  ORDER BY ed.date, ed.event_time NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Acknowledge a date (mark as handled)
CREATE OR REPLACE FUNCTION acknowledge_date(p_date_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE extracted_dates
  SET
    is_acknowledged = TRUE,
    acknowledged_at = NOW(),
    updated_at = NOW()
  WHERE id = p_date_id
    AND user_id = p_user_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Snooze a date
CREATE OR REPLACE FUNCTION snooze_date(
  p_date_id UUID,
  p_user_id UUID,
  p_snooze_until TIMESTAMPTZ
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE extracted_dates
  SET
    snoozed_until = p_snooze_until,
    updated_at = NOW()
  WHERE id = p_date_id
    AND user_id = p_user_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Hide a date (user doesn't want to see it)
CREATE OR REPLACE FUNCTION hide_date(p_date_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE extracted_dates
  SET
    is_hidden = TRUE,
    updated_at = NOW()
  WHERE id = p_date_id
    AND user_id = p_user_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get count of upcoming dates by type (for dashboard)
CREATE OR REPLACE FUNCTION get_date_counts_by_type(
  p_user_id UUID,
  p_days_ahead INTEGER DEFAULT 7
)
RETURNS TABLE (
  date_type TEXT,
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ed.date_type,
    COUNT(*)::BIGINT
  FROM extracted_dates ed
  WHERE ed.user_id = p_user_id
    AND ed.is_acknowledged = FALSE
    AND ed.is_hidden = FALSE
    AND ed.date >= CURRENT_DATE
    AND ed.date <= CURRENT_DATE + p_days_ahead
  GROUP BY ed.date_type
  ORDER BY count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════════
-- DEDUPLICATION
-- ═══════════════════════════════════════════════════════════════════════════════

-- Prevent duplicate dates from the same email
CREATE UNIQUE INDEX idx_extracted_dates_dedup
  ON extracted_dates(email_id, date_type, date, title)
  WHERE email_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- CLEANUP FUNCTION
-- ═══════════════════════════════════════════════════════════════════════════════

-- Clean up old acknowledged/past dates (run periodically)
CREATE OR REPLACE FUNCTION cleanup_old_extracted_dates()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Delete acknowledged dates older than 30 days
  DELETE FROM extracted_dates
  WHERE (
    (is_acknowledged = TRUE AND date < CURRENT_DATE - INTERVAL '30 days')
    OR (date < CURRENT_DATE - INTERVAL '90 days')  -- Any date older than 90 days
  )
  AND is_recurring = FALSE;  -- Keep recurring dates

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;