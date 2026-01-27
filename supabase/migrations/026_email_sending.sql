-- ═══════════════════════════════════════════════════════════════════════════════
-- EMAIL SENDING SYSTEM
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Enables sending emails directly through users' Gmail accounts via Gmail API.
-- Includes support for:
--   - Single email sending & scheduling
--   - Open tracking via transparent 1x1 pixel
--   - Mail merge campaigns with throttling
--   - Reusable email templates with merge fields
--   - Follow-up automation based on opens/replies
--   - Rate limiting (400 emails/day per user)
--
-- See docs/GMAIL_SENDING_IMPLEMENTATION.md for full documentation.
--
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- EMAIL TEMPLATES TABLE
-- ═══════════════════════════════════════════════════════════════════════════════
-- Reusable email templates with merge field support.
-- Merge fields use {{field_name}} syntax (e.g., {{first_name}}, {{company}}).

CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- ─────────────────────────────────────────────────────────────────────────────
  -- Template Identity
  -- ─────────────────────────────────────────────────────────────────────────────
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,  -- e.g., 'follow_up', 'introduction', 'outreach', 'thank_you'

  -- ─────────────────────────────────────────────────────────────────────────────
  -- Template Content
  -- Supports merge tags: {{first_name}}, {{last_name}}, {{email}}, {{company}}, etc.
  -- ─────────────────────────────────────────────────────────────────────────────
  subject_template TEXT NOT NULL,
  body_html_template TEXT NOT NULL,
  body_text_template TEXT,

  -- Available merge fields for UI display and validation
  merge_fields TEXT[] DEFAULT ARRAY['first_name', 'last_name', 'email', 'company'],

  -- ─────────────────────────────────────────────────────────────────────────────
  -- Usage Statistics
  -- ─────────────────────────────────────────────────────────────────────────────
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  -- ─────────────────────────────────────────────────────────────────────────────
  -- Metadata
  -- ─────────────────────────────────────────────────────────────────────────────
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- EMAIL CAMPAIGNS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════
-- Mail merge / bulk sending campaigns with throttling support.
-- Sends emails at configurable intervals (default 25 seconds) to avoid spam filters.

CREATE TABLE email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_account_id UUID NOT NULL REFERENCES gmail_accounts(id) ON DELETE CASCADE,

  -- ─────────────────────────────────────────────────────────────────────────────
  -- Campaign Identity
  -- ─────────────────────────────────────────────────────────────────────────────
  name TEXT NOT NULL,
  description TEXT,

  -- ─────────────────────────────────────────────────────────────────────────────
  -- Template Content (inline or from saved template)
  -- Can either define templates inline or reference a saved template.
  -- Supports merge tags: {{first_name}}, {{last_name}}, {{email}}, {{company}}, etc.
  -- ─────────────────────────────────────────────────────────────────────────────
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  subject_template TEXT NOT NULL,
  body_html_template TEXT NOT NULL,
  body_text_template TEXT,

  -- ─────────────────────────────────────────────────────────────────────────────
  -- Recipients
  -- Array of recipient objects with email and merge field values.
  -- Format: [{"email": "...", "first_name": "...", "company": "...", ...}]
  -- ─────────────────────────────────────────────────────────────────────────────
  recipients JSONB NOT NULL DEFAULT '[]',

  -- ─────────────────────────────────────────────────────────────────────────────
  -- Campaign Status
  -- ─────────────────────────────────────────────────────────────────────────────
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'in_progress', 'paused', 'completed', 'cancelled')),

  -- ─────────────────────────────────────────────────────────────────────────────
  -- Scheduling & Throttling
  -- ─────────────────────────────────────────────────────────────────────────────
  scheduled_at TIMESTAMPTZ,           -- When campaign should start (NULL = manual start)
  throttle_seconds INTEGER DEFAULT 25, -- Delay between sends (25 sec = ~140/hour)

  -- ─────────────────────────────────────────────────────────────────────────────
  -- Progress Tracking
  -- ─────────────────────────────────────────────────────────────────────────────
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  open_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  current_index INTEGER DEFAULT 0,    -- For resuming paused campaigns

  -- ─────────────────────────────────────────────────────────────────────────────
  -- Follow-up Settings (applies to all campaign emails)
  -- ─────────────────────────────────────────────────────────────────────────────
  follow_up_enabled BOOLEAN DEFAULT FALSE,
  follow_up_condition TEXT CHECK (follow_up_condition IN ('no_open', 'no_reply', 'both')),
  follow_up_delay_hours INTEGER DEFAULT 48,
  follow_up_subject TEXT,
  follow_up_body_html TEXT,

  -- ─────────────────────────────────────────────────────────────────────────────
  -- Timestamps
  -- ─────────────────────────────────────────────────────────────────────────────
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  last_send_at TIMESTAMPTZ,           -- Track for throttling
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- OUTBOUND EMAILS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════
-- Tracks all outbound emails: drafts, scheduled, sent, and failed.
-- Central table for email sending, tracking, and follow-up automation.

CREATE TABLE outbound_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ─────────────────────────────────────────────────────────────────────────────
  -- Ownership
  -- ─────────────────────────────────────────────────────────────────────────────
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_account_id UUID NOT NULL REFERENCES gmail_accounts(id) ON DELETE CASCADE,

  -- ─────────────────────────────────────────────────────────────────────────────
  -- Optional Associations
  -- ─────────────────────────────────────────────────────────────────────────────
  campaign_id UUID REFERENCES email_campaigns(id) ON DELETE SET NULL,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,

  -- ─────────────────────────────────────────────────────────────────────────────
  -- Recipients
  -- ─────────────────────────────────────────────────────────────────────────────
  to_email TEXT NOT NULL,
  to_name TEXT,
  cc_emails TEXT[],
  bcc_emails TEXT[],
  reply_to TEXT,

  -- ─────────────────────────────────────────────────────────────────────────────
  -- Email Content
  -- ─────────────────────────────────────────────────────────────────────────────
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,

  -- ─────────────────────────────────────────────────────────────────────────────
  -- Gmail Integration
  -- Populated after successful send with Gmail's message/thread IDs.
  -- ─────────────────────────────────────────────────────────────────────────────
  gmail_message_id TEXT,              -- Gmail's message ID after sending
  gmail_thread_id TEXT,               -- Thread ID for conversation tracking
  in_reply_to TEXT,                   -- Message-ID this is replying to (for threads)
  references_header TEXT,             -- References header for threading

  -- ─────────────────────────────────────────────────────────────────────────────
  -- Status & Scheduling
  -- ─────────────────────────────────────────────────────────────────────────────
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'queued', 'sending', 'sent', 'failed', 'cancelled')),
  scheduled_at TIMESTAMPTZ,           -- When to send (NULL = immediate when triggered)
  sent_at TIMESTAMPTZ,                -- When actually sent

  -- ─────────────────────────────────────────────────────────────────────────────
  -- Open Tracking
  -- Each email gets a unique tracking_id for the tracking pixel URL.
  -- ─────────────────────────────────────────────────────────────────────────────
  tracking_id UUID UNIQUE DEFAULT gen_random_uuid(),
  tracking_enabled BOOLEAN DEFAULT TRUE,
  open_count INTEGER DEFAULT 0,
  first_opened_at TIMESTAMPTZ,
  last_opened_at TIMESTAMPTZ,

  -- ─────────────────────────────────────────────────────────────────────────────
  -- Reply Tracking
  -- Updated when inbound email sync detects a reply via In-Reply-To header.
  -- ─────────────────────────────────────────────────────────────────────────────
  has_reply BOOLEAN DEFAULT FALSE,
  reply_received_at TIMESTAMPTZ,
  reply_email_id UUID,                -- Reference to the reply in emails table

  -- ─────────────────────────────────────────────────────────────────────────────
  -- Follow-up Configuration
  -- When enabled, system creates follow-up email if condition is met.
  -- ─────────────────────────────────────────────────────────────────────────────
  follow_up_enabled BOOLEAN DEFAULT FALSE,
  follow_up_condition TEXT CHECK (follow_up_condition IN ('no_open', 'no_reply', 'both')),
  follow_up_delay_hours INTEGER DEFAULT 48,
  follow_up_email_id UUID REFERENCES outbound_emails(id) ON DELETE SET NULL,
  follow_up_sent BOOLEAN DEFAULT FALSE,

  -- ─────────────────────────────────────────────────────────────────────────────
  -- Error Handling
  -- ─────────────────────────────────────────────────────────────────────────────
  error_message TEXT,
  error_code TEXT,                    -- e.g., 'QUOTA_EXCEEDED', 'INVALID_RECIPIENT'
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_retry_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,

  -- ─────────────────────────────────────────────────────────────────────────────
  -- Metadata
  -- ─────────────────────────────────────────────────────────────────────────────
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- EMAIL OPEN EVENTS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════
-- Detailed tracking of email opens via tracking pixel.
-- Captures timestamp, IP (for geo), and user agent (for device/client detection).

CREATE TABLE email_open_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbound_email_id UUID NOT NULL REFERENCES outbound_emails(id) ON DELETE CASCADE,

  -- ─────────────────────────────────────────────────────────────────────────────
  -- Event Data
  -- ─────────────────────────────────────────────────────────────────────────────
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,

  -- ─────────────────────────────────────────────────────────────────────────────
  -- Derived Data (parsed from IP/user agent)
  -- ─────────────────────────────────────────────────────────────────────────────
  country TEXT,
  city TEXT,
  device_type TEXT,                   -- 'desktop', 'mobile', 'tablet'
  email_client TEXT,                  -- 'gmail', 'outlook', 'apple_mail', etc.

  -- ─────────────────────────────────────────────────────────────────────────────
  -- Deduplication
  -- Hash of IP + user_agent to identify unique opens vs. reloads.
  -- ─────────────────────────────────────────────────────────────────────────────
  fingerprint TEXT
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- DAILY SEND QUOTAS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════
-- Tracks daily email send counts per user for rate limiting.
-- Default limit: 400 emails/day (safe for standard Gmail accounts).

CREATE TABLE daily_send_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  emails_sent INTEGER DEFAULT 0,
  quota_limit INTEGER DEFAULT 400,

  UNIQUE(user_id, date)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ALTER GMAIL ACCOUNTS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════
-- Add columns to track send scope authorization.

ALTER TABLE gmail_accounts
  ADD COLUMN IF NOT EXISTS has_send_scope BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS send_scope_granted_at TIMESTAMPTZ;

-- ═══════════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Email templates indexes
CREATE INDEX idx_email_templates_user_id ON email_templates(user_id);
CREATE INDEX idx_email_templates_category ON email_templates(user_id, category);

-- Email campaigns indexes
CREATE INDEX idx_email_campaigns_user_id ON email_campaigns(user_id);
CREATE INDEX idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX idx_email_campaigns_scheduled ON email_campaigns(status, scheduled_at)
  WHERE status = 'scheduled';
CREATE INDEX idx_email_campaigns_in_progress ON email_campaigns(status, last_send_at)
  WHERE status = 'in_progress';

-- Outbound emails indexes
CREATE INDEX idx_outbound_emails_user_id ON outbound_emails(user_id);
CREATE INDEX idx_outbound_emails_gmail_account ON outbound_emails(gmail_account_id);
CREATE INDEX idx_outbound_emails_campaign ON outbound_emails(campaign_id)
  WHERE campaign_id IS NOT NULL;
CREATE INDEX idx_outbound_emails_status ON outbound_emails(status);
CREATE INDEX idx_outbound_emails_scheduled ON outbound_emails(status, scheduled_at)
  WHERE status = 'scheduled';
CREATE INDEX idx_outbound_emails_tracking ON outbound_emails(tracking_id);
CREATE INDEX idx_outbound_emails_gmail_message ON outbound_emails(gmail_message_id)
  WHERE gmail_message_id IS NOT NULL;
CREATE INDEX idx_outbound_emails_follow_up ON outbound_emails(follow_up_enabled, follow_up_sent, sent_at)
  WHERE follow_up_enabled = TRUE AND follow_up_sent = FALSE;

-- Email open events indexes
CREATE INDEX idx_email_open_events_email ON email_open_events(outbound_email_id);
CREATE INDEX idx_email_open_events_fingerprint ON email_open_events(outbound_email_id, fingerprint);

-- Daily send quotas indexes
CREATE INDEX idx_daily_send_quotas_lookup ON daily_send_quotas(user_id, date);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════════

-- Email templates RLS
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own templates"
  ON email_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own templates"
  ON email_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own templates"
  ON email_templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own templates"
  ON email_templates FOR DELETE
  USING (auth.uid() = user_id);

-- Email campaigns RLS
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own campaigns"
  ON email_campaigns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own campaigns"
  ON email_campaigns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own campaigns"
  ON email_campaigns FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own campaigns"
  ON email_campaigns FOR DELETE
  USING (auth.uid() = user_id);

-- Outbound emails RLS
ALTER TABLE outbound_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own outbound emails"
  ON outbound_emails FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own outbound emails"
  ON outbound_emails FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own outbound emails"
  ON outbound_emails FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own outbound emails"
  ON outbound_emails FOR DELETE
  USING (auth.uid() = user_id);

-- Email open events RLS (read via outbound_emails join)
ALTER TABLE email_open_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view open events for own emails"
  ON email_open_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM outbound_emails
      WHERE outbound_emails.id = email_open_events.outbound_email_id
        AND outbound_emails.user_id = auth.uid()
    )
  );

-- Note: Insert policy for email_open_events allows tracking pixel endpoint
-- This is handled by service role in the API route
CREATE POLICY "Service role can insert open events"
  ON email_open_events FOR INSERT
  WITH CHECK (true);

-- Daily send quotas RLS
ALTER TABLE daily_send_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own quotas"
  ON daily_send_quotas FOR SELECT
  USING (auth.uid() = user_id);

-- Quota updates handled by service role functions

-- ═══════════════════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Auto-update updated_at timestamps
CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_campaigns_updated_at
  BEFORE UPDATE ON email_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_outbound_emails_updated_at
  BEFORE UPDATE ON outbound_emails
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- can_send_email: Check if user has quota remaining for today
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns TRUE if user can send more emails, FALSE if at daily limit.
-- Used by API routes and background jobs before attempting to send.

CREATE OR REPLACE FUNCTION can_send_email(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_sent INTEGER;
  v_limit INTEGER;
BEGIN
  SELECT COALESCE(emails_sent, 0), COALESCE(quota_limit, 400)
  INTO v_sent, v_limit
  FROM daily_send_quotas
  WHERE user_id = p_user_id AND date = CURRENT_DATE;

  -- No record means 0 sent today
  IF v_sent IS NULL THEN
    RETURN TRUE;
  END IF;

  RETURN v_sent < v_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- increment_send_count: Increment daily send counter
-- ─────────────────────────────────────────────────────────────────────────────
-- Atomically increments send count and returns FALSE if at limit.
-- Uses upsert to handle first email of the day.

CREATE OR REPLACE FUNCTION increment_send_count(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_can_send BOOLEAN;
BEGIN
  v_can_send := can_send_email(p_user_id);

  IF NOT v_can_send THEN
    RETURN FALSE;
  END IF;

  INSERT INTO daily_send_quotas (user_id, date, emails_sent)
  VALUES (p_user_id, CURRENT_DATE, 1)
  ON CONFLICT (user_id, date) DO UPDATE
  SET emails_sent = daily_send_quotas.emails_sent + 1;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_remaining_quota: Get remaining emails for today
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns number of emails user can still send today.

CREATE OR REPLACE FUNCTION get_remaining_quota(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_sent INTEGER;
  v_limit INTEGER;
BEGIN
  SELECT COALESCE(emails_sent, 0), COALESCE(quota_limit, 400)
  INTO v_sent, v_limit
  FROM daily_send_quotas
  WHERE user_id = p_user_id AND date = CURRENT_DATE;

  IF v_sent IS NULL THEN
    RETURN 400;  -- Default limit
  END IF;

  RETURN GREATEST(v_limit - v_sent, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_scheduled_emails_to_send: Get emails due for sending
-- ─────────────────────────────────────────────────────────────────────────────
-- Used by background job to fetch scheduled emails that are due.
-- Only returns emails for users who have quota remaining.

CREATE OR REPLACE FUNCTION get_scheduled_emails_to_send(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  gmail_account_id UUID,
  to_email TEXT,
  to_name TEXT,
  cc_emails TEXT[],
  bcc_emails TEXT[],
  reply_to TEXT,
  subject TEXT,
  body_html TEXT,
  body_text TEXT,
  in_reply_to TEXT,
  references_header TEXT,
  tracking_id UUID,
  tracking_enabled BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.user_id,
    e.gmail_account_id,
    e.to_email,
    e.to_name,
    e.cc_emails,
    e.bcc_emails,
    e.reply_to,
    e.subject,
    e.body_html,
    e.body_text,
    e.in_reply_to,
    e.references_header,
    e.tracking_id,
    e.tracking_enabled
  FROM outbound_emails e
  WHERE e.status = 'scheduled'
    AND e.scheduled_at <= NOW()
    AND can_send_email(e.user_id)
  ORDER BY e.scheduled_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- record_email_open: Record tracking pixel hit
-- ─────────────────────────────────────────────────────────────────────────────
-- Called by tracking endpoint when pixel is loaded.
-- Updates open stats on outbound_emails and creates detailed event record.

CREATE OR REPLACE FUNCTION record_email_open(
  p_tracking_id UUID,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_country TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_device_type TEXT DEFAULT NULL,
  p_email_client TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_email_id UUID;
  v_fingerprint TEXT;
  v_is_new_open BOOLEAN := FALSE;
BEGIN
  -- Find the outbound email by tracking_id
  SELECT id INTO v_email_id
  FROM outbound_emails
  WHERE tracking_id = p_tracking_id
    AND tracking_enabled = TRUE;

  IF v_email_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Generate fingerprint for deduplication
  v_fingerprint := md5(COALESCE(p_ip_address::TEXT, '') || COALESCE(p_user_agent, ''));

  -- Check if this is a new unique open (by fingerprint)
  IF NOT EXISTS (
    SELECT 1 FROM email_open_events
    WHERE outbound_email_id = v_email_id
      AND fingerprint = v_fingerprint
  ) THEN
    v_is_new_open := TRUE;
  END IF;

  -- Insert open event
  INSERT INTO email_open_events (
    outbound_email_id,
    ip_address,
    user_agent,
    country,
    city,
    device_type,
    email_client,
    fingerprint
  ) VALUES (
    v_email_id,
    p_ip_address,
    p_user_agent,
    p_country,
    p_city,
    p_device_type,
    p_email_client,
    v_fingerprint
  );

  -- Update outbound email stats
  UPDATE outbound_emails
  SET
    open_count = open_count + 1,
    first_opened_at = COALESCE(first_opened_at, NOW()),
    last_opened_at = NOW(),
    updated_at = NOW()
  WHERE id = v_email_id;

  RETURN v_is_new_open;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_emails_for_follow_up: Get emails needing follow-up
-- ─────────────────────────────────────────────────────────────────────────────
-- Used by follow-up checker background job to find emails
-- that have passed their follow-up delay and meet their condition.

CREATE OR REPLACE FUNCTION get_emails_for_follow_up(p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  gmail_account_id UUID,
  to_email TEXT,
  to_name TEXT,
  subject TEXT,
  follow_up_condition TEXT,
  open_count INTEGER,
  has_reply BOOLEAN,
  sent_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.user_id,
    e.gmail_account_id,
    e.to_email,
    e.to_name,
    e.subject,
    e.follow_up_condition,
    e.open_count,
    e.has_reply,
    e.sent_at
  FROM outbound_emails e
  WHERE e.follow_up_enabled = TRUE
    AND e.follow_up_sent = FALSE
    AND e.status = 'sent'
    AND e.sent_at IS NOT NULL
    AND e.sent_at + (e.follow_up_delay_hours || ' hours')::INTERVAL <= NOW()
    AND (
      -- Check condition is met
      (e.follow_up_condition = 'no_open' AND e.open_count = 0) OR
      (e.follow_up_condition = 'no_reply' AND e.has_reply = FALSE) OR
      (e.follow_up_condition = 'both' AND (e.open_count = 0 OR e.has_reply = FALSE))
    )
    AND can_send_email(e.user_id)  -- Only if user has quota
  ORDER BY e.sent_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_active_campaigns: Get campaigns ready for processing
-- ─────────────────────────────────────────────────────────────────────────────
-- Used by campaign processor to find campaigns that need emails sent.
-- Respects throttle timing and user quotas.

CREATE OR REPLACE FUNCTION get_active_campaigns(p_limit INTEGER DEFAULT 5)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  gmail_account_id UUID,
  subject_template TEXT,
  body_html_template TEXT,
  body_text_template TEXT,
  recipients JSONB,
  current_index INTEGER,
  total_recipients INTEGER,
  throttle_seconds INTEGER,
  follow_up_enabled BOOLEAN,
  follow_up_condition TEXT,
  follow_up_delay_hours INTEGER,
  follow_up_subject TEXT,
  follow_up_body_html TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.user_id,
    c.gmail_account_id,
    c.subject_template,
    c.body_html_template,
    c.body_text_template,
    c.recipients,
    c.current_index,
    c.total_recipients,
    c.throttle_seconds,
    c.follow_up_enabled,
    c.follow_up_condition,
    c.follow_up_delay_hours,
    c.follow_up_subject,
    c.follow_up_body_html
  FROM email_campaigns c
  WHERE c.status = 'in_progress'
    AND c.current_index < c.total_recipients
    AND (
      c.last_send_at IS NULL OR
      c.last_send_at + (c.throttle_seconds || ' seconds')::INTERVAL <= NOW()
    )
    AND can_send_email(c.user_id)
  ORDER BY c.last_send_at ASC NULLS FIRST
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- increment_template_usage: Track template usage
-- ─────────────────────────────────────────────────────────────────────────────
-- Called when a template is used for sending an email.

CREATE OR REPLACE FUNCTION increment_template_usage(p_template_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE email_templates
  SET
    times_used = times_used + 1,
    last_used_at = NOW(),
    updated_at = NOW()
  WHERE id = p_template_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE email_templates IS 'Reusable email templates with merge field support. See docs/GMAIL_SENDING_IMPLEMENTATION.md';
COMMENT ON TABLE email_campaigns IS 'Mail merge campaigns with throttled sending. Default: 25 sec between sends.';
COMMENT ON TABLE outbound_emails IS 'All outbound emails: drafts, scheduled, sent, failed. Central tracking table.';
COMMENT ON TABLE email_open_events IS 'Detailed open tracking events from tracking pixel hits.';
COMMENT ON TABLE daily_send_quotas IS 'Daily email send limits per user. Default: 400/day.';

COMMENT ON FUNCTION can_send_email IS 'Check if user has quota remaining for today. Returns BOOLEAN.';
COMMENT ON FUNCTION increment_send_count IS 'Atomically increment send count. Returns FALSE if at limit.';
COMMENT ON FUNCTION get_remaining_quota IS 'Get number of emails user can still send today.';
COMMENT ON FUNCTION get_scheduled_emails_to_send IS 'Get scheduled emails due for sending (background job).';
COMMENT ON FUNCTION record_email_open IS 'Record tracking pixel hit. Updates stats and creates event.';
COMMENT ON FUNCTION get_emails_for_follow_up IS 'Get emails needing follow-up action (background job).';
COMMENT ON FUNCTION get_active_campaigns IS 'Get campaigns ready for next send (background job).';
