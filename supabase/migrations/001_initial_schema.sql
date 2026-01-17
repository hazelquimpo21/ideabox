-- =============================================================================
-- IdeaBox Migration 001: Initial Schema
-- =============================================================================
-- Creates the foundational tables for user profiles and Gmail accounts.
--
-- TABLES CREATED:
--   - user_profiles: App-specific user data (extends Supabase auth.users)
--   - gmail_accounts: Multiple Gmail accounts per user with OAuth tokens
--
-- RUN ORDER: This must be the first migration applied.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- user_profiles: Extends Supabase auth.users with app-specific data
-- -----------------------------------------------------------------------------
-- WHY SEPARATE FROM auth.users?
--   Supabase auth.users is managed by Supabase Auth and has limited columns.
--   user_profiles stores our app-specific preferences and state.
-- -----------------------------------------------------------------------------
CREATE TABLE user_profiles (
  -- Primary key matches auth.users.id for 1:1 relationship
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Basic info (synced from Google OAuth on first login)
  email TEXT NOT NULL,
  full_name TEXT,

  -- Timezone auto-detected from browser on signup
  -- Used for displaying dates and scheduling
  timezone TEXT DEFAULT 'America/Chicago',

  -- Onboarding state
  -- Set to TRUE after user completes initial setup flow
  onboarding_completed BOOLEAN DEFAULT FALSE,

  -- User preferences
  default_view TEXT DEFAULT 'inbox', -- inbox, clients, actions
  emails_per_page INTEGER DEFAULT 50,

  -- Timestamps for auditing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for email lookups (used when matching Gmail senders)
CREATE INDEX idx_user_profiles_email ON user_profiles(email);

-- Enable Row Level Security
-- Users can only see/modify their own profile
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- gmail_accounts: Multiple Gmail accounts per user
-- -----------------------------------------------------------------------------
-- WHY SUPPORT MULTIPLE ACCOUNTS?
--   Target users (like Hazel) manage multiple Gmail accounts for
--   different clients/projects. IdeaBox unifies them all.
--
-- SECURITY NOTE:
--   OAuth tokens are stored here. Supabase encrypts data at rest,
--   but be mindful of access patterns.
-- -----------------------------------------------------------------------------
CREATE TABLE gmail_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owner of this Gmail account
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Gmail account info
  email TEXT NOT NULL,
  display_name TEXT,

  -- OAuth 2.0 tokens (from Google OAuth flow)
  -- access_token: Short-lived token for API calls
  -- refresh_token: Long-lived token to get new access tokens
  -- token_expiry: When access_token expires (refresh before this)
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMPTZ NOT NULL,

  -- Sync state for incremental email fetching
  -- last_sync_at: When we last synced this account
  -- last_history_id: Gmail's history ID for incremental sync (very important!)
  last_sync_at TIMESTAMPTZ,
  last_history_id TEXT,

  -- Whether to include this account in hourly sync
  sync_enabled BOOLEAN DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each user can only connect a Gmail account once
  UNIQUE(user_id, email)
);

-- Indexes for common queries
CREATE INDEX idx_gmail_accounts_user_id ON gmail_accounts(user_id);
CREATE INDEX idx_gmail_accounts_sync ON gmail_accounts(sync_enabled, last_sync_at);

-- Enable Row Level Security
ALTER TABLE gmail_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own Gmail accounts"
  ON gmail_accounts FOR ALL
  USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- Trigger: Auto-update updated_at timestamp
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_gmail_accounts_updated_at
  BEFORE UPDATE ON gmail_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
