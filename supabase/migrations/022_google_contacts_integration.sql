-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Google Contacts Integration
-- Description: Adds Google People API fields to contacts table and creates
--              supporting structures for contact import and onboarding.
-- Created: January 2026
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- OVERVIEW
-- ════════════════════════════════════════════════════════════════════════════════
-- This migration enables integration with Google People API (Contacts API) to:
-- 1. Import contacts from Google for better onboarding experience
-- 2. Sync contact photos (avatars) from Google
-- 3. Use Google's "starred" contacts as VIP suggestions
-- 4. Import Google contact labels/groups for relationship categorization
-- 5. Link contacts across multiple Gmail accounts
--
-- NEW COLUMNS ON contacts:
-- - avatar_url: Contact photo URL from Google
-- - google_resource_name: Google People API resource identifier (e.g., "people/123")
-- - google_labels: Array of Google contact group names
-- - google_synced_at: Timestamp of last sync from Google Contacts
-- - is_google_starred: Whether contact is starred in Google
--
-- NEW TABLE: contact_aliases
-- - Links the same person across multiple email addresses/accounts
-- - Enables unified contact view when user has multiple Gmail accounts
--
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 1: Add Google Contacts fields to contacts table
-- ═══════════════════════════════════════════════════════════════════════════════

-- Avatar URL from Google (or other sources in future)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS avatar_url TEXT;

COMMENT ON COLUMN contacts.avatar_url IS
  'Contact photo URL. Primary source: Google People API. Falls back to Gravatar or generated avatar.';

-- Google People API resource name (unique identifier)
-- Format: "people/c1234567890" or "people/123456789"
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS google_resource_name TEXT;

COMMENT ON COLUMN contacts.google_resource_name IS
  'Google People API resource identifier. Used for syncing updates from Google. Format: "people/123456789"';

-- Google contact labels/groups as array
-- Examples: ["Work", "Family", "VIP", "Clients"]
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS google_labels TEXT[] DEFAULT '{}';

COMMENT ON COLUMN contacts.google_labels IS
  'Contact group names from Google Contacts. Used to suggest relationship_type during onboarding.';

-- Timestamp of last sync from Google Contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS google_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN contacts.google_synced_at IS
  'When this contact was last synced from Google People API. NULL if never synced from Google.';

-- Whether contact is starred in Google (potential VIP)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_google_starred BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN contacts.is_google_starred IS
  'Whether this contact is starred in Google Contacts. Used to suggest VIPs during onboarding.';

-- Import source tracking (email, google, manual)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS import_source TEXT DEFAULT 'email';

COMMENT ON COLUMN contacts.import_source IS
  'How this contact was created: "email" (auto from emails), "google" (imported from Google Contacts), "manual" (user added).';

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 2: Add indexes for new columns
-- ═══════════════════════════════════════════════════════════════════════════════

-- Index for finding starred contacts (VIP suggestions)
CREATE INDEX IF NOT EXISTS idx_contacts_google_starred
  ON contacts(user_id, is_google_starred)
  WHERE is_google_starred = TRUE;

-- Index for finding contacts by Google resource name (sync operations)
CREATE INDEX IF NOT EXISTS idx_contacts_google_resource
  ON contacts(user_id, google_resource_name)
  WHERE google_resource_name IS NOT NULL;

-- Index for contacts needing Google sync
CREATE INDEX IF NOT EXISTS idx_contacts_google_sync
  ON contacts(user_id, google_synced_at)
  WHERE google_resource_name IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 3: Create contact_aliases table for cross-account linking
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- PURPOSE: When a user has multiple Gmail accounts, the same person may appear
-- as different contacts (e.g., john@work.com and john@gmail.com are the same person).
-- This table links those contacts together for a unified view.
--
-- EXAMPLE:
-- User has contact "John Doe" from work@gmail.com account (contact_id: abc)
-- User adds personal@gmail.com account, which has john@gmail.com
-- We create an alias: primary_contact_id=abc, alias_email=john@gmail.com
-- Now emails from john@gmail.com are linked to the same contact record.

CREATE TABLE IF NOT EXISTS contact_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User who owns this alias relationship
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Primary contact record (the "main" contact for this person)
  primary_contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,

  -- Alternative email address for this contact
  alias_email TEXT NOT NULL,

  -- How the alias was created
  -- 'google': Same person detected via Google Contacts
  -- 'manual': User explicitly linked these contacts
  -- 'auto': System detected (e.g., same name + company)
  created_via TEXT DEFAULT 'manual',

  -- Confidence score for auto-detected aliases (0-1)
  confidence DECIMAL(3,2),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one alias email per user
  UNIQUE(user_id, alias_email)
);

-- Index for looking up aliases by email
CREATE INDEX idx_contact_aliases_email ON contact_aliases(user_id, alias_email);

-- Index for finding all aliases for a contact
CREATE INDEX idx_contact_aliases_contact ON contact_aliases(primary_contact_id);

COMMENT ON TABLE contact_aliases IS
  'Links alternative email addresses to a primary contact. Enables unified contact view across multiple Gmail accounts.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 4: Row Level Security for contact_aliases
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE contact_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own contact aliases"
  ON contact_aliases FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own contact aliases"
  ON contact_aliases FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own contact aliases"
  ON contact_aliases FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own contact aliases"
  ON contact_aliases FOR DELETE
  USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 5: Helper functions for Google Contacts integration
-- ═══════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────────
-- Function: upsert_google_contact
-- ───────────────────────────────────────────────────────────────────────────────
-- Upserts a contact from Google People API data.
-- Creates new contact or updates existing one based on email match.
-- Returns the contact ID.
--
-- USAGE:
-- SELECT upsert_google_contact(
--   'user-uuid',
--   'john@example.com',
--   'John Doe',
--   'https://photo.url/abc',
--   'people/123456',
--   ARRAY['Work', 'VIP'],
--   true  -- is_starred
-- );

CREATE OR REPLACE FUNCTION upsert_google_contact(
  p_user_id UUID,
  p_email TEXT,
  p_name TEXT,
  p_avatar_url TEXT DEFAULT NULL,
  p_google_resource_name TEXT DEFAULT NULL,
  p_google_labels TEXT[] DEFAULT '{}',
  p_is_starred BOOLEAN DEFAULT FALSE
)
RETURNS UUID AS $$
DECLARE
  v_contact_id UUID;
  v_normalized_email TEXT;
BEGIN
  -- Normalize email to lowercase
  v_normalized_email := LOWER(TRIM(p_email));

  -- Upsert the contact
  INSERT INTO contacts (
    user_id,
    email,
    name,
    avatar_url,
    google_resource_name,
    google_labels,
    is_google_starred,
    google_synced_at,
    import_source,
    needs_enrichment
  )
  VALUES (
    p_user_id,
    v_normalized_email,
    p_name,
    p_avatar_url,
    p_google_resource_name,
    p_google_labels,
    p_is_starred,
    NOW(),
    'google',
    TRUE  -- New contacts need enrichment
  )
  ON CONFLICT (user_id, email) DO UPDATE SET
    -- Update name only if we don't have one or Google has a better one
    name = COALESCE(NULLIF(contacts.name, ''), EXCLUDED.name, contacts.name),
    -- Always update Google-specific fields
    avatar_url = COALESCE(EXCLUDED.avatar_url, contacts.avatar_url),
    google_resource_name = COALESCE(EXCLUDED.google_resource_name, contacts.google_resource_name),
    google_labels = EXCLUDED.google_labels,
    is_google_starred = EXCLUDED.is_google_starred,
    google_synced_at = NOW(),
    -- Mark as Google import if it wasn't before
    import_source = CASE
      WHEN contacts.import_source = 'email' THEN 'email'  -- Keep email if already from email
      ELSE EXCLUDED.import_source
    END,
    updated_at = NOW()
  RETURNING id INTO v_contact_id;

  RETURN v_contact_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION upsert_google_contact IS
  'Upserts a contact from Google People API. Updates Google-specific fields while preserving email-derived data.';

-- ───────────────────────────────────────────────────────────────────────────────
-- Function: get_vip_suggestions
-- ───────────────────────────────────────────────────────────────────────────────
-- Returns contacts that should be suggested as VIPs during onboarding.
-- Prioritizes: Google starred > High email count > Recent communication
--
-- USAGE:
-- SELECT * FROM get_vip_suggestions('user-uuid', 15);

CREATE OR REPLACE FUNCTION get_vip_suggestions(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 15
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  email_count INTEGER,
  last_seen_at TIMESTAMPTZ,
  is_google_starred BOOLEAN,
  google_labels TEXT[],
  relationship_type TEXT,
  suggestion_reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.email,
    COALESCE(c.display_name, c.name) as name,
    c.avatar_url,
    c.email_count,
    c.last_seen_at,
    c.is_google_starred,
    c.google_labels,
    c.relationship_type,
    -- Explain why we're suggesting this contact
    CASE
      WHEN c.is_google_starred THEN 'Starred in Google Contacts'
      WHEN c.email_count >= 20 THEN 'Frequent communication (' || c.email_count || ' emails)'
      WHEN c.last_seen_at > NOW() - INTERVAL '7 days' THEN 'Recent communication'
      WHEN c.relationship_type = 'client' THEN 'Marked as client'
      WHEN c.relationship_type = 'colleague' THEN 'Marked as colleague'
      WHEN 'VIP' = ANY(c.google_labels) THEN 'In VIP group in Google'
      WHEN 'Work' = ANY(c.google_labels) THEN 'In Work group in Google'
      ELSE 'High engagement'
    END as suggestion_reason
  FROM contacts c
  WHERE c.user_id = p_user_id
    AND c.is_archived = FALSE
    AND c.is_muted = FALSE
    AND c.is_vip = FALSE  -- Don't suggest already-VIP contacts
    AND (
      -- Include if starred in Google
      c.is_google_starred = TRUE
      -- OR has significant email volume
      OR c.email_count >= 5
      -- OR has recent activity
      OR c.last_seen_at > NOW() - INTERVAL '30 days'
      -- OR is in important Google groups
      OR c.google_labels && ARRAY['VIP', 'Work', 'Important', 'Clients']
    )
  ORDER BY
    -- Starred contacts first
    c.is_google_starred DESC,
    -- Then by relationship importance
    CASE c.relationship_type
      WHEN 'client' THEN 1
      WHEN 'colleague' THEN 2
      ELSE 3
    END,
    -- Then by engagement (email count)
    c.email_count DESC,
    -- Then by recency
    c.last_seen_at DESC NULLS LAST
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_vip_suggestions IS
  'Returns contacts suggested as VIPs during onboarding. Prioritizes Google starred, high email count, and recent communication.';

-- ───────────────────────────────────────────────────────────────────────────────
-- Function: get_frequent_contacts
-- ───────────────────────────────────────────────────────────────────────────────
-- Returns the most frequently contacted people for onboarding display.
-- Different from VIP suggestions - this is purely based on email volume.
--
-- USAGE:
-- SELECT * FROM get_frequent_contacts('user-uuid', 20);

CREATE OR REPLACE FUNCTION get_frequent_contacts(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  email_count INTEGER,
  sent_count INTEGER,
  received_count INTEGER,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  relationship_type TEXT,
  is_vip BOOLEAN,
  is_google_starred BOOLEAN
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
    c.first_seen_at,
    c.last_seen_at,
    c.relationship_type,
    c.is_vip,
    c.is_google_starred
  FROM contacts c
  WHERE c.user_id = p_user_id
    AND c.is_archived = FALSE
    AND c.email_count >= 3  -- Minimum threshold
  ORDER BY c.email_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_frequent_contacts IS
  'Returns contacts ordered by email count. Used to show most frequent contacts during onboarding.';

-- ───────────────────────────────────────────────────────────────────────────────
-- Function: link_contact_alias
-- ───────────────────────────────────────────────────────────────────────────────
-- Links an alternative email to an existing contact.
-- Used when the same person uses multiple email addresses.
--
-- USAGE:
-- SELECT link_contact_alias('user-uuid', 'primary-contact-uuid', 'alt@email.com', 'manual');

CREATE OR REPLACE FUNCTION link_contact_alias(
  p_user_id UUID,
  p_primary_contact_id UUID,
  p_alias_email TEXT,
  p_created_via TEXT DEFAULT 'manual',
  p_confidence DECIMAL DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_alias_id UUID;
BEGIN
  INSERT INTO contact_aliases (
    user_id,
    primary_contact_id,
    alias_email,
    created_via,
    confidence
  )
  VALUES (
    p_user_id,
    p_primary_contact_id,
    LOWER(TRIM(p_alias_email)),
    p_created_via,
    p_confidence
  )
  ON CONFLICT (user_id, alias_email) DO UPDATE SET
    primary_contact_id = EXCLUDED.primary_contact_id,
    created_via = EXCLUDED.created_via,
    confidence = EXCLUDED.confidence
  RETURNING id INTO v_alias_id;

  RETURN v_alias_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION link_contact_alias IS
  'Links an alternative email address to a primary contact. Enables unified contact view across email addresses.';

-- ───────────────────────────────────────────────────────────────────────────────
-- Function: find_contact_by_email
-- ───────────────────────────────────────────────────────────────────────────────
-- Finds a contact by email, checking both primary emails and aliases.
-- Returns the primary contact for aliased emails.
--
-- USAGE:
-- SELECT * FROM find_contact_by_email('user-uuid', 'john@example.com');

CREATE OR REPLACE FUNCTION find_contact_by_email(
  p_user_id UUID,
  p_email TEXT
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  name TEXT,
  is_alias BOOLEAN
) AS $$
DECLARE
  v_normalized_email TEXT;
BEGIN
  v_normalized_email := LOWER(TRIM(p_email));

  -- First check direct email match
  RETURN QUERY
  SELECT
    c.id,
    c.email,
    COALESCE(c.display_name, c.name) as name,
    FALSE as is_alias
  FROM contacts c
  WHERE c.user_id = p_user_id
    AND c.email = v_normalized_email
  LIMIT 1;

  -- If no direct match, check aliases
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      c.id,
      c.email,
      COALESCE(c.display_name, c.name) as name,
      TRUE as is_alias
    FROM contact_aliases ca
    JOIN contacts c ON ca.primary_contact_id = c.id
    WHERE ca.user_id = p_user_id
      AND ca.alias_email = v_normalized_email
    LIMIT 1;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION find_contact_by_email IS
  'Finds a contact by email, checking both primary emails and aliases. Returns the primary contact for aliased emails.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 6: Add Google Contacts sync status to gmail_accounts
-- ═══════════════════════════════════════════════════════════════════════════════
-- Track whether contacts have been imported from each Gmail account

ALTER TABLE gmail_accounts ADD COLUMN IF NOT EXISTS contacts_synced_at TIMESTAMPTZ;
ALTER TABLE gmail_accounts ADD COLUMN IF NOT EXISTS contacts_sync_enabled BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN gmail_accounts.contacts_synced_at IS
  'When Google Contacts were last imported from this account. NULL if never synced.';

COMMENT ON COLUMN gmail_accounts.contacts_sync_enabled IS
  'Whether to sync contacts from this Gmail account. Requires contacts.readonly scope.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION COMPLETE
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- NEXT STEPS FOR DEVELOPERS:
-- 1. Add contacts.readonly scope to Google OAuth configuration
-- 2. Create Google People API service in src/lib/google/people-service.ts
-- 3. Add VIP suggestions step to onboarding wizard
-- 4. Update email processor to use find_contact_by_email for alias support
--
-- USAGE NOTES:
-- - Use upsert_google_contact() when importing from Google People API
-- - Use get_vip_suggestions() during onboarding to suggest VIPs
-- - Use find_contact_by_email() when linking emails to contacts (handles aliases)
-- - Use link_contact_alias() when user identifies same person with different emails
