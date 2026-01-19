-- User Context Table
-- Stores foundational user information for personalized AI analysis.
-- This data is collected during onboarding and injected into AI prompts.
--
-- See docs/ENHANCED_EMAIL_INTELLIGENCE.md for full documentation.

-- ═══════════════════════════════════════════════════════════════════════════════
-- USER CONTEXT TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE user_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- ═══════════════════════════════════════════════════════════════════════════
  -- Professional Identity
  -- ═══════════════════════════════════════════════════════════════════════════
  role TEXT,                    -- "Developer", "Entrepreneur", "Manager", etc.
  company TEXT,                 -- "Self-employed", "Acme Corp", etc.
  industry TEXT,                -- "Tech", "Healthcare", "Education", etc.

  -- ═══════════════════════════════════════════════════════════════════════════
  -- Location (for event relevance scoring)
  -- ═══════════════════════════════════════════════════════════════════════════
  location_city TEXT,           -- "Shorewood, WI"
  location_metro TEXT,          -- "Milwaukee metro"

  -- ═══════════════════════════════════════════════════════════════════════════
  -- Priorities and Projects
  -- ═══════════════════════════════════════════════════════════════════════════
  priorities TEXT[],            -- ['Client work', 'Family', 'Learning'] - ordered by importance
  projects TEXT[],              -- ['PodcastPipeline', 'IdeaBox'] - for project tagging

  -- ═══════════════════════════════════════════════════════════════════════════
  -- VIP Contacts (for priority scoring)
  -- ═══════════════════════════════════════════════════════════════════════════
  vip_emails TEXT[],            -- ['boss@company.com', 'bigclient@corp.com']
  vip_domains TEXT[],           -- ['@importantclient.com', '@vip-company.com']

  -- ═══════════════════════════════════════════════════════════════════════════
  -- Interests (for content relevance)
  -- ═══════════════════════════════════════════════════════════════════════════
  interests TEXT[],             -- ['AI', 'TypeScript', 'local events']

  -- ═══════════════════════════════════════════════════════════════════════════
  -- Family Context (for personal category enhancement)
  -- ═══════════════════════════════════════════════════════════════════════════
  family_context JSONB DEFAULT '{}',  -- {"spouse_name": "Kim", "kids_count": 2, "family_names": ["Mom", "Dad"]}

  -- ═══════════════════════════════════════════════════════════════════════════
  -- Work Schedule (for time-aware prioritization)
  -- ═══════════════════════════════════════════════════════════════════════════
  work_hours_start TIME DEFAULT '09:00',
  work_hours_end TIME DEFAULT '17:00',
  work_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5],  -- 0=Sun, 1=Mon, ..., 6=Sat

  -- ═══════════════════════════════════════════════════════════════════════════
  -- Onboarding State
  -- ═══════════════════════════════════════════════════════════════════════════
  onboarding_completed BOOLEAN DEFAULT FALSE,
  onboarding_completed_at TIMESTAMPTZ,
  onboarding_step INTEGER DEFAULT 0,  -- 0-7 for each step

  -- ═══════════════════════════════════════════════════════════════════════════
  -- Metadata
  -- ═══════════════════════════════════════════════════════════════════════════
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);

-- Indexes
CREATE INDEX idx_user_context_user_id ON user_context(user_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE user_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own context"
  ON user_context FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own context"
  ON user_context FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own context"
  ON user_context FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at timestamp
CREATE TRIGGER update_user_context_updated_at
  BEFORE UPDATE ON user_context
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- AUTO-CREATE CONTEXT FOR NEW USERS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Create default context when user profile is created
CREATE OR REPLACE FUNCTION create_default_user_context()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_context (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on user_profiles insert
CREATE TRIGGER on_user_profile_created_context
  AFTER INSERT ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION create_default_user_context();

-- ═══════════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Check if an email is from a VIP contact
CREATE OR REPLACE FUNCTION is_vip_email(p_user_id UUID, p_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_context user_context%ROWTYPE;
  v_domain TEXT;
BEGIN
  -- Get user context
  SELECT * INTO v_context FROM user_context WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Check exact email match
  IF p_email = ANY(v_context.vip_emails) THEN
    RETURN TRUE;
  END IF;

  -- Check domain match (extract domain from email)
  v_domain := '@' || split_part(p_email, '@', 2);
  IF v_domain = ANY(v_context.vip_domains) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user's active projects (for client tagger)
CREATE OR REPLACE FUNCTION get_user_projects(p_user_id UUID)
RETURNS TEXT[] AS $$
DECLARE
  v_projects TEXT[];
BEGIN
  SELECT projects INTO v_projects
  FROM user_context
  WHERE user_id = p_user_id;

  RETURN COALESCE(v_projects, ARRAY[]::TEXT[]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user has completed onboarding
CREATE OR REPLACE FUNCTION has_completed_onboarding(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_context
    WHERE user_id = p_user_id
    AND onboarding_completed = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
