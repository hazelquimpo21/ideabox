# IdeaBox - Database Schema (Supabase/PostgreSQL)

## Schema Overview

```
users (Supabase Auth)
  ├─ user_profiles
  ├─ gmail_accounts
  ├─ clients
  ├─ emails
  │   └─ email_analyses
  ├─ actions
  ├─ urls (Phase 2)
  ├─ events (Phase 2)
  └─ content_opportunities (Phase 2)
```

## Core Tables (Phase 1)

### users (Managed by Supabase Auth)
```sql
-- Built-in Supabase auth.users table
-- We don't create this, but reference it via foreign keys
```

### user_profiles
Extends Supabase auth.users with app-specific data.

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  timezone TEXT DEFAULT 'America/Chicago',
  onboarding_completed BOOLEAN DEFAULT FALSE,
  
  -- Preferences
  default_view TEXT DEFAULT 'inbox', -- inbox, clients, actions
  emails_per_page INTEGER DEFAULT 50,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);
```

### gmail_accounts
Multiple Gmail accounts per user.

```sql
CREATE TABLE gmail_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  email TEXT NOT NULL,
  display_name TEXT,
  
  -- OAuth tokens (encrypted by Supabase)
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMPTZ NOT NULL,
  
  -- Sync state
  last_sync_at TIMESTAMPTZ,
  last_history_id TEXT, -- For incremental sync
  sync_enabled BOOLEAN DEFAULT TRUE,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, email)
);

CREATE INDEX idx_gmail_accounts_user_id ON gmail_accounts(user_id);

-- RLS Policies
ALTER TABLE gmail_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own Gmail accounts"
  ON gmail_accounts FOR ALL
  USING (auth.uid() = user_id);
```

### clients
Client/customer tracking for business context.

```sql
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  company TEXT,
  email TEXT, -- Primary contact email
  
  -- Status
  status TEXT DEFAULT 'active', -- active, inactive, archived
  priority TEXT DEFAULT 'medium', -- low, medium, high, vip
  
  -- Auto-learned patterns
  email_domains TEXT[], -- ['@clientco.com', '@client-alias.com']
  keywords TEXT[], -- Words that appear in their emails
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clients_user_id ON clients(user_id);
CREATE INDEX idx_clients_status ON clients(user_id, status);

-- RLS Policies
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own clients"
  ON clients FOR ALL
  USING (auth.uid() = user_id);
```

### emails
Central email storage.

```sql
CREATE TABLE emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_account_id UUID NOT NULL REFERENCES gmail_accounts(id) ON DELETE CASCADE,

  -- Gmail identifiers
  gmail_id TEXT NOT NULL, -- Gmail message ID
  thread_id TEXT NOT NULL, -- Gmail thread ID

  -- Email metadata
  subject TEXT,
  sender_email TEXT NOT NULL,
  sender_name TEXT,
  recipient_email TEXT,
  date TIMESTAMPTZ NOT NULL,

  -- Content (body_text truncated to 16K chars for AI analysis cost efficiency)
  snippet TEXT, -- Gmail's short preview
  body_text TEXT, -- Plain text body (may be truncated)
  body_html TEXT, -- HTML body (stored in full for display)

  -- Labels & categorization
  -- ═══════════════════════════════════════════════════════════════════════════════════════════
  -- LIFE-BUCKET CATEGORIES (REFACTORED Jan 2026)
  -- Categories represent what part of life the email touches, NOT what action is needed.
  -- Use urgency_score (1-10) to determine if action is needed.
  -- ═══════════════════════════════════════════════════════════════════════════════════════════
  --
  -- Work & Business: client_pipeline, business_work_general
  -- Family & Personal: family_kids_school, family_health_appointments, personal_friends_family
  -- Life Admin: finance, travel, shopping, local
  -- Information: newsletters_general, news_politics, product_updates
  --
  -- NOTE: "client" is NOT a category - use client_id relationship instead.
  -- NOTE: "event" is NOT a category - events detected via 'has_event' label in any category.
  -- NOTE: No "action_required" category - use urgency_score >= 7 instead.
  -- ═══════════════════════════════════════════════════════════════════════════════════════════
  gmail_labels TEXT[], -- Original Gmail labels
  category TEXT, -- Life-bucket category (see above for valid values)
  priority_score INTEGER DEFAULT 5, -- 1-10 scale
  topics TEXT[], -- AI-extracted topics: ['billing', 'meeting', 'feedback']

  -- Relations (client tracked separately from category for better filtering)
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  project_tags TEXT[], -- ['PodcastPipeline', 'HappenlistScraper']

  -- State
  is_read BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  is_starred BOOLEAN DEFAULT FALSE,
  analyzed_at TIMESTAMPTZ, -- When AI analysis completed

  -- Analysis failure tracking (if AI analysis fails, we mark why instead of retrying)
  analysis_error TEXT, -- NULL if successful, error message if failed

  -- Gmail label sync (we sync our categories back to Gmail as labels)
  gmail_label_synced BOOLEAN DEFAULT FALSE,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, gmail_id)
);

CREATE INDEX idx_emails_user_id ON emails(user_id);
CREATE INDEX idx_emails_category ON emails(user_id, category);
CREATE INDEX idx_emails_client_id ON emails(client_id);
CREATE INDEX idx_emails_date ON emails(user_id, date DESC);
CREATE INDEX idx_emails_thread_id ON emails(thread_id);
CREATE INDEX idx_emails_analyzed ON emails(user_id, analyzed_at);

-- Full text search on subject and snippet
CREATE INDEX idx_emails_search ON emails USING GIN(to_tsvector('english', subject || ' ' || snippet));

-- RLS Policies
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own emails"
  ON emails FOR ALL
  USING (auth.uid() = user_id);
```

### email_analyses
Stores all AI analyzer outputs (one row per email, JSONB for flexibility).

```sql
CREATE TABLE email_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Analysis results (flexible JSONB structure)
  categorization JSONB, -- {category, confidence, reasoning}
  action_extraction JSONB, -- {has_action, action_type, urgency, deadline}
  client_tagging JSONB, -- {client_id, project_name, confidence}
  event_detection JSONB, -- Phase 2: {event_name, date, time, location}
  url_extraction JSONB, -- Phase 2: [{url, type, relevance}]
  content_opportunity JSONB, -- Phase 2: {tweet_idea, networking_value}
  
  -- Metadata
  analyzer_version TEXT DEFAULT '1.0',
  tokens_used INTEGER, -- For cost tracking
  processing_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(email_id)
);

CREATE INDEX idx_email_analyses_email_id ON email_analyses(email_id);
CREATE INDEX idx_email_analyses_user_id ON email_analyses(user_id);

-- RLS Policies
ALTER TABLE email_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own analyses"
  ON email_analyses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert analyses"
  ON email_analyses FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

### actions
To-do items extracted from emails.

```sql
CREATE TABLE actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_id UUID REFERENCES emails(id) ON DELETE SET NULL, -- Source email
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  
  -- Action details
  title TEXT NOT NULL,
  description TEXT,
  action_type TEXT, -- respond, review, create, schedule, decide
  
  -- Priority & timing
  priority TEXT DEFAULT 'medium', -- low, medium, high, urgent
  urgency_score INTEGER DEFAULT 5, -- 1-10
  deadline TIMESTAMPTZ,
  estimated_minutes INTEGER, -- AI's estimate of time needed
  
  -- State
  status TEXT DEFAULT 'pending', -- pending, in_progress, completed, cancelled
  completed_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_actions_user_id ON actions(user_id);
CREATE INDEX idx_actions_status ON actions(user_id, status);
CREATE INDEX idx_actions_client_id ON actions(client_id);
CREATE INDEX idx_actions_deadline ON actions(user_id, deadline) WHERE status != 'completed';

-- RLS Policies
ALTER TABLE actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own actions"
  ON actions FOR ALL
  USING (auth.uid() = user_id);
```

### extracted_dates
Timeline dates extracted from emails (deadlines, events, payments, etc.).
Powers the Hub "upcoming things" view and the Events page.

```sql
CREATE TABLE extracted_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Source References
  email_id UUID REFERENCES emails(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,

  -- Date Information
  date_type TEXT NOT NULL,      -- 'deadline', 'event', 'payment_due', 'birthday', etc.
  date DATE NOT NULL,           -- The primary date
  event_time TIME,              -- Time if known (NULL for all-day)
  end_date DATE,                -- End date for ranges
  end_time TIME,                -- End time for ranges
  timezone TEXT DEFAULT 'America/Chicago',

  -- Context
  title TEXT NOT NULL,          -- "Invoice #1234 due", "Milwaukee Tech Meetup"
  description TEXT,             -- Additional context
  source_snippet TEXT,          -- Original text or key points
  related_entity TEXT,          -- Company, person, or organizer

  -- Recurrence
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_pattern TEXT,      -- 'daily', 'weekly', 'monthly', 'yearly'

  -- Extraction Metadata
  confidence DECIMAL(3,2),      -- 0.00-1.00 confidence in extraction
  extracted_by TEXT DEFAULT 'date_extractor',  -- Which analyzer extracted this

  -- Hub Display & User Interaction
  priority_score INTEGER DEFAULT 5,     -- 1-10, for Hub ranking
  is_acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,
  is_hidden BOOLEAN DEFAULT FALSE,
  snoozed_until TIMESTAMPTZ,

  -- Rich Event Metadata (NEW Jan 2026)
  -- Only populated for events from EventDetector (date_type='event')
  -- Contains locality, location, RSVP info for enhanced EventCard display
  event_metadata JSONB,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_extracted_dates_user_date ON extracted_dates(user_id, date);
CREATE INDEX idx_extracted_dates_type ON extracted_dates(user_id, date_type, date);
CREATE INDEX idx_extracted_dates_email ON extracted_dates(email_id);

-- Deduplication index
CREATE UNIQUE INDEX idx_extracted_dates_dedup
  ON extracted_dates(email_id, date_type, date, title)
  WHERE email_id IS NOT NULL;

-- Index for event locality queries (uses event_metadata JSONB)
CREATE INDEX idx_extracted_dates_event_locality
  ON extracted_dates USING GIN (event_metadata jsonb_path_ops)
  WHERE date_type = 'event' AND event_metadata IS NOT NULL;

-- RLS Policies
ALTER TABLE extracted_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own extracted dates"
  ON extracted_dates FOR ALL
  USING (auth.uid() = user_id);
```

#### event_metadata JSONB Schema
For events extracted by EventDetector, the `event_metadata` column contains:

```json
{
  "locality": "local" | "out_of_town" | "virtual",
  "locationType": "in_person" | "virtual" | "hybrid" | "unknown",
  "location": "123 Main St, Milwaukee, WI" | "https://zoom.us/j/...",
  "rsvpRequired": true,
  "rsvpUrl": "https://meetup.com/...",
  "rsvpDeadline": "2026-01-23",
  "organizer": "MKE Tech Community",
  "cost": "Free" | "$25",
  "additionalDetails": "Parking available...",
  "isKeyDate": false,
  "keyDateType": null | "registration_deadline" | "open_house",
  "eventSummary": "Milwaukee Tech Meetup on Sat Jan 25 at 6pm (local). Free.",
  "keyPoints": ["Sat Jan 25, 6-8pm", "In-person: 123 Main St", "Free"]
}
```

### contacts (ENHANCED Jan 2026)
Contact management with sender type classification.

```sql
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Core contact info
  email TEXT NOT NULL,
  name TEXT,
  display_name TEXT, -- User override or extracted
  avatar_url TEXT,

  -- Communication stats
  email_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,   -- Emails user sent TO this contact
  received_count INTEGER DEFAULT 0, -- Emails user received FROM this contact
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,

  -- ════════════════════════════════════════════════════════════════════════════
  -- SENDER TYPE CLASSIFICATION (NEW Jan 2026)
  -- ════════════════════════════════════════════════════════════════════════════
  -- Distinguishes real contacts from newsletters/broadcasts

  sender_type TEXT DEFAULT 'unknown',
    -- 'direct': Real person who knows you
    -- 'broadcast': Newsletter/marketing sender
    -- 'cold_outreach': Cold email from stranger
    -- 'opportunity': HARO-style mailing list
    -- 'unknown': Not yet classified

  broadcast_subtype TEXT,
    -- Only for sender_type='broadcast':
    -- 'newsletter_author': Substack, personal blog
    -- 'company_newsletter': Company marketing
    -- 'digest_service': LinkedIn digest, GitHub notifications
    -- 'transactional': Receipts, noreply addresses

  sender_type_confidence DECIMAL(3,2),
  sender_type_detected_at TIMESTAMPTZ,
  sender_type_source TEXT,
    -- 'header': List-Unsubscribe detected
    -- 'email_pattern': @substack.com, noreply@
    -- 'ai_analysis': ContactEnricher determined
    -- 'user_behavior': User replied = direct
    -- 'manual': User override

  -- ════════════════════════════════════════════════════════════════════════════

  -- Relationship & enrichment
  relationship_type TEXT DEFAULT 'unknown',
    -- client, colleague, vendor, friend, family, recruiter, service, networking, unknown
    -- NOTE: Only meaningful when sender_type='direct'
  company TEXT,
  job_title TEXT,
  phone TEXT,
  linkedin_url TEXT,
  extraction_confidence DECIMAL(3,2),
  last_extracted_at TIMESTAMPTZ,

  -- User flags
  is_vip BOOLEAN DEFAULT FALSE,
  is_muted BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,

  -- Google integration
  google_resource_name TEXT,
  google_labels TEXT[],
  is_google_starred BOOLEAN DEFAULT FALSE,
  google_synced_at TIMESTAMPTZ,

  -- Import tracking
  import_source TEXT DEFAULT 'email', -- email, google, manual
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, email)
);

-- Core indexes
CREATE INDEX idx_contacts_user_id ON contacts(user_id);
CREATE INDEX idx_contacts_email ON contacts(email);

-- Sender type indexes (NEW Jan 2026)
CREATE INDEX idx_contacts_sender_type ON contacts(user_id, sender_type);
CREATE INDEX idx_contacts_broadcast ON contacts(user_id, sender_type, broadcast_subtype)
  WHERE sender_type = 'broadcast';
CREATE INDEX idx_contacts_direct ON contacts(user_id, last_seen_at DESC)
  WHERE sender_type = 'direct';

-- RLS Policies
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own contacts"
  ON contacts FOR ALL
  USING (auth.uid() = user_id);
```

#### Sender Type Classification Flow

```
Email Received
      │
      ▼
┌─────────────────────────────────────────────────────┐
│ 1. Header Detection (highest confidence)            │
│    - List-Unsubscribe header? → broadcast           │
│    - ESP headers (Mailchimp, etc)? → broadcast      │
└───────────────────┬─────────────────────────────────┘
                    │ no match
                    ▼
┌─────────────────────────────────────────────────────┐
│ 2. Email Pattern Detection                          │
│    - @substack.com → broadcast/newsletter_author    │
│    - noreply@ → broadcast/transactional             │
│    - newsletter@ → broadcast/company_newsletter     │
└───────────────────┬─────────────────────────────────┘
                    │ no match
                    ▼
┌─────────────────────────────────────────────────────┐
│ 3. AI Analysis (ContactEnricher)                    │
│    - Analyze content for broadcast signals          │
│    - Check for unsubscribe links, "view in browser" │
│    - Detect cold outreach patterns                  │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│ 4. User Behavior Signal (ongoing)                   │
│    - User replied to them? → upgrade to 'direct'    │
│    - User marked as VIP? → likely 'direct'          │
└─────────────────────────────────────────────────────┘
```

## Phase 2 Tables

### urls
URLs extracted from emails for content library.

```sql
CREATE TABLE urls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_id UUID REFERENCES emails(id) ON DELETE SET NULL,
  
  url TEXT NOT NULL,
  title TEXT, -- Fetched via meta tags
  domain TEXT,
  
  -- AI analysis
  url_type TEXT, -- article, tool, inspiration, example, documentation
  relevance_score INTEGER DEFAULT 5,
  summary TEXT,
  topics TEXT[], -- ['AI', 'Chrome Extensions', 'TypeScript']
  
  -- Relations
  project_tags TEXT[],
  
  -- State
  is_saved BOOLEAN DEFAULT TRUE,
  is_archived BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_urls_user_id ON urls(user_id);
CREATE INDEX idx_urls_topics ON urls USING GIN(topics);
CREATE INDEX idx_urls_domain ON urls(domain);

-- RLS Policies
ALTER TABLE urls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own URLs"
  ON urls FOR ALL
  USING (auth.uid() = user_id);
```

### events
Calendar events extracted from emails.

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_id UUID REFERENCES emails(id) ON DELETE SET NULL,
  
  -- Event details
  title TEXT NOT NULL,
  description TEXT,
  
  -- Date/time
  start_date DATE NOT NULL,
  start_time TIME,
  end_date DATE,
  end_time TIME,
  all_day BOOLEAN DEFAULT FALSE,
  timezone TEXT DEFAULT 'America/Chicago',
  
  -- Location
  location TEXT,
  is_local BOOLEAN DEFAULT FALSE, -- Within Milwaukee/Shorewood area
  
  -- RSVP
  rsvp_required BOOLEAN DEFAULT FALSE,
  rsvp_deadline DATE,
  rsvp_status TEXT, -- pending, accepted, declined, tentative
  
  -- Google Calendar sync
  gcal_event_id TEXT, -- If sent to Google Calendar
  synced_to_gcal BOOLEAN DEFAULT FALSE,
  
  -- State
  is_archived BOOLEAN DEFAULT FALSE,
  confidence_score INTEGER DEFAULT 5, -- How confident AI is this is an event
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_user_id ON events(user_id);
CREATE INDEX idx_events_date ON events(user_id, start_date);
CREATE INDEX idx_events_local ON events(user_id, is_local);

-- RLS Policies
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own events"
  ON events FOR ALL
  USING (auth.uid() = user_id);
```

### content_opportunities
Tweet ideas, networking opportunities, etc.

```sql
CREATE TABLE content_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_id UUID REFERENCES emails(id) ON DELETE SET NULL,
  
  -- Opportunity type
  type TEXT NOT NULL, -- tweet_idea, newsletter_reply, linkedin_post, conversation_starter
  
  -- Content
  title TEXT NOT NULL,
  draft_content TEXT, -- AI-generated draft
  talking_points TEXT[],
  
  -- Context
  source_context TEXT, -- Why this is an opportunity
  networking_value TEXT, -- high, medium, low
  
  -- State
  status TEXT DEFAULT 'pending', -- pending, used, skipped
  used_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_content_opportunities_user_id ON content_opportunities(user_id);
CREATE INDEX idx_content_opportunities_type ON content_opportunities(user_id, type);
CREATE INDEX idx_content_opportunities_status ON content_opportunities(user_id, status);

-- RLS Policies
ALTER TABLE content_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own content opportunities"
  ON content_opportunities FOR ALL
  USING (auth.uid() = user_id);
```

## Utility Tables

### sync_logs
Track email sync operations for debugging.

```sql
CREATE TABLE sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_account_id UUID REFERENCES gmail_accounts(id) ON DELETE CASCADE,
  
  -- Sync details
  sync_type TEXT NOT NULL, -- full, incremental
  emails_fetched INTEGER DEFAULT 0,
  emails_analyzed INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,
  
  -- Status
  status TEXT NOT NULL, -- started, completed, failed
  error_message TEXT,
  
  -- Performance
  duration_ms INTEGER,
  
  -- Metadata
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_sync_logs_user_id ON sync_logs(user_id);
CREATE INDEX idx_sync_logs_started_at ON sync_logs(started_at DESC);

-- RLS Policies
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sync logs"
  ON sync_logs FOR SELECT
  USING (auth.uid() = user_id);
```

### api_usage_logs
Track API usage for cost monitoring and budget alerts.

```sql
CREATE TABLE api_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- API details
  service TEXT NOT NULL, -- 'openai', 'gmail'
  endpoint TEXT, -- 'chat.completions', 'users.messages.list'
  model TEXT, -- 'gpt-4.1-mini'

  -- Usage metrics
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  tokens_total INTEGER DEFAULT 0,
  estimated_cost DECIMAL(10, 6), -- Cost in USD (6 decimal places for precision)

  -- Context
  email_id UUID REFERENCES emails(id) ON DELETE SET NULL,
  analyzer_name TEXT, -- 'categorizer', 'action_extractor', 'client_tagger'

  -- Performance
  duration_ms INTEGER,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_usage_logs_user_id ON api_usage_logs(user_id);
CREATE INDEX idx_api_usage_logs_created_at ON api_usage_logs(created_at DESC);
CREATE INDEX idx_api_usage_logs_service ON api_usage_logs(service, created_at DESC);

-- RLS Policies
ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own API usage"
  ON api_usage_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Helper function: Get daily API cost for a user
CREATE OR REPLACE FUNCTION get_daily_api_cost(p_user_id UUID, p_date DATE DEFAULT CURRENT_DATE)
RETURNS DECIMAL AS $$
BEGIN
  RETURN COALESCE(
    (SELECT SUM(estimated_cost)
     FROM api_usage_logs
     WHERE user_id = p_user_id
       AND created_at >= p_date
       AND created_at < p_date + INTERVAL '1 day'),
    0
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Get monthly API cost for a user
CREATE OR REPLACE FUNCTION get_monthly_api_cost(p_user_id UUID, p_month DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE)::DATE)
RETURNS DECIMAL AS $$
BEGIN
  RETURN COALESCE(
    (SELECT SUM(estimated_cost)
     FROM api_usage_logs
     WHERE user_id = p_user_id
       AND created_at >= p_month
       AND created_at < p_month + INTERVAL '1 month'),
    0
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Database Functions & Triggers

### Update updated_at timestamp automatically

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_gmail_accounts_updated_at BEFORE UPDATE ON gmail_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_emails_updated_at BEFORE UPDATE ON emails
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_actions_updated_at BEFORE UPDATE ON actions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- (Repeat for Phase 2 tables)
```

### Helper function: Get user's active clients

```sql
CREATE OR REPLACE FUNCTION get_active_clients(p_user_id UUID)
RETURNS SETOF clients AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM clients
  WHERE user_id = p_user_id AND status = 'active'
  ORDER BY priority DESC, name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Common Queries

### Get unread emails by category
```sql
SELECT 
  e.*,
  c.name as client_name,
  ea.categorization,
  ea.action_extraction
FROM emails e
LEFT JOIN clients c ON e.client_id = c.id
LEFT JOIN email_analyses ea ON e.id = ea.email_id
WHERE e.user_id = $1
  AND e.is_read = false
  AND e.category = $2
ORDER BY e.priority_score DESC, e.date DESC
LIMIT 50;
```

### Get client email summary
```sql
SELECT 
  c.id,
  c.name,
  COUNT(e.id) as total_emails,
  COUNT(e.id) FILTER (WHERE e.is_read = false) as unread_count,
  COUNT(a.id) FILTER (WHERE a.status = 'pending') as pending_actions
FROM clients c
LEFT JOIN emails e ON c.id = e.client_id AND e.user_id = $1
LEFT JOIN actions a ON c.id = a.client_id AND a.user_id = $1
WHERE c.user_id = $1 AND c.status = 'active'
GROUP BY c.id, c.name
ORDER BY unread_count DESC, c.priority DESC;
```

### Get today's actions
```sql
SELECT 
  a.*,
  e.subject as source_email_subject,
  c.name as client_name
FROM actions a
LEFT JOIN emails e ON a.email_id = e.id
LEFT JOIN clients c ON a.client_id = c.id
WHERE a.user_id = $1
  AND a.status IN ('pending', 'in_progress')
  AND (a.deadline IS NULL OR a.deadline <= CURRENT_DATE + INTERVAL '1 day')
ORDER BY a.urgency_score DESC, a.deadline ASC;
```

## Log Cleanup (30-day retention)

```sql
-- Cleanup function for old logs (run daily via pg_cron)
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS void AS $$
BEGIN
  -- Delete sync logs older than 30 days
  DELETE FROM sync_logs
  WHERE started_at < NOW() - INTERVAL '30 days';

  -- Delete API usage logs older than 30 days
  DELETE FROM api_usage_logs
  WHERE created_at < NOW() - INTERVAL '30 days';

  -- Log the cleanup
  RAISE NOTICE 'Cleaned up logs older than 30 days at %', NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule cleanup to run daily at 3am (via pg_cron)
-- Run this after enabling pg_cron extension:
-- SELECT cron.schedule('cleanup-old-logs', '0 3 * * *', 'SELECT cleanup_old_logs()');
```

### user_event_states
User decisions about events (dismiss, maybe, saved to calendar).
Separate from AI analysis to keep user preferences distinct from generated data.

```sql
CREATE TABLE user_event_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,

  -- State: 'dismissed', 'maybe', 'saved_to_calendar'
  state TEXT NOT NULL CHECK (state IN ('dismissed', 'maybe', 'saved_to_calendar')),

  -- Optional notes (for future use)
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One state per user per email per state type
  UNIQUE(user_id, email_id, state)
);

CREATE INDEX idx_user_event_states_user_id ON user_event_states(user_id);
CREATE INDEX idx_user_event_states_email_id ON user_event_states(email_id);
CREATE INDEX idx_user_event_states_user_state ON user_event_states(user_id, state);
CREATE INDEX idx_user_event_states_lookup ON user_event_states(user_id, email_id, state);

-- RLS Policies
ALTER TABLE user_event_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own event states"
  ON user_event_states FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own event states"
  ON user_event_states FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own event states"
  ON user_event_states FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own event states"
  ON user_event_states FOR DELETE
  USING (auth.uid() = user_id);

-- Helper function: Check if event has a specific state
CREATE OR REPLACE FUNCTION has_event_state(
  p_user_id UUID,
  p_email_id UUID,
  p_state TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_event_states
    WHERE user_id = p_user_id
      AND email_id = p_email_id
      AND state = p_state
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Get all states for an event
CREATE OR REPLACE FUNCTION get_event_states(
  p_user_id UUID,
  p_email_id UUID
)
RETURNS TEXT[] AS $$
BEGIN
  RETURN ARRAY(
    SELECT state FROM user_event_states
    WHERE user_id = p_user_id
      AND email_id = p_email_id
    ORDER BY state
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### State Values

| State | Description | UI Effect |
|-------|-------------|-----------|
| `dismissed` | User doesn't want to see this event | Event hidden from list unless showDismissed=true |
| `maybe` | User is interested but not committed | Event shows star badge, appears in Maybe filter |
| `saved_to_calendar` | User added to their calendar | Calendar button shows "Added" with checkmark |

## Migration Files Structure

```
supabase/migrations/
  001_initial_schema.sql          # user_profiles, gmail_accounts
  002_clients_table.sql           # clients
  003_emails_table.sql            # emails (with topics, analysis_error, gmail_label_synced)
  004_email_analyses_table.sql    # email_analyses
  005_actions_table.sql           # actions
  006_sync_logs.sql               # sync_logs
  007_api_usage_logs.sql          # api_usage_logs (for cost tracking)
  008_rls_policies.sql            # All RLS policies
  009_functions_triggers.sql      # Helper functions + cleanup function
  ...
  018_category_refactor.sql       # Life-bucket categories introduced (Jan 2026)
  021_user_event_states.sql       # Event dismiss/maybe/calendar tracking (Jan 2026)
  027_category_backfill.sql       # Backfill categories from email_analyses
  028_category_cleanup.sql        # Final cleanup of legacy categories, cache clear (Feb 2026)

  # Phase 2 migrations
  101_urls_table.sql
  102_events_table.sql
  103_content_opportunities.sql
```

### Migration 028: Category Cleanup (Feb 2026)

This migration performs final cleanup of the category system:
1. Maps any remaining legacy categories (`action_required`, `newsletter`, etc.) to new life-bucket categories
2. Updates `email_analyses.categorization` JSONB to use new category values
3. Clears cached `sync_progress.result` to force UI refresh with correct categories
4. Re-adds the CHECK constraint for valid categories

See `supabase/migrations/028_category_cleanup_and_cache_clear.sql` for details.

## Indexes Strategy
- All foreign keys have indexes
- User-specific queries have compound indexes (user_id + filter column)
- Date columns used for sorting have DESC indexes
- Full-text search on email subject/snippet
- GIN indexes for array columns (topics, tags)

## RLS (Row Level Security) Summary
- **Enabled on all tables**
- **Users can only access their own data**
- **Service role key bypasses RLS** (for API routes doing bulk operations)
- **Functions use SECURITY DEFINER** when needed for cross-user queries

## Backup & Data Retention
- Supabase handles automatic backups
- Consider archiving old emails (>1 year) to separate table
- Soft delete pattern for emails (is_archived instead of DELETE)
- Hard delete only via explicit user action
