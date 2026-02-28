# IdeaBox - Database Schema (Supabase/PostgreSQL)

> **Last Updated:** February 28, 2026
> **Source of Truth:** `scripts/migration-*.sql` (migrations 001-044)
> **TypeScript Types:** `src/types/database.ts`

## Schema Overview

```
auth.users (Supabase Auth)
  ├── user_profiles          # App-specific user data, sync state
  ├── user_settings          # AI analysis toggles, cost limits, notifications
  ├── user_context           # AI personalization context (role, location, VIPs)
  ├── gmail_accounts         # OAuth tokens, sync state, push notifications
  │   └── gmail_push_logs    # Push notification audit trail
  ├── clients_deprecated      # Legacy client table (renamed migration 030)
  ├── contacts               # Contact intelligence + sender classification + client tracking
  │   └── contact_aliases    # Multi-email → single person mapping
  ├── emails                 # Central email storage + denormalized AI fields
  │   ├── email_analyses     # Full AI analyzer outputs (JSONB)
  │   └── extracted_dates    # Timeline dates/events extracted from emails
  ├── actions                # To-do items extracted from emails
  ├── email_ideas            # User-saved ideas from IdeaSpark analyzer (NEW Feb 2026)
  ├── projects               # Project containers for organizing work (NEW Feb 2026)
  │   └── project_items      # Ideas, tasks, and routines within projects (NEW Feb 2026)
  ├── saved_insights         # User-promoted insights from InsightExtractor (NEW Feb 2026)
  ├── saved_news             # User-promoted news items from NewsBrief (NEW Feb 2026)
  ├── saved_links            # User-promoted links from LinkAnalyzer (NEW Feb 2026)
  ├── email_summaries        # AI-synthesized narrative digests (NEW Feb 2026)
  ├── user_summary_state     # Summary staleness tracking (NEW Feb 2026)
  ├── user_event_states      # User decisions on events (dismiss/maybe/calendar)
  ├── outbound_emails        # Sent/scheduled/draft outgoing emails
  │   └── email_open_events  # Tracking pixel hits
  ├── email_templates        # Reusable email templates with merge fields
  ├── email_campaigns        # Mail merge campaigns
  ├── daily_send_quotas      # Send rate limiting
  ├── sync_logs              # Sync operation audit trail
  ├── scheduled_sync_runs    # Background sync execution tracking
  └── api_usage_logs         # OpenAI/Gmail API cost tracking
```

---

## Core Tables

### user_profiles
Extends Supabase auth.users with app-specific data.

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  timezone TEXT DEFAULT 'America/Chicago',
  onboarding_completed BOOLEAN DEFAULT FALSE,
  default_view TEXT DEFAULT 'inbox',
  emails_per_page INTEGER DEFAULT 50,

  -- Sync state (migration 010)
  sync_progress JSONB,                    -- Cached initial sync progress/result
  initial_sync_completed_at TIMESTAMPTZ,

  -- Sync triggers (migration 016)
  initial_sync_pending BOOLEAN DEFAULT FALSE,
  initial_sync_triggered_at TIMESTAMPTZ,

  -- Learned patterns (migration 018)
  sender_patterns JSONB DEFAULT '[]'::jsonb, -- Auto-categorization patterns

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### user_settings
User preferences for AI analysis, cost control, and notifications.

```sql
CREATE TABLE user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

  -- AI Analysis toggles
  auto_analyze BOOLEAN DEFAULT TRUE,
  extract_actions BOOLEAN DEFAULT TRUE,
  categorize_emails BOOLEAN DEFAULT TRUE,
  detect_clients BOOLEAN DEFAULT TRUE,

  -- Analysis limits
  initial_sync_email_count INTEGER DEFAULT 50,
  max_emails_per_sync INTEGER DEFAULT 100,
  max_analysis_per_sync INTEGER DEFAULT 50,

  -- Cost control
  daily_cost_limit DECIMAL(10,4) DEFAULT 1.00,
  monthly_cost_limit DECIMAL(10,4) DEFAULT 10.00,
  cost_alert_threshold DECIMAL(10,4) DEFAULT 0.80,
  pause_on_limit_reached BOOLEAN DEFAULT FALSE,

  -- Notifications
  email_digest_enabled BOOLEAN DEFAULT TRUE,
  email_digest_frequency TEXT DEFAULT 'daily',
  action_reminders BOOLEAN DEFAULT TRUE,
  new_client_alerts BOOLEAN DEFAULT TRUE,
  sync_error_alerts BOOLEAN DEFAULT TRUE,
  cost_limit_alerts BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### user_context
Foundational user info used to personalize AI analysis.

```sql
CREATE TABLE user_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

  -- Professional context
  role TEXT,
  company TEXT,
  industry TEXT,
  location_city TEXT,
  location_metro TEXT,

  -- Priorities & projects
  priorities TEXT[],
  projects TEXT[],

  -- VIP contacts
  vip_emails TEXT[],
  vip_domains TEXT[],

  -- Personal context
  interests TEXT[],
  family_context JSONB DEFAULT '{}',

  -- Work schedule
  work_hours_start TIME DEFAULT '09:00',
  work_hours_end TIME DEFAULT '17:00',
  work_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5],

  -- Onboarding
  onboarding_completed BOOLEAN DEFAULT FALSE,
  onboarding_completed_at TIMESTAMPTZ,
  onboarding_step INTEGER DEFAULT 0,

  -- Profile suggestions (migration 031)
  -- AI-generated suggestions for Mad Libs onboarding step
  -- NOT auto-saved to role/company/etc. — user must confirm in Phase 3
  profile_suggestions JSONB DEFAULT NULL,
  profile_suggestions_generated_at TIMESTAMPTZ DEFAULT NULL,

  -- Profile expansion (migration 040)
  -- Identity
  gender TEXT,                                   -- male, female, non-binary, prefer_not_to_say
  birthday DATE,                                 -- User birthday (date only)
  -- Address
  address_street TEXT,
  address_city TEXT,
  address_state TEXT,
  address_zip TEXT,
  address_country TEXT DEFAULT 'US',
  -- Other cities
  other_cities JSONB DEFAULT '[]'::jsonb,        -- [{city, tag, note?}] tags: hometown, travel, family, other
  -- Employment
  employment_type TEXT DEFAULT 'employed',        -- employed, self_employed, both
  other_jobs JSONB DEFAULT '[]'::jsonb,          -- [{role, company, is_self_employed}]
  -- Household
  household_members JSONB DEFAULT '[]'::jsonb,   -- [{name, relationship, gender?, birthday?, school?}]
  pets JSONB DEFAULT '[]'::jsonb,                -- [{name, type}]

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### gmail_accounts
Multiple Gmail accounts per user with OAuth, sync state, and push notifications.

```sql
CREATE TABLE gmail_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  email TEXT NOT NULL,
  display_name TEXT,

  -- OAuth tokens
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMPTZ NOT NULL,

  -- Core sync state
  last_sync_at TIMESTAMPTZ,
  last_history_id TEXT,
  sync_enabled BOOLEAN DEFAULT TRUE,

  -- Push notifications (migration 015)
  watch_expiration TIMESTAMPTZ,
  watch_history_id TEXT,
  watch_resource_id TEXT,
  push_enabled BOOLEAN DEFAULT TRUE,
  last_push_at TIMESTAMPTZ,

  -- Sync locking & health (migration 016)
  sync_lock_until TIMESTAMPTZ,
  history_id_validated_at TIMESTAMPTZ,
  needs_full_sync BOOLEAN DEFAULT FALSE,
  watch_renewal_failures INTEGER DEFAULT 0,
  watch_last_error TEXT,
  watch_alert_sent_at TIMESTAMPTZ,

  -- Google Contacts integration (migration 022)
  contacts_synced_at TIMESTAMPTZ,
  contacts_sync_enabled BOOLEAN DEFAULT FALSE,

  -- Historical sync (migration 023)
  historical_sync_status TEXT DEFAULT 'not_started',
  historical_sync_oldest_date TIMESTAMPTZ,
  historical_sync_email_count INTEGER DEFAULT 0,
  historical_sync_contacts_updated INTEGER DEFAULT 0,
  historical_sync_started_at TIMESTAMPTZ,
  historical_sync_completed_at TIMESTAMPTZ,
  historical_sync_page_token TEXT,
  historical_sync_error TEXT,

  -- Email sending (migration 026)
  has_send_scope BOOLEAN DEFAULT FALSE,
  send_scope_granted_at TIMESTAMPTZ,

  -- Background backfill tracking (migration 039)
  backfill_completed_at TIMESTAMPTZ,     -- When post-initial-sync background backfill completed

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, email)
);
```

### clients_deprecated
Formerly `clients`. Renamed in migration 030 after client data was merged into the `contacts` table (migration 029). Kept for data preservation; not used by application code.

```sql
-- Renamed from 'clients' to 'clients_deprecated' (migration 030)
CREATE TABLE clients_deprecated (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  company TEXT,
  email TEXT,

  status TEXT DEFAULT 'active',   -- active, inactive, archived
  priority TEXT DEFAULT 'medium', -- low, medium, high, vip

  email_domains TEXT[],  -- ['@clientco.com']
  keywords TEXT[],       -- Auto-learned keywords
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### contacts
Contact intelligence with sender type classification.

```sql
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identity
  email TEXT NOT NULL,
  name TEXT,
  display_name TEXT,
  avatar_url TEXT,                          -- (migration 022)

  -- Communication stats
  email_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  received_count INTEGER DEFAULT 0,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  last_user_reply_at TIMESTAMPTZ,
  avg_response_hours DECIMAL(10,2),

  -- Sender type classification (migration 024)
  sender_type TEXT DEFAULT 'unknown',       -- direct, broadcast, cold_outreach, opportunity, unknown
  broadcast_subtype TEXT,                   -- newsletter_author, company_newsletter, digest_service, transactional
  sender_type_confidence DECIMAL(3,2),
  sender_type_detected_at TIMESTAMPTZ,
  sender_type_source TEXT,                  -- header, email_pattern, ai_analysis, user_behavior, manual

  -- Relationship & enrichment
  relationship_type TEXT,                   -- client, colleague, vendor, friend, family, etc.
  relationship_strength TEXT DEFAULT 'normal',
  company TEXT,
  job_title TEXT,
  phone TEXT,
  linkedin_url TEXT,
  extraction_confidence DECIMAL(3,2),
  last_extracted_at TIMESTAMPTZ,
  extraction_source TEXT,
  needs_enrichment BOOLEAN DEFAULT TRUE,

  -- Personal dates
  birthday DATE,
  birthday_year_known BOOLEAN DEFAULT FALSE,
  work_anniversary DATE,
  custom_dates JSONB DEFAULT '[]',

  -- Client tracking (migration 029, merged from clients table)
  is_client BOOLEAN DEFAULT FALSE,
  client_status TEXT,            -- active, inactive, archived
  client_priority TEXT,          -- low, medium, high, vip
  email_domains TEXT[],          -- ['@clientco.com']
  keywords TEXT[],               -- Auto-learned keywords

  -- User flags
  is_vip BOOLEAN DEFAULT FALSE,
  is_muted BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,

  -- Google Contacts integration (migration 022)
  google_resource_name TEXT,
  google_labels TEXT[] DEFAULT '{}',
  is_google_starred BOOLEAN DEFAULT FALSE,
  google_synced_at TIMESTAMPTZ,
  import_source TEXT DEFAULT 'email',       -- email, google, manual

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, email)
);
```

### contact_aliases
Links same person across multiple email addresses.

```sql
CREATE TABLE contact_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  primary_contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  alias_email TEXT NOT NULL,
  created_via TEXT DEFAULT 'manual',
  confidence DECIMAL(3,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, alias_email)
);
```

### emails
Central email storage with denormalized AI analysis fields for fast list queries.

```sql
CREATE TABLE emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_account_id UUID NOT NULL REFERENCES gmail_accounts(id) ON DELETE CASCADE,

  -- Gmail identifiers
  gmail_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,

  -- Email metadata
  subject TEXT,
  sender_email TEXT NOT NULL,
  sender_name TEXT,
  recipient_email TEXT,
  date TIMESTAMPTZ NOT NULL,

  -- Content
  snippet TEXT,
  body_text TEXT,    -- Plain text (truncated to 16K for AI)
  body_html TEXT,    -- Full HTML for display

  -- Labels & categorization
  gmail_labels TEXT[],
  category TEXT,          -- Life-bucket category (see CHECK constraint below)
  priority_score INTEGER DEFAULT 5,
  topics TEXT[],

  -- Denormalized AI fields (migration 017)
  summary TEXT,           -- One-line summary from categorizer
  quick_action TEXT,      -- respond, review, archive, save, calendar, unsubscribe, follow_up, none
  labels TEXT[],          -- Secondary labels: has_event, needs_reply, urgent, etc.

  -- Content digest fields (migration 025)
  gist TEXT,              -- 1-2 sentence content briefing
  key_points TEXT[],      -- Key bullet points

  -- Signal quality fields (migration 032)
  signal_strength TEXT,   -- high, medium, low, noise (AI-assessed relevance)
  reply_worthiness TEXT,  -- must_reply, should_reply, optional_reply, no_reply

  -- Multi-category support (Feb 2026)
  additional_categories TEXT[],  -- Up to 2 secondary life-bucket categories

  -- Email type & AI brief (migration 037)
  email_type TEXT,       -- personal, transactional, newsletter, notification, promo, cold_outreach, needs_response, fyi, automated
  ai_brief TEXT,         -- Dense structured summary for downstream AI batch-summarization

  -- Relations
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,  -- (migration 029, replaces legacy client_id)
  project_tags TEXT[],

  -- Denormalized analysis fields (migration 043)
  urgency_score INTEGER,                -- Urgency score from action extraction (1-10)
  relationship_signal TEXT,             -- positive, neutral, negative, unknown
  -- CHECK (relationship_signal IN ('positive', 'neutral', 'negative', 'unknown'))

  -- Golden nugget count (migration 044)
  golden_nugget_count INTEGER DEFAULT 0, -- Count of golden nuggets from content digest

  -- Review queue tracking (migration 033)
  reviewed_at TIMESTAMPTZ,              -- When user last scanned in daily review queue

  -- State
  is_read BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  is_starred BOOLEAN DEFAULT FALSE,
  analyzed_at TIMESTAMPTZ,
  analysis_error TEXT,
  gmail_label_synced BOOLEAN DEFAULT FALSE,

  -- Sync type (migration 023)
  sync_type TEXT DEFAULT 'full', -- full, metadata

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, gmail_id)
);

-- Category CHECK constraint (migration 018, re-added in 028, updated Feb 2026)
ALTER TABLE emails ADD CONSTRAINT emails_category_check CHECK (
  category IS NULL OR category IN (
    'clients', 'work', 'personal_friends_family', 'family',
    'finance', 'travel', 'shopping', 'local',
    'newsletters_creator', 'newsletters_industry',
    'news_politics', 'product_updates', 'notifications'
  )
);
```

#### Life-Bucket Categories (13 values)
| Group | Category | Description |
|-------|----------|-------------|
| Work & Business | `clients` | Direct client correspondence, project work |
| Work & Business | `work` | Team, industry, professional |
| Family & Personal | `personal_friends_family` | Social, relationships |
| Family & Personal | `family` | School emails, kid activities, medical, appointments |
| Life Admin | `finance` | Bills, banking, receipts |
| Life Admin | `travel` | Flights, hotels, bookings |
| Life Admin | `shopping` | Orders, shipping, deals |
| Life Admin | `local` | Community events, local orgs |
| Information | `newsletters_creator` | Substacks, individual creator newsletters |
| Information | `newsletters_industry` | Industry digests, company newsletters |
| Information | `news_politics` | News outlets, political |
| Information | `product_updates` | SaaS tools, tech products |
| Transient | `notifications` | Verification codes, OTPs, login alerts, password resets |

### email_analyses
AI analyzer outputs stored as JSONB for flexibility.

```sql
CREATE TABLE email_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Analysis results (JSONB)
  categorization JSONB,       -- {category, labels, signal_strength, reply_worthiness, email_type, ai_brief, confidence, reasoning, topics, summary, quick_action, additional_categories}
  action_extraction JSONB,    -- {has_action, actions[], urgency_score} (supports multi-action)
  client_tagging JSONB,       -- {client_match, client_id, client_name, confidence, relationship_signal}
  event_detection JSONB,      -- {has_event, event_title, event_date, event_locality, ...}
  url_extraction JSONB,       -- {has_links, links[], summary, confidence} — Deep URL intelligence from LinkAnalyzer (migration 042)
  content_opportunity JSONB,  -- Future
  content_digest JSONB,       -- {gist, key_points, links, content_type, golden_nuggets, email_style_ideas} (migration 025, enhanced Feb 2026)

  -- Phase 2 analyzer columns (Feb 2026)
  idea_sparks JSONB,          -- {has_ideas, ideas[{idea, type, relevance, confidence}], confidence} (migration 033)
  insight_extraction JSONB,   -- {has_insights, insights[{insight, type, topics[], confidence}], confidence} (migration 034)
  news_brief JSONB,           -- {has_news, news_items[{headline, detail, topics[], date_mentioned, confidence}], confidence} (migration 034)
  multi_event_detection JSONB, -- {has_events, events[{event_title, event_date, event_time, location, ...}]} max 10 (migration 035)

  analyzer_version TEXT DEFAULT '1.0',
  tokens_used INTEGER,
  processing_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### actions
To-do items extracted from emails.

```sql
CREATE TABLE actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_id UUID REFERENCES emails(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  description TEXT,
  action_type TEXT,          -- respond, review, create, schedule, decide, pay, submit, register, book, none
  priority TEXT DEFAULT 'medium', -- low, medium, high, urgent
  urgency_score INTEGER DEFAULT 5,
  deadline TIMESTAMPTZ,
  estimated_minutes INTEGER,

  status TEXT DEFAULT 'pending', -- pending, in_progress, completed, cancelled
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### email_ideas (migration 033)
User-saved ideas from the IdeaSpark analyzer. Ideas are generated per-email and stored in `email_analyses.idea_sparks`. When a user saves/stars an idea, it is promoted to this table.

```sql
CREATE TABLE email_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_id UUID REFERENCES emails(id) ON DELETE SET NULL,

  idea TEXT NOT NULL,
  idea_type TEXT NOT NULL,   -- social_post, networking, business, content_creation, hobby, shopping, date_night, family_activity, personal_growth, community
  relevance TEXT,
  status TEXT NOT NULL DEFAULT 'new',  -- new, saved, dismissed, done
  confidence DECIMAL(3,2),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes:**
- `idx_email_ideas_user_status` — user_id + status (excludes dismissed)
- `idx_email_ideas_email` — email_id (source tracking)

**RLS:** Users can only CRUD their own ideas (`auth.uid() = user_id`).

### projects (migration 041)
Project containers for organizing ideas, tasks, and routines.

```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identity
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,                              -- Emoji icon
  color TEXT DEFAULT '#3b82f6',           -- Hex color for UI stripe

  -- Status & priority
  status TEXT NOT NULL DEFAULT 'active',  -- active, on_hold, completed, archived
  priority TEXT NOT NULL DEFAULT 'medium', -- low, medium, high

  -- Date range
  start_date DATE,
  end_date DATE,

  -- Relations
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### project_items (migration 041)
Ideas, tasks, and routines within projects. Items can exist without a project (`project_id` is nullable).

```sql
CREATE TABLE project_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

  -- Item identity
  item_type TEXT NOT NULL DEFAULT 'task', -- idea, task, routine
  title TEXT NOT NULL,
  description TEXT,

  -- Status & priority
  status TEXT NOT NULL DEFAULT 'pending', -- backlog, pending, in_progress, completed, cancelled
  priority TEXT NOT NULL DEFAULT 'medium', -- low, medium, high, urgent

  -- Date range & due date
  start_date DATE,
  due_date DATE,
  end_date DATE,

  -- Recurrence (for routines)
  recurrence_pattern TEXT,               -- daily, weekly, biweekly, monthly, quarterly, yearly
  recurrence_config JSONB DEFAULT '{}',  -- {dayOfWeek, dayOfMonth, interval, endDate}

  -- Time tracking
  estimated_minutes INTEGER,

  -- Source linking
  source_action_id UUID REFERENCES actions(id) ON DELETE SET NULL,
  source_email_id UUID REFERENCES emails(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,

  -- Organization
  tags TEXT[],
  sort_order INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### extracted_dates
Timeline dates/events extracted from emails. Powers Hub and Events views.

```sql
CREATE TABLE extracted_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_id UUID REFERENCES emails(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,

  -- Date info
  date_type TEXT NOT NULL,   -- deadline, event, appointment, payment_due, birthday, etc.
  date DATE NOT NULL,
  event_time TIME,
  end_date DATE,
  end_time TIME,
  timezone TEXT DEFAULT 'America/Chicago',

  -- Context
  title TEXT NOT NULL,
  description TEXT,
  source_snippet TEXT,
  related_entity TEXT,

  -- Recurrence
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_pattern TEXT,
  recurrence_end_date DATE,

  -- Extraction metadata
  confidence DECIMAL(3,2),
  extracted_by TEXT DEFAULT 'date_extractor',

  -- Hub display & user interaction
  priority_score INTEGER DEFAULT 5,
  is_acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,
  is_hidden BOOLEAN DEFAULT FALSE,
  snoozed_until TIMESTAMPTZ,

  -- Rich event metadata (migration 019)
  event_metadata JSONB,      -- {locality, locationType, location, rsvpRequired, ...}

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Deduplication
CREATE UNIQUE INDEX idx_extracted_dates_dedup
  ON extracted_dates(email_id, date_type, date, title)
  WHERE email_id IS NOT NULL;
```

### saved_insights (migration 034)
User-promoted insights from the InsightExtractor analyzer. Insights are transient in `email_analyses.insight_extraction`; saved here when user explicitly saves them.

```sql
CREATE TABLE saved_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_id UUID REFERENCES emails(id) ON DELETE SET NULL,

  insight TEXT NOT NULL,                -- The insight text
  insight_type TEXT NOT NULL,           -- tip, framework, observation, counterintuitive, trend
  topics TEXT[] DEFAULT '{}',           -- Related topics
  status TEXT NOT NULL DEFAULT 'new',   -- new, saved, dismissed, archived
  confidence DECIMAL(3,2),             -- AI confidence score 0-1

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes:**
- `idx_saved_insights_user_status` — user_id + status
- `idx_saved_insights_email` — email_id (source tracking)

**RLS:** Users can only CRUD their own insights (`auth.uid() = user_id`).

### saved_news (migration 034)
User-promoted news items from the NewsBrief analyzer. News items are transient in `email_analyses.news_brief`; saved here when user explicitly saves them.

```sql
CREATE TABLE saved_news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_id UUID REFERENCES emails(id) ON DELETE SET NULL,

  headline TEXT NOT NULL,               -- News headline
  detail TEXT,                          -- Additional detail
  topics TEXT[] DEFAULT '{}',           -- Related topics
  date_mentioned DATE,                  -- When the news happened
  status TEXT NOT NULL DEFAULT 'new',   -- new, saved, dismissed, archived
  confidence DECIMAL(3,2),             -- AI confidence score 0-1

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes:**
- `idx_saved_news_user_status` — user_id + status
- `idx_saved_news_email` — email_id (source tracking)
- `idx_saved_news_date` — user_id + date_mentioned DESC (timeline view)

**RLS:** Users can only CRUD their own news items (`auth.uid() = user_id`).

### saved_links (migration 042)
User-promoted links from the LinkAnalyzer. Links are analyzed during email processing
and stored in `email_analyses.url_extraction` JSONB. When a user saves/bookmarks a link,
it's promoted to this table for persistent tracking.

```sql
CREATE TABLE saved_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_id UUID REFERENCES emails(id) ON DELETE SET NULL,

  url TEXT NOT NULL,                -- The URL
  title TEXT NOT NULL,              -- Link title
  description TEXT,                 -- Why this link matters
  link_type TEXT NOT NULL,          -- article, registration, document, video, product, tool, social, unsubscribe, other
  priority TEXT NOT NULL DEFAULT 'reference',  -- must_read, worth_reading, reference, skip
  topics TEXT[] DEFAULT '{}',       -- Topic tags (1-3 short tags)
  status TEXT NOT NULL DEFAULT 'new',          -- new, saved, read, archived, dismissed
  expires_at DATE,                  -- Expiration date if time-limited
  confidence DECIMAL(3,2),          -- AI confidence score 0-1

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes:**
- `idx_saved_links_user_status` — user_id + status (main query)
- `idx_saved_links_email` — email_id (source tracking)
- `idx_saved_links_user_priority` — user_id + priority (priority filtering)
- `idx_saved_links_user_expires` — user_id + expires_at (expiration queries)

**RLS:** Users can only CRUD their own links (`auth.uid() = user_id`).

### email_summaries (migration 038)
AI-synthesized narrative digests with themed sections and stats.

```sql
CREATE TABLE email_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Summary content
  headline TEXT NOT NULL,                    -- Conversational 1-2 sentence overview
  sections JSONB NOT NULL DEFAULT '[]',      -- Themed sections [{theme, icon, items[{text, email_ids, action_needed, urgency}]}]
  stats JSONB NOT NULL DEFAULT '{}',         -- {new_emails, threads_active, actions_pending, deadlines_upcoming}

  -- Coverage window
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  emails_included INTEGER NOT NULL DEFAULT 0,
  threads_included INTEGER NOT NULL DEFAULT 0,

  -- Email reference index (migration 039a)
  email_index JSONB,            -- Maps email_id → {subject, sender, category} for cross-referencing

  -- AI metadata
  tokens_used INTEGER,
  estimated_cost NUMERIC(10,6),
  processing_time_ms INTEGER,
  model TEXT DEFAULT 'gpt-4.1-mini',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### user_summary_state (migration 038)
Lightweight staleness tracking for summary generation.

```sql
CREATE TABLE user_summary_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_summary_at TIMESTAMPTZ,
  is_stale BOOLEAN NOT NULL DEFAULT true,
  emails_since_last INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### user_event_states
User decisions about events (separate from AI analysis).

```sql
CREATE TABLE user_event_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,

  state TEXT NOT NULL CHECK (state IN ('dismissed', 'maybe', 'saved_to_calendar')),
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, email_id, state)
);
```

---

## Email Sending Tables (migration 026)

### email_templates
Reusable templates with merge field support (`{{first_name}}`, `{{company}}`, etc.).

```sql
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,
  category TEXT,                -- follow_up, introduction, outreach, thank_you
  subject_template TEXT NOT NULL,
  body_html_template TEXT NOT NULL,
  body_text_template TEXT,
  merge_fields TEXT[] DEFAULT ARRAY['first_name', 'last_name', 'email', 'company'],

  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### email_campaigns
Mail merge / bulk sending with throttling.

```sql
CREATE TABLE email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_account_id UUID NOT NULL REFERENCES gmail_accounts(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  subject_template TEXT NOT NULL,
  body_html_template TEXT NOT NULL,
  body_text_template TEXT,

  recipients JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'in_progress', 'paused', 'completed', 'cancelled')),

  scheduled_at TIMESTAMPTZ,
  throttle_seconds INTEGER DEFAULT 25,

  -- Progress
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  open_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  current_index INTEGER DEFAULT 0,

  -- Follow-up
  follow_up_enabled BOOLEAN DEFAULT FALSE,
  follow_up_condition TEXT CHECK (follow_up_condition IN ('no_open', 'no_reply', 'both')),
  follow_up_delay_hours INTEGER DEFAULT 48,
  follow_up_subject TEXT,
  follow_up_body_html TEXT,

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  last_send_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### outbound_emails
Tracks all outgoing emails: drafts, scheduled, sent, failed.

```sql
CREATE TABLE outbound_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_account_id UUID NOT NULL REFERENCES gmail_accounts(id) ON DELETE CASCADE,

  campaign_id UUID REFERENCES email_campaigns(id) ON DELETE SET NULL,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,

  -- Recipients
  to_email TEXT NOT NULL,
  to_name TEXT,
  cc_emails TEXT[],
  bcc_emails TEXT[],
  reply_to TEXT,

  -- Content
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,

  -- Gmail integration
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  in_reply_to TEXT,
  references_header TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'queued', 'sending', 'sent', 'failed', 'cancelled')),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,

  -- Open tracking
  tracking_id UUID UNIQUE DEFAULT gen_random_uuid(),
  tracking_enabled BOOLEAN DEFAULT TRUE,
  open_count INTEGER DEFAULT 0,
  first_opened_at TIMESTAMPTZ,
  last_opened_at TIMESTAMPTZ,

  -- Reply tracking
  has_reply BOOLEAN DEFAULT FALSE,
  reply_received_at TIMESTAMPTZ,
  reply_email_id UUID,

  -- Follow-up
  follow_up_enabled BOOLEAN DEFAULT FALSE,
  follow_up_condition TEXT CHECK (follow_up_condition IN ('no_open', 'no_reply', 'both')),
  follow_up_delay_hours INTEGER DEFAULT 48,
  follow_up_email_id UUID REFERENCES outbound_emails(id) ON DELETE SET NULL,
  follow_up_sent BOOLEAN DEFAULT FALSE,

  -- Error handling
  error_message TEXT,
  error_code TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_retry_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### email_open_events
Tracking pixel hit records.

```sql
CREATE TABLE email_open_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbound_email_id UUID NOT NULL REFERENCES outbound_emails(id) ON DELETE CASCADE,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  country TEXT,
  city TEXT,
  device_type TEXT,     -- desktop, mobile, tablet
  email_client TEXT,    -- gmail, outlook, apple_mail
  fingerprint TEXT      -- Dedup hash of IP + user agent
);
```

### daily_send_quotas
Rate limiting: 400 emails/day per user.

```sql
CREATE TABLE daily_send_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  emails_sent INTEGER DEFAULT 0,
  quota_limit INTEGER DEFAULT 400,
  UNIQUE(user_id, date)
);
```

---

## Utility Tables

### sync_logs
```sql
CREATE TABLE sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_account_id UUID REFERENCES gmail_accounts(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL,    -- full, incremental
  emails_fetched INTEGER DEFAULT 0,
  emails_analyzed INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'started', -- started, completed, failed
  error_message TEXT,
  duration_ms INTEGER,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

### scheduled_sync_runs
Background sync execution tracking.

```sql
CREATE TABLE scheduled_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  accounts_processed INTEGER DEFAULT 0,
  accounts_succeeded INTEGER DEFAULT 0,
  accounts_failed INTEGER DEFAULT 0,
  accounts_skipped INTEGER DEFAULT 0,
  emails_fetched INTEGER DEFAULT 0,
  emails_created INTEGER DEFAULT 0,
  emails_analyzed INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running', -- running, completed, failed, partial
  results JSONB DEFAULT '[]',
  error TEXT,
  trigger_source TEXT DEFAULT 'cron'
);
```

### gmail_push_logs
Push notification audit trail.

```sql
CREATE TABLE gmail_push_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_account_id UUID REFERENCES gmail_accounts(id),
  email_address TEXT NOT NULL,
  history_id TEXT NOT NULL,
  pubsub_message_id TEXT,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  processing_time_ms INTEGER,
  messages_found INTEGER DEFAULT 0,
  messages_synced INTEGER DEFAULT 0,
  messages_analyzed INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'received', -- received, processing, completed, skipped, failed
  skip_reason TEXT,
  error TEXT
);
```

### api_usage_logs
OpenAI and Gmail API cost tracking.

```sql
CREATE TABLE api_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  service TEXT NOT NULL,       -- openai, gmail
  endpoint TEXT,
  model TEXT,
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  tokens_total INTEGER DEFAULT 0,
  estimated_cost NUMERIC(10,6),
  email_id UUID REFERENCES emails(id) ON DELETE SET NULL,
  analyzer_name TEXT,
  duration_ms INTEGER,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Database Functions

### Cost Tracking
| Function | Returns | Description |
|----------|---------|-------------|
| `get_daily_api_cost(user_id, date)` | DECIMAL | Sum of API costs for a day |
| `get_monthly_api_cost(user_id, month)` | DECIMAL | Sum of API costs for a month |
| `is_within_daily_limit(user_id)` | BOOLEAN | Check against user_settings daily limit |
| `is_within_monthly_limit(user_id)` | BOOLEAN | Check against user_settings monthly limit |
| `get_cost_usage_summary(user_id)` | RECORD | Daily/monthly costs, limits, percentages |

### Email Sending
| Function | Returns | Description |
|----------|---------|-------------|
| `can_send_email(user_id)` | BOOLEAN | Check daily send quota |
| `increment_send_count(user_id)` | BOOLEAN | Atomic increment, FALSE if at limit |
| `get_remaining_quota(user_id)` | INTEGER | Emails remaining today |
| `get_scheduled_emails_to_send(limit)` | TABLE | Due scheduled emails with quota check |
| `record_email_open(tracking_id, ...)` | BOOLEAN | Record pixel hit, update stats |
| `get_emails_for_follow_up(limit)` | TABLE | Emails needing follow-up action |
| `get_active_campaigns(limit)` | TABLE | Campaigns ready for next send |
| `increment_template_usage(template_id)` | VOID | Track template usage count |

### Contacts & Dates
| Function | Returns | Description |
|----------|---------|-------------|
| `upsert_contact_from_email(...)` | UUID | Create/update contact from email data |
| `get_top_contacts(user_id, limit)` | TABLE | Top contacts by email count |
| `classify_sender_type_from_email(email)` | TEXT | Pattern-based sender classification |
| `get_upcoming_dates(user_id, ...)` | TABLE | Upcoming dates for Hub view |
| `get_events_with_metadata(user_id, ...)` | TABLE | Events with rich metadata |
| `has_event_state(user_id, email_id, state)` | BOOLEAN | Check event user state |

### Sync & Maintenance
| Function | Returns | Description |
|----------|---------|-------------|
| `acquire_sync_lock(account_id, seconds)` | BOOLEAN | Prevent concurrent syncs |
| `release_sync_lock(account_id)` | VOID | Release sync lock |
| `cleanup_old_logs()` | VOID | Delete logs > 30 days |
| `cleanup_old_sync_runs(days_to_keep)` | INTEGER | Delete old scheduled_sync_runs, returns count deleted |
| `cleanup_old_push_logs(days_to_keep)` | INTEGER | Delete old gmail_push_logs, returns count deleted |
| `get_active_clients(user_id)` | SETOF contacts | Active client contacts (is_client=true) sorted by client_priority |
| `create_default_user_settings()` | TRIGGER | Auto-create settings on user signup |
| `create_default_user_context()` | TRIGGER | Auto-create context on user signup |
| `mark_backfill_complete(account_id)` | VOID | Mark post-initial-sync backfill as completed |

### Watch Management (migration 039)
| Function | Returns | Description |
|----------|---------|-------------|
| `update_gmail_watch(account_id, history_id, expiration, resource_id)` | VOID | Update watch state after creation |
| `clear_gmail_watch(account_id)` | VOID | Clear watch on disconnect |
| `get_expiring_watches(hours_ahead)` | TABLE | Watches expiring within N hours |
| `get_accounts_needing_watch()` | TABLE | Accounts with push_enabled but no active watch |
| `record_watch_failure(account_id, error_message)` | VOID | Increment failure count, store error |
| `reset_watch_failures(account_id)` | VOID | Clear failures after successful renewal |
| `get_accounts_with_watch_problems(min_failures)` | TABLE | Accounts with repeated watch failures |
| `mark_watch_alert_sent(account_id)` | VOID | Track when alert was sent |
| `mark_history_stale(account_id)` | VOID | Flag account for full sync on history ID expiry |
| `validate_history_id(account_id, history_id)` | VOID | Record successful history ID validation |

### Views
| View | Description |
|------|-------------|
| `accounts_needing_sync` | Accounts eligible for scheduled sync, sorted by staleness. Used by sync-emails Edge Function. |

---

## RLS (Row Level Security)

All tables have RLS enabled. Policy pattern:
- **Users can only access their own data** (via `auth.uid() = user_id`)
- **Service role key bypasses RLS** for API routes doing bulk operations
- **Functions use SECURITY DEFINER** for cross-table queries

---

## Migration Files (001-044)

All migrations are in `scripts/migration-*.sql` (not `supabase/migrations/`).

| # | File | What it does |
|---|------|-------------|
| 001 | initial_schema.sql | user_profiles, gmail_accounts, update_updated_at trigger |
| 002 | clients_table.sql | clients table |
| 003 | emails_table.sql | emails table with original categories |
| 004 | email_analyses_table.sql | email_analyses JSONB storage |
| 005 | actions_table.sql | actions table |
| 006 | sync_logs.sql | sync_logs table |
| 007 | api_usage_logs.sql | api_usage_logs + cost functions |
| 008 | cleanup_functions.sql | cleanup_old_logs, get_active_clients |
| 009 | user_settings.sql | user_settings + cost limit functions |
| 010 | sync_progress_column.sql | Add sync_progress to user_profiles |
| 011 | user_context.sql | user_context table + VIP functions |
| 012 | contacts.sql | contacts table + enrichment functions |
| 013 | extracted_dates.sql | extracted_dates table + Hub functions |
| 014 | scheduled_sync.sql | scheduled_sync_runs table |
| 015 | gmail_push_notifications.sql | Push notification columns + gmail_push_logs |
| 016 | sync_improvements.sql | Sync locking, health monitoring |
| 017 | email_analysis_fields.sql | Add summary, quick_action, labels to emails |
| 018 | category_refactor_and_event_locality.sql | Life-bucket categories + sender_patterns |
| 019 | event_metadata_column.sql | Add event_metadata JSONB to extracted_dates |
| 020 | email_analyses_update_policy.sql | Update/delete RLS for email_analyses |
| 021 | user_event_states.sql | user_event_states table |
| 022 | google_contacts_integration.sql | Google Contacts columns + contact_aliases |
| 023 | historical_sync.sql | Historical sync columns + metadata emails |
| 024 | sender_type_classification.sql | Sender type columns on contacts |
| 025 | content_digest_and_multi_actions.sql | content_digest + gist/key_points |
| 026 | email_sending.sql | Templates, campaigns, outbound, tracking, quotas |
| 027 | backfill_email_categories.sql | Data migration: backfill categories |
| 028 | category_cleanup_and_cache_clear.sql | Data migration: final category cleanup |
| 029 | merge_clients_into_contacts.sql | Merge clients table into contacts |
| 030 | cleanup_client_id_columns.sql | Remove deprecated client_id columns |
| 031 | profile_suggestions.sql | Add profile_suggestions JSONB + timestamp to user_context |
| 032 | signal_strength_reply_worthiness.sql | Add signal_strength + reply_worthiness to emails + Hub query indexes |
| 033 | idea-sparks-and-review-queue.sql | idea_sparks JSONB on email_analyses, email_ideas table, reviewed_at on emails, expanded action_type constraint |
| 034 | insight-extraction-and-news-brief.sql | insight_extraction + news_brief JSONB on email_analyses, saved_insights + saved_news tables |
| 035 | multi-event-detection.sql | multi_event_detection JSONB on email_analyses (up to 10 events per email) |
| 036 | additional-categories-and-notifications.sql | additional_categories TEXT[] on emails + notifications category added to CHECK |
| 037 | email-type-and-ai-brief.sql | email_type + ai_brief columns on emails |
| 038 | email-summaries.sql | email_summaries + user_summary_state tables with RLS |
| 039a | email-summary-index.sql | email_index JSONB on email_summaries |
| 039b | scheduled-sync-and-watch-functions.sql | backfill_completed_at on gmail_accounts, accounts_needing_sync VIEW, 13 watch management/sync/cleanup functions |
| 040 | profile-expansion.sql | gender, birthday, address, employment, household_members, pets on user_context |
| 041 | projects.sql | projects + project_items tables with RLS, indexes, triggers, recurrence support |
| 042 | link-analysis.sql | saved_links table, enhanced url_extraction JSONB with priority scoring |
| 043 | denormalize-urgency-relationship.sql | urgency_score INTEGER + relationship_signal TEXT on emails (backfill from email_analyses) |
| 044 | golden-nugget-count.sql | golden_nugget_count INTEGER on emails (backfill from content_digest nuggets) |
| — | migrate-categories-feb2026.sql | Data migration: consolidate old categories to 13 life-bucket values |

---

## Planned Tables (Not Yet Created)

These appear in earlier documentation but have **no migration files**:
- `events` - Dedicated events table (currently using extracted_dates)
- `content_opportunities` - Tweet ideas, networking opportunities
