-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Sender Type Classification
-- Description: Adds sender_type classification to distinguish between direct contacts,
--              newsletter/broadcast senders, cold outreach, and opportunity lists.
-- Created: January 2026
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- OVERVIEW
-- ════════════════════════════════════════════════════════════════════════════════
-- This migration introduces a "sender type" classification to solve the problem of
-- newsletters appearing as contacts. The key insight is that relationship_type
-- (client, friend, etc.) and sender_type (direct vs broadcast) are orthogonal:
--
--   - relationship_type: WHO is this person to you? (only meaningful for direct contacts)
--   - sender_type: HOW do they communicate with you? (one-to-one vs one-to-many)
--
-- SENDER TYPES:
-- ════════════════════════════════════════════════════════════════════════════════
--
-- 'direct'        - Real person who knows you, expects/welcomes replies
--                   Examples: colleague, client, friend, family member
--
-- 'broadcast'     - One-to-many sender, no personal relationship expected
--                   Examples: Substack author, company newsletter, marketing
--                   Subtypes: newsletter_author, company_newsletter, digest_service, transactional
--
-- 'cold_outreach' - Person reaching out cold (one-to-one but no relationship)
--                   Examples: sales emails, recruiter first contact, PR pitches
--
-- 'opportunity'   - Mailing list where response is optional but possible
--                   Examples: HARO, community job boards, group asks
--
-- 'unknown'       - Not yet classified (default for new contacts)
--
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 1: Add sender_type column to contacts
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS sender_type TEXT DEFAULT 'unknown';

COMMENT ON COLUMN contacts.sender_type IS
  'Classification of how this sender communicates: direct (personal), broadcast (newsletter/marketing), cold_outreach (unsolicited but targeted), opportunity (mailing list with optional response), unknown (not yet classified).';

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 2: Add broadcast_subtype for finer classification of broadcast senders
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS broadcast_subtype TEXT;

COMMENT ON COLUMN contacts.broadcast_subtype IS
  'For broadcast senders, the specific type: newsletter_author (Substack, personal blog), company_newsletter (company marketing), digest_service (LinkedIn digest, aggregators), transactional (receipts, noreply). NULL for non-broadcast senders.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 3: Add sender type detection metadata
-- ═══════════════════════════════════════════════════════════════════════════════

-- Confidence in the sender type classification (0-1)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS sender_type_confidence DECIMAL(3,2);

COMMENT ON COLUMN contacts.sender_type_confidence IS
  'Confidence score (0.00-1.00) in the sender_type classification. Higher values indicate more reliable detection (e.g., from headers vs inference).';

-- When sender type was last detected/updated
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS sender_type_detected_at TIMESTAMPTZ;

COMMENT ON COLUMN contacts.sender_type_detected_at IS
  'Timestamp when sender_type was last detected or updated. Used to determine if re-classification is needed.';

-- How sender type was detected
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS sender_type_source TEXT;

COMMENT ON COLUMN contacts.sender_type_source IS
  'How sender_type was determined: header (List-Unsubscribe etc), email_pattern (domain/prefix), ai_analysis, user_behavior (reply patterns), manual (user override).';

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 4: Add indexes for efficient filtering
-- ═══════════════════════════════════════════════════════════════════════════════

-- Primary index for filtering by sender type
CREATE INDEX IF NOT EXISTS idx_contacts_sender_type
  ON contacts(user_id, sender_type);

-- Partial index for broadcast senders (common filter)
CREATE INDEX IF NOT EXISTS idx_contacts_broadcast
  ON contacts(user_id, sender_type, broadcast_subtype)
  WHERE sender_type = 'broadcast';

-- Partial index for direct contacts (the "real" contacts list)
CREATE INDEX IF NOT EXISTS idx_contacts_direct
  ON contacts(user_id, last_seen_at DESC)
  WHERE sender_type = 'direct';

-- Index for contacts needing sender type classification
CREATE INDEX IF NOT EXISTS idx_contacts_needs_sender_classification
  ON contacts(user_id, email_count DESC)
  WHERE sender_type = 'unknown' AND email_count >= 1;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 5: Backfill obvious cases based on email patterns
-- ═══════════════════════════════════════════════════════════════════════════════

-- Known newsletter/broadcast domains
UPDATE contacts
SET
  sender_type = 'broadcast',
  broadcast_subtype = 'newsletter_author',
  sender_type_confidence = 0.95,
  sender_type_source = 'email_pattern',
  sender_type_detected_at = NOW()
WHERE sender_type = 'unknown'
  AND (
    email LIKE '%@substack.com'
    OR email LIKE '%@substackmail.com'
    OR email LIKE '%@beehiiv.com'
    OR email LIKE '%@buttondown.email'
    OR email LIKE '%@convertkit.com'
    OR email LIKE '%@revue.co'
  );

-- Known digest/notification services
UPDATE contacts
SET
  sender_type = 'broadcast',
  broadcast_subtype = 'digest_service',
  sender_type_confidence = 0.95,
  sender_type_source = 'email_pattern',
  sender_type_detected_at = NOW()
WHERE sender_type = 'unknown'
  AND (
    email LIKE '%@linkedin.com'
    OR email LIKE '%@github.com'
    OR email LIKE '%@notifications.google.com'
    OR email LIKE '%@medium.com'
  );

-- Transactional/noreply senders
UPDATE contacts
SET
  sender_type = 'broadcast',
  broadcast_subtype = 'transactional',
  sender_type_confidence = 0.90,
  sender_type_source = 'email_pattern',
  sender_type_detected_at = NOW()
WHERE sender_type = 'unknown'
  AND (
    email LIKE 'noreply@%'
    OR email LIKE 'no-reply@%'
    OR email LIKE 'donotreply@%'
    OR email LIKE 'notifications@%'
    OR email LIKE 'mailer-daemon@%'
  );

-- Newsletter prefix patterns
UPDATE contacts
SET
  sender_type = 'broadcast',
  broadcast_subtype = 'company_newsletter',
  sender_type_confidence = 0.85,
  sender_type_source = 'email_pattern',
  sender_type_detected_at = NOW()
WHERE sender_type = 'unknown'
  AND (
    email LIKE 'newsletter@%'
    OR email LIKE 'news@%'
    OR email LIKE 'digest@%'
    OR email LIKE 'weekly@%'
    OR email LIKE 'daily@%'
    OR email LIKE 'updates@%'
    OR email LIKE 'announce@%'
  );

-- High-confidence direct contacts: user has replied to them multiple times
UPDATE contacts
SET
  sender_type = 'direct',
  sender_type_confidence = 0.95,
  sender_type_source = 'user_behavior',
  sender_type_detected_at = NOW()
WHERE sender_type = 'unknown'
  AND sent_count >= 2;

-- Medium-confidence direct: user has replied at least once
UPDATE contacts
SET
  sender_type = 'direct',
  sender_type_confidence = 0.80,
  sender_type_source = 'user_behavior',
  sender_type_detected_at = NOW()
WHERE sender_type = 'unknown'
  AND sent_count >= 1;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 6: Helper function to classify sender type from email patterns
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION classify_sender_type_from_email(p_email TEXT)
RETURNS TABLE (
  sender_type TEXT,
  broadcast_subtype TEXT,
  confidence DECIMAL(3,2)
) AS $$
DECLARE
  v_email TEXT;
  v_local_part TEXT;
  v_domain TEXT;
BEGIN
  v_email := LOWER(TRIM(p_email));
  v_local_part := SPLIT_PART(v_email, '@', 1);
  v_domain := SPLIT_PART(v_email, '@', 2);

  -- Known newsletter platforms (highest confidence)
  IF v_domain IN ('substack.com', 'substackmail.com', 'beehiiv.com', 'buttondown.email', 'convertkit.com', 'revue.co') THEN
    RETURN QUERY SELECT 'broadcast'::TEXT, 'newsletter_author'::TEXT, 0.95::DECIMAL(3,2);
    RETURN;
  END IF;

  -- Known digest/notification services
  IF v_domain IN ('linkedin.com', 'github.com', 'notifications.google.com', 'medium.com', 'twitter.com', 'x.com') THEN
    RETURN QUERY SELECT 'broadcast'::TEXT, 'digest_service'::TEXT, 0.95::DECIMAL(3,2);
    RETURN;
  END IF;

  -- Transactional patterns (by prefix)
  IF v_local_part IN ('noreply', 'no-reply', 'donotreply', 'notifications', 'mailer-daemon', 'postmaster') THEN
    RETURN QUERY SELECT 'broadcast'::TEXT, 'transactional'::TEXT, 0.90::DECIMAL(3,2);
    RETURN;
  END IF;

  -- Newsletter patterns (by prefix)
  IF v_local_part IN ('newsletter', 'news', 'digest', 'weekly', 'daily', 'updates', 'announce', 'bulletin') THEN
    RETURN QUERY SELECT 'broadcast'::TEXT, 'company_newsletter'::TEXT, 0.85::DECIMAL(3,2);
    RETURN;
  END IF;

  -- Marketing patterns (lower confidence)
  IF v_local_part IN ('marketing', 'promo', 'offers', 'deals', 'hello', 'info', 'team') THEN
    RETURN QUERY SELECT 'broadcast'::TEXT, 'company_newsletter'::TEXT, 0.70::DECIMAL(3,2);
    RETURN;
  END IF;

  -- No pattern match - return unknown
  RETURN QUERY SELECT 'unknown'::TEXT, NULL::TEXT, 0.00::DECIMAL(3,2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION classify_sender_type_from_email IS
  'Classifies sender type based on email address patterns. Returns sender_type, broadcast_subtype, and confidence. Used for initial classification before AI analysis.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 7: Update upsert_contact_from_email to include sender_type hints
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop the old 5-parameter version from migration 012 to avoid function overloading conflict
-- PostgreSQL treats different parameter counts as different functions, so we must explicitly
-- drop the old signature before creating the enhanced version with sender_type parameters
DROP FUNCTION IF EXISTS upsert_contact_from_email(UUID, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN);

CREATE OR REPLACE FUNCTION upsert_contact_from_email(
  p_user_id UUID,
  p_email TEXT,
  p_name TEXT,
  p_email_date TIMESTAMPTZ,
  p_is_sent BOOLEAN DEFAULT FALSE,
  p_sender_type TEXT DEFAULT NULL,
  p_sender_type_confidence DECIMAL DEFAULT NULL,
  p_sender_type_source TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_contact_id UUID;
  v_pattern_result RECORD;
BEGIN
  -- If no sender_type provided, try to detect from email pattern
  IF p_sender_type IS NULL THEN
    SELECT * INTO v_pattern_result
    FROM classify_sender_type_from_email(p_email);

    IF v_pattern_result.sender_type != 'unknown' THEN
      p_sender_type := v_pattern_result.sender_type;
      p_sender_type_confidence := v_pattern_result.confidence;
      p_sender_type_source := 'email_pattern';
    END IF;
  END IF;

  INSERT INTO contacts (
    user_id,
    email,
    name,
    first_seen_at,
    last_seen_at,
    email_count,
    sent_count,
    received_count,
    sender_type,
    sender_type_confidence,
    sender_type_source,
    sender_type_detected_at
  )
  VALUES (
    p_user_id,
    LOWER(p_email),
    p_name,
    p_email_date,
    p_email_date,
    1,
    CASE WHEN p_is_sent THEN 1 ELSE 0 END,
    CASE WHEN p_is_sent THEN 0 ELSE 1 END,
    COALESCE(p_sender_type, 'unknown'),
    p_sender_type_confidence,
    p_sender_type_source,
    CASE WHEN p_sender_type IS NOT NULL THEN NOW() ELSE NULL END
  )
  ON CONFLICT (user_id, email) DO UPDATE SET
    name = COALESCE(contacts.name, EXCLUDED.name),
    last_seen_at = GREATEST(contacts.last_seen_at, EXCLUDED.last_seen_at),
    first_seen_at = LEAST(contacts.first_seen_at, EXCLUDED.first_seen_at),
    email_count = contacts.email_count + 1,
    sent_count = contacts.sent_count + CASE WHEN p_is_sent THEN 1 ELSE 0 END,
    received_count = contacts.received_count + CASE WHEN p_is_sent THEN 0 ELSE 1 END,
    -- Update sender_type only if:
    -- 1. Currently unknown, OR
    -- 2. New classification has higher confidence, OR
    -- 3. User sent a reply (strong signal of direct relationship)
    sender_type = CASE
      -- User replied = definitely direct (override everything except manual)
      WHEN p_is_sent AND contacts.sender_type_source != 'manual' THEN 'direct'
      -- Current is unknown, use new classification
      WHEN contacts.sender_type = 'unknown' AND p_sender_type IS NOT NULL THEN p_sender_type
      -- New has higher confidence
      WHEN COALESCE(p_sender_type_confidence, 0) > COALESCE(contacts.sender_type_confidence, 0)
           AND contacts.sender_type_source != 'manual' THEN COALESCE(p_sender_type, contacts.sender_type)
      -- Keep existing
      ELSE contacts.sender_type
    END,
    sender_type_confidence = CASE
      WHEN p_is_sent AND contacts.sender_type_source != 'manual' THEN 0.95
      WHEN contacts.sender_type = 'unknown' AND p_sender_type IS NOT NULL THEN p_sender_type_confidence
      WHEN COALESCE(p_sender_type_confidence, 0) > COALESCE(contacts.sender_type_confidence, 0)
           AND contacts.sender_type_source != 'manual' THEN p_sender_type_confidence
      ELSE contacts.sender_type_confidence
    END,
    sender_type_source = CASE
      WHEN p_is_sent AND contacts.sender_type_source != 'manual' THEN 'user_behavior'
      WHEN contacts.sender_type = 'unknown' AND p_sender_type IS NOT NULL THEN p_sender_type_source
      WHEN COALESCE(p_sender_type_confidence, 0) > COALESCE(contacts.sender_type_confidence, 0)
           AND contacts.sender_type_source != 'manual' THEN p_sender_type_source
      ELSE contacts.sender_type_source
    END,
    sender_type_detected_at = CASE
      WHEN p_is_sent AND contacts.sender_type_source != 'manual' THEN NOW()
      WHEN contacts.sender_type = 'unknown' AND p_sender_type IS NOT NULL THEN NOW()
      WHEN COALESCE(p_sender_type_confidence, 0) > COALESCE(contacts.sender_type_confidence, 0)
           AND contacts.sender_type_source != 'manual' THEN NOW()
      ELSE contacts.sender_type_detected_at
    END,
    updated_at = NOW()
  RETURNING id INTO v_contact_id;

  RETURN v_contact_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION upsert_contact_from_email IS
  'Upserts a contact from email data. Now includes sender_type classification with automatic detection from email patterns and behavioral signals (user replies).';

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 8: Add function to get contacts by sender type
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_contacts_by_sender_type(
  p_user_id UUID,
  p_sender_type TEXT DEFAULT 'direct',
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  email_count INTEGER,
  sent_count INTEGER,
  received_count INTEGER,
  last_seen_at TIMESTAMPTZ,
  sender_type TEXT,
  broadcast_subtype TEXT,
  relationship_type TEXT,
  is_vip BOOLEAN,
  company TEXT,
  job_title TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.email,
    COALESCE(c.display_name, c.name) as name,
    c.avatar_url,
    c.email_count,
    c.sent_count,
    c.received_count,
    c.last_seen_at,
    c.sender_type,
    c.broadcast_subtype,
    c.relationship_type,
    c.is_vip,
    c.company,
    c.job_title
  FROM contacts c
  WHERE c.user_id = p_user_id
    AND c.is_archived = FALSE
    AND (p_sender_type = 'all' OR c.sender_type = p_sender_type)
  ORDER BY
    c.is_vip DESC,
    c.last_seen_at DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_contacts_by_sender_type IS
  'Returns contacts filtered by sender_type. Use "all" to get all contacts, "direct" for real contacts, "broadcast" for newsletters/subscriptions.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 9: Add function to get sender type statistics
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_sender_type_stats(p_user_id UUID)
RETURNS TABLE (
  sender_type TEXT,
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.sender_type,
    COUNT(*)::BIGINT as count
  FROM contacts c
  WHERE c.user_id = p_user_id
    AND c.is_archived = FALSE
  GROUP BY c.sender_type
  ORDER BY count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_sender_type_stats IS
  'Returns count of contacts by sender_type for the given user. Useful for displaying tabs with counts.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION COMPLETE
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- SUMMARY OF CHANGES:
-- 1. Added sender_type column (direct, broadcast, cold_outreach, opportunity, unknown)
-- 2. Added broadcast_subtype for finer broadcast classification
-- 3. Added confidence and source tracking for sender_type
-- 4. Created indexes for efficient filtering
-- 5. Backfilled obvious cases from email patterns
-- 6. Created classify_sender_type_from_email() helper function
-- 7. Updated upsert_contact_from_email() to detect sender_type
-- 8. Added get_contacts_by_sender_type() for filtered queries
-- 9. Added get_sender_type_stats() for UI tab counts
--
-- NEXT STEPS:
-- 1. Update TypeScript types in src/services/analyzers/types.ts
-- 2. Create sender-type-detector.ts for header-based detection
-- 3. Update ContactEnricher to output sender_type
-- 4. Update contacts API to support sender_type filter
-- 5. Update UI to show tabs for different sender types
--
