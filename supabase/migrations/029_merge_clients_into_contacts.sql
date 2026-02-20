-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 029: Merge Clients into Contacts
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Phase 3 of the Navigation Redesign: Unifies the clients and contacts tables
-- by adding client-specific columns to contacts, migrating existing client data,
-- and adding contact_id references to emails and actions.
--
-- This migration does NOT drop the clients table or client_id columns.
-- That cleanup is deferred to Phase 4 after production validation.
--
-- Steps:
--   1. Add client columns to contacts table
--   2. Migrate existing client data into contacts
--   3. Add contact_id to emails and actions tables
--
-- Risk: Low-Medium (all changes are additive, reversible)
-- Rollback: Drop new columns (clients table is preserved)
--
-- @since February 2026
-- @see NAVIGATION_REDESIGN_PLAN.md § "Database Migrations"
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Add client columns to contacts table
-- ─────────────────────────────────────────────────────────────────────────────
-- These columns allow any contact to optionally carry client-specific data.
-- is_client = TRUE marks the contact as a business client.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_client BOOLEAN DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS client_status TEXT CHECK (client_status IN ('active', 'inactive', 'archived'));
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS client_priority TEXT CHECK (client_priority IN ('vip', 'high', 'medium', 'low'));
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_domains TEXT[];
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS keywords TEXT[];

-- Indexes for efficient client-specific queries
CREATE INDEX IF NOT EXISTS idx_contacts_is_client ON contacts(user_id, is_client) WHERE is_client = TRUE;
CREATE INDEX IF NOT EXISTS idx_contacts_client_status ON contacts(user_id, client_status) WHERE is_client = TRUE;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Migrate existing client data into contacts
-- ─────────────────────────────────────────────────────────────────────────────
-- Two-part migration:
--   A) Update existing contacts that match a client by email
--   B) Insert new contacts for clients with no matching contact
-- ─────────────────────────────────────────────────────────────────────────────

-- Part A: Update existing contacts that match a client by email
UPDATE contacts c
SET
  is_client = TRUE,
  client_status = cl.status,
  client_priority = cl.priority,
  email_domains = cl.email_domains,
  keywords = cl.keywords,
  company = COALESCE(c.company, cl.company),
  name = COALESCE(c.name, cl.name),
  notes = CASE
    WHEN c.notes IS NOT NULL AND cl.notes IS NOT NULL
    THEN c.notes || E'\n---\n' || cl.notes
    ELSE COALESCE(c.notes, cl.notes)
  END,
  relationship_type = 'client',
  is_vip = CASE WHEN cl.priority = 'vip' THEN TRUE ELSE c.is_vip END
FROM clients cl
WHERE c.user_id = cl.user_id AND c.email = cl.email;

-- Part B: Create contacts for clients with no matching contact
INSERT INTO contacts (
  user_id, email, name, company, is_client, client_status,
  client_priority, email_domains, keywords, notes,
  relationship_type, is_vip, import_source
)
SELECT
  cl.user_id,
  COALESCE(cl.email, 'client-' || cl.id || '@placeholder.local'),
  cl.name,
  cl.company,
  TRUE,
  cl.status,
  cl.priority,
  cl.email_domains,
  cl.keywords,
  cl.notes,
  'client',
  (cl.priority = 'vip'),
  'manual'
FROM clients cl
WHERE NOT EXISTS (
  SELECT 1 FROM contacts c WHERE c.user_id = cl.user_id AND c.email = cl.email
);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Add contact_id to emails and actions tables
-- ─────────────────────────────────────────────────────────────────────────────
-- These columns provide a direct FK link from emails/actions to the unified
-- contacts table. During Phase 3, both client_id and contact_id coexist.
-- Phase 4 will drop client_id after validation.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE emails ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id);
ALTER TABLE actions ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id);

-- Populate contact_id from the client_id mapping
-- Maps emails.client_id → clients.email → contacts.email → contacts.id
UPDATE emails e
SET contact_id = c.id
FROM contacts c
JOIN clients cl ON c.user_id = cl.user_id AND c.email = cl.email
WHERE e.client_id = cl.id AND e.contact_id IS NULL;

-- Same mapping for actions
UPDATE actions a
SET contact_id = c.id
FROM contacts c
JOIN clients cl ON c.user_id = cl.user_id AND c.email = cl.email
WHERE a.client_id = cl.id AND a.contact_id IS NULL;

-- Indexes for contact_id lookups
CREATE INDEX IF NOT EXISTS idx_emails_contact_id ON emails(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_actions_contact_id ON actions(contact_id) WHERE contact_id IS NOT NULL;
