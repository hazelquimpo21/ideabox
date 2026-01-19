-- Contacts Table
-- Auto-populated from email metadata, enriched by AI analysis.
-- Tracks communication patterns and contact intelligence.
--
-- See docs/ENHANCED_EMAIL_INTELLIGENCE.md for full documentation.

-- ═══════════════════════════════════════════════════════════════════════════════
-- CONTACTS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,

  -- ═══════════════════════════════════════════════════════════════════════════
  -- Basic Info (auto-populated from emails)
  -- ═══════════════════════════════════════════════════════════════════════════
  name TEXT,                    -- Best known name from email headers
  display_name TEXT,            -- User-set override for display

  -- ═══════════════════════════════════════════════════════════════════════════
  -- Communication Stats (auto-calculated on email sync)
  -- ═══════════════════════════════════════════════════════════════════════════
  email_count INTEGER DEFAULT 0,          -- Total emails with this contact
  sent_count INTEGER DEFAULT 0,           -- Emails user sent TO them
  received_count INTEGER DEFAULT 0,       -- Emails received FROM them
  first_seen_at TIMESTAMPTZ,              -- First email date
  last_seen_at TIMESTAMPTZ,               -- Most recent email date
  last_user_reply_at TIMESTAMPTZ,         -- When user last replied to them
  avg_response_hours DECIMAL(10,2),       -- User's avg response time to this contact

  -- ═══════════════════════════════════════════════════════════════════════════
  -- AI-Extracted Info (populated by ContactEnricher analyzer)
  -- ═══════════════════════════════════════════════════════════════════════════
  company TEXT,                 -- Company name from signature
  job_title TEXT,               -- Job title/role
  phone TEXT,                   -- Phone number if found
  linkedin_url TEXT,            -- LinkedIn profile if found

  -- Relationship classification
  relationship_type TEXT,       -- 'client', 'colleague', 'vendor', 'friend', 'family', 'recruiter', 'service', 'unknown'
  relationship_strength TEXT DEFAULT 'normal',  -- 'strong', 'normal', 'weak' (based on communication patterns)

  -- ═══════════════════════════════════════════════════════════════════════════
  -- Personal Dates (for birthday/anniversary reminders)
  -- ═══════════════════════════════════════════════════════════════════════════
  birthday DATE,                -- Birthday (year may be null, stored as 1900-MM-DD)
  birthday_year_known BOOLEAN DEFAULT FALSE,
  work_anniversary DATE,        -- Work anniversary with user
  custom_dates JSONB DEFAULT '[]',  -- [{"label": "Project start", "date": "2025-03-15"}]

  -- ═══════════════════════════════════════════════════════════════════════════
  -- User Flags
  -- ═══════════════════════════════════════════════════════════════════════════
  is_vip BOOLEAN DEFAULT FALSE,           -- User-marked as VIP
  is_muted BOOLEAN DEFAULT FALSE,         -- Suppress from Hub/notifications
  is_archived BOOLEAN DEFAULT FALSE,      -- Hide from active contacts

  -- ═══════════════════════════════════════════════════════════════════════════
  -- AI Extraction Metadata
  -- ═══════════════════════════════════════════════════════════════════════════
  extraction_confidence DECIMAL(3,2),     -- 0.00-1.00 confidence in extracted data
  last_extracted_at TIMESTAMPTZ,          -- When AI last analyzed this contact
  extraction_source TEXT,                 -- 'signature', 'email_body', 'linkedin', 'manual'
  needs_enrichment BOOLEAN DEFAULT TRUE,  -- Flag for enrichment queue

  -- ═══════════════════════════════════════════════════════════════════════════
  -- Notes
  -- ═══════════════════════════════════════════════════════════════════════════
  notes TEXT,                   -- User's notes about this contact

  -- ═══════════════════════════════════════════════════════════════════════════
  -- Metadata
  -- ═══════════════════════════════════════════════════════════════════════════
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, email)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE INDEX idx_contacts_user_id ON contacts(user_id);
CREATE INDEX idx_contacts_email ON contacts(user_id, email);
CREATE INDEX idx_contacts_last_seen ON contacts(user_id, last_seen_at DESC);
CREATE INDEX idx_contacts_email_count ON contacts(user_id, email_count DESC);
CREATE INDEX idx_contacts_vip ON contacts(user_id, is_vip) WHERE is_vip = TRUE;
CREATE INDEX idx_contacts_needs_enrichment ON contacts(user_id, needs_enrichment) WHERE needs_enrichment = TRUE;
CREATE INDEX idx_contacts_birthday ON contacts(user_id, birthday) WHERE birthday IS NOT NULL;
CREATE INDEX idx_contacts_relationship ON contacts(user_id, relationship_type);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own contacts"
  ON contacts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own contacts"
  ON contacts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own contacts"
  ON contacts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own contacts"
  ON contacts FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update updated_at timestamp
CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Upsert contact from email (called during email sync)
CREATE OR REPLACE FUNCTION upsert_contact_from_email(
  p_user_id UUID,
  p_email TEXT,
  p_name TEXT,
  p_email_date TIMESTAMPTZ,
  p_is_sent BOOLEAN DEFAULT FALSE
)
RETURNS UUID AS $$
DECLARE
  v_contact_id UUID;
BEGIN
  INSERT INTO contacts (user_id, email, name, first_seen_at, last_seen_at, email_count, sent_count, received_count)
  VALUES (
    p_user_id,
    LOWER(p_email),
    p_name,
    p_email_date,
    p_email_date,
    1,
    CASE WHEN p_is_sent THEN 1 ELSE 0 END,
    CASE WHEN p_is_sent THEN 0 ELSE 1 END
  )
  ON CONFLICT (user_id, email) DO UPDATE SET
    name = COALESCE(contacts.name, EXCLUDED.name),
    last_seen_at = GREATEST(contacts.last_seen_at, EXCLUDED.last_seen_at),
    first_seen_at = LEAST(contacts.first_seen_at, EXCLUDED.first_seen_at),
    email_count = contacts.email_count + 1,
    sent_count = contacts.sent_count + CASE WHEN p_is_sent THEN 1 ELSE 0 END,
    received_count = contacts.received_count + CASE WHEN p_is_sent THEN 0 ELSE 1 END,
    updated_at = NOW()
  RETURNING id INTO v_contact_id;

  RETURN v_contact_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get top contacts by email count
CREATE OR REPLACE FUNCTION get_top_contacts(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  name TEXT,
  email_count INTEGER,
  last_seen_at TIMESTAMPTZ,
  relationship_type TEXT,
  is_vip BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.email,
    COALESCE(c.display_name, c.name) as name,
    c.email_count,
    c.last_seen_at,
    c.relationship_type,
    c.is_vip
  FROM contacts c
  WHERE c.user_id = p_user_id
    AND c.is_archived = FALSE
    AND c.is_muted = FALSE
  ORDER BY c.email_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get contacts needing enrichment
CREATE OR REPLACE FUNCTION get_contacts_for_enrichment(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  name TEXT,
  email_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.email,
    c.name,
    c.email_count
  FROM contacts c
  WHERE c.user_id = p_user_id
    AND c.needs_enrichment = TRUE
    AND c.email_count >= 3  -- Only enrich contacts with enough emails
    AND (
      c.extraction_confidence IS NULL
      OR c.extraction_confidence < 0.5
      OR c.last_extracted_at < NOW() - INTERVAL '30 days'
    )
  ORDER BY c.email_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get upcoming birthdays
CREATE OR REPLACE FUNCTION get_upcoming_birthdays(
  p_user_id UUID,
  p_days_ahead INTEGER DEFAULT 30
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  name TEXT,
  birthday DATE,
  days_until INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.email,
    COALESCE(c.display_name, c.name) as name,
    c.birthday,
    -- Calculate days until birthday this year (or next year if passed)
    CASE
      WHEN (DATE_TRUNC('year', CURRENT_DATE) + (c.birthday - DATE_TRUNC('year', c.birthday)))::DATE >= CURRENT_DATE
      THEN (DATE_TRUNC('year', CURRENT_DATE) + (c.birthday - DATE_TRUNC('year', c.birthday)))::DATE - CURRENT_DATE
      ELSE (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 year' + (c.birthday - DATE_TRUNC('year', c.birthday)))::DATE - CURRENT_DATE
    END::INTEGER as days_until
  FROM contacts c
  WHERE c.user_id = p_user_id
    AND c.birthday IS NOT NULL
    AND c.is_archived = FALSE
  HAVING
    CASE
      WHEN (DATE_TRUNC('year', CURRENT_DATE) + (c.birthday - DATE_TRUNC('year', c.birthday)))::DATE >= CURRENT_DATE
      THEN (DATE_TRUNC('year', CURRENT_DATE) + (c.birthday - DATE_TRUNC('year', c.birthday)))::DATE - CURRENT_DATE
      ELSE (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 year' + (c.birthday - DATE_TRUNC('year', c.birthday)))::DATE - CURRENT_DATE
    END <= p_days_ahead
  ORDER BY days_until;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════════
-- BACKFILL FUNCTION (for existing users)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Backfill contacts from existing emails
CREATE OR REPLACE FUNCTION backfill_contacts_from_emails(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO contacts (user_id, email, name, email_count, first_seen_at, last_seen_at, received_count)
  SELECT
    user_id,
    LOWER(sender_email),
    MAX(sender_name),
    COUNT(*),
    MIN(date),
    MAX(date),
    COUNT(*)
  FROM emails
  WHERE user_id = p_user_id
    AND sender_email IS NOT NULL
  GROUP BY user_id, LOWER(sender_email)
  ON CONFLICT (user_id, email) DO UPDATE SET
    email_count = EXCLUDED.email_count,
    first_seen_at = LEAST(contacts.first_seen_at, EXCLUDED.first_seen_at),
    last_seen_at = GREATEST(contacts.last_seen_at, EXCLUDED.last_seen_at),
    received_count = EXCLUDED.received_count,
    updated_at = NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
