-- User Settings Table
-- Stores user preferences for AI analysis, notifications, and sync behavior
-- Separate from user_profiles to keep concerns separated

CREATE TABLE user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- ═══════════════════════════════════════════════════════════════════════════
  -- AI Analysis Settings
  -- ═══════════════════════════════════════════════════════════════════════════
  auto_analyze BOOLEAN DEFAULT TRUE,           -- Auto-analyze new emails on sync
  extract_actions BOOLEAN DEFAULT TRUE,        -- Run action extractor analyzer
  categorize_emails BOOLEAN DEFAULT TRUE,      -- Run categorizer analyzer
  detect_clients BOOLEAN DEFAULT TRUE,         -- Run client tagger analyzer

  -- Analysis limits (for cost control)
  initial_sync_email_count INTEGER DEFAULT 50, -- How many emails to analyze on first sync (25/50/100)
  max_emails_per_sync INTEGER DEFAULT 100,     -- Max emails to fetch per sync
  max_analysis_per_sync INTEGER DEFAULT 50,    -- Max emails to analyze per sync

  -- ═══════════════════════════════════════════════════════════════════════════
  -- Cost Control Settings
  -- ═══════════════════════════════════════════════════════════════════════════
  daily_cost_limit DECIMAL(10, 4) DEFAULT 1.00,    -- Daily cost limit in USD
  monthly_cost_limit DECIMAL(10, 4) DEFAULT 10.00, -- Monthly cost limit in USD
  cost_alert_threshold DECIMAL(10, 4) DEFAULT 0.80, -- Alert when 80% of limit reached
  pause_on_limit_reached BOOLEAN DEFAULT FALSE,     -- Pause analysis when limit reached

  -- ═══════════════════════════════════════════════════════════════════════════
  -- Notification Settings
  -- ═══════════════════════════════════════════════════════════════════════════
  email_digest_enabled BOOLEAN DEFAULT TRUE,
  email_digest_frequency TEXT DEFAULT 'daily', -- 'daily', 'weekly', 'never'
  action_reminders BOOLEAN DEFAULT TRUE,
  new_client_alerts BOOLEAN DEFAULT TRUE,
  sync_error_alerts BOOLEAN DEFAULT TRUE,
  cost_limit_alerts BOOLEAN DEFAULT TRUE,

  -- ═══════════════════════════════════════════════════════════════════════════
  -- Metadata
  -- ═══════════════════════════════════════════════════════════════════════════
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);

-- Index for user lookup
CREATE INDEX idx_user_settings_user_id ON user_settings(user_id);

-- RLS Policies
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settings"
  ON user_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON user_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at timestamp
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to create default settings for new users
CREATE OR REPLACE FUNCTION create_default_user_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create settings when a user profile is created
CREATE TRIGGER on_user_profile_created
  AFTER INSERT ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION create_default_user_settings();

-- ═══════════════════════════════════════════════════════════════════════════
-- Helper Functions for Cost Tracking
-- ═══════════════════════════════════════════════════════════════════════════

-- Check if user is within daily cost limit
CREATE OR REPLACE FUNCTION is_within_daily_limit(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_daily_cost DECIMAL;
  v_daily_limit DECIMAL;
BEGIN
  -- Get user's daily limit
  SELECT daily_cost_limit INTO v_daily_limit
  FROM user_settings
  WHERE user_id = p_user_id;

  -- Get today's cost
  v_daily_cost := get_daily_api_cost(p_user_id, CURRENT_DATE);

  RETURN v_daily_cost < COALESCE(v_daily_limit, 1.00);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is within monthly cost limit
CREATE OR REPLACE FUNCTION is_within_monthly_limit(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_monthly_cost DECIMAL;
  v_monthly_limit DECIMAL;
BEGIN
  -- Get user's monthly limit
  SELECT monthly_cost_limit INTO v_monthly_limit
  FROM user_settings
  WHERE user_id = p_user_id;

  -- Get this month's cost
  v_monthly_cost := get_monthly_api_cost(p_user_id, DATE_TRUNC('month', CURRENT_DATE)::DATE);

  RETURN v_monthly_cost < COALESCE(v_monthly_limit, 10.00);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user's cost usage summary
CREATE OR REPLACE FUNCTION get_cost_usage_summary(p_user_id UUID)
RETURNS TABLE (
  daily_cost DECIMAL,
  daily_limit DECIMAL,
  daily_percent DECIMAL,
  monthly_cost DECIMAL,
  monthly_limit DECIMAL,
  monthly_percent DECIMAL,
  is_paused BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    get_daily_api_cost(p_user_id, CURRENT_DATE) as daily_cost,
    COALESCE(us.daily_cost_limit, 1.00) as daily_limit,
    ROUND(get_daily_api_cost(p_user_id, CURRENT_DATE) / COALESCE(us.daily_cost_limit, 1.00) * 100, 2) as daily_percent,
    get_monthly_api_cost(p_user_id, DATE_TRUNC('month', CURRENT_DATE)::DATE) as monthly_cost,
    COALESCE(us.monthly_cost_limit, 10.00) as monthly_limit,
    ROUND(get_monthly_api_cost(p_user_id, DATE_TRUNC('month', CURRENT_DATE)::DATE) / COALESCE(us.monthly_cost_limit, 10.00) * 100, 2) as monthly_percent,
    COALESCE(us.pause_on_limit_reached, FALSE) as is_paused
  FROM user_settings us
  WHERE us.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
