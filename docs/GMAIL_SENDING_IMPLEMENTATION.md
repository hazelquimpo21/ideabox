# Gmail Email Sending - Implementation Guide

> **Status:** Phase 1-3 Complete (Core Implementation)
> **Last Updated:** 2026-01-26
> **Author:** Claude AI Assistant

## Overview

IdeaBox supports sending emails directly through users' Gmail accounts using the Gmail API. This bypasses third-party services like SendGrid, ensuring emails come from the user's actual Gmail address and appear in their Sent folder.

### Key Features

| Feature | Description |
|---------|-------------|
| **Direct Gmail Send** | Emails sent via Gmail API, not third-party services |
| **Open Tracking** | 1x1 tracking pixel to detect email opens |
| **Scheduling** | Send emails at a future date/time |
| **Rate Limiting** | 400 emails/day per user to respect Gmail limits |
| **Mail Merge** | Bulk sending with personalization tags |
| **Throttling** | 25-second delay between bulk sends |
| **Follow-up Automation** | Auto follow-up on no-open or no-reply |
| **Reusable Templates** | Save and reuse email templates with merge fields |
| **Inline Reply** | Reply to emails with editable subject line |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  ComposeEmail Modal  │  CampaignBuilder  │  Sent/Outbox  │  Templates Page  │
└──────────┬───────────┴────────┬──────────┴───────┬───────┴────────┬─────────┘
           │                    │                  │                │
           ▼                    ▼                  ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API ROUTES                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  /api/emails/send     │  /api/campaigns/*  │  /api/tracking/*  │  /api/templates/*
│  /api/emails/schedule │  /api/auth/add-send-scope              │
└──────────┬────────────┴────────┬───────────┴──────────┬────────┴────────────┘
           │                     │                      │
           ▼                     ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SERVICES                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  GmailSendService  │  CampaignService  │  TemplateService  │  QuotaService  │
└──────────┬─────────┴────────┬──────────┴────────┬─────────┴────────┬────────┘
           │                  │                   │                  │
           ▼                  ▼                   ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATABASE (Supabase)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  outbound_emails  │  email_campaigns  │  email_templates  │  daily_send_quotas
│  email_open_events                    │  gmail_accounts (updated)            │
└─────────────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BACKGROUND JOBS (Edge Functions)                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  send-scheduled-emails (1 min)  │  campaign-processor (30 sec)              │
│  follow-up-checker (15 min)     │                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Table: `outbound_emails`

Primary table for all outbound email tracking.

```sql
CREATE TABLE outbound_emails (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_account_id UUID NOT NULL REFERENCES gmail_accounts(id) ON DELETE CASCADE,

  -- Optional associations
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

  -- Gmail integration (populated after send)
  gmail_message_id TEXT,        -- Gmail's message ID after sending
  gmail_thread_id TEXT,         -- Thread ID for conversation tracking
  in_reply_to TEXT,             -- Message-ID this is replying to

  -- Scheduling & Status
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'queued', 'sending', 'sent', 'failed', 'cancelled')),
  scheduled_at TIMESTAMPTZ,     -- When to send (NULL = immediate)
  sent_at TIMESTAMPTZ,          -- When actually sent

  -- Open Tracking
  tracking_id UUID UNIQUE DEFAULT gen_random_uuid(),
  open_count INTEGER DEFAULT 0,
  first_opened_at TIMESTAMPTZ,
  last_opened_at TIMESTAMPTZ,

  -- Reply Tracking
  has_reply BOOLEAN DEFAULT FALSE,
  reply_received_at TIMESTAMPTZ,

  -- Follow-up Configuration
  follow_up_enabled BOOLEAN DEFAULT FALSE,
  follow_up_condition TEXT CHECK (follow_up_condition IN ('no_open', 'no_reply', 'both')),
  follow_up_delay_hours INTEGER DEFAULT 48,
  follow_up_email_id UUID REFERENCES outbound_emails(id),
  follow_up_sent BOOLEAN DEFAULT FALSE,

  -- Error Handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  last_retry_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Table: `email_campaigns`

Mail merge / bulk sending campaigns.

```sql
CREATE TABLE email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_account_id UUID NOT NULL REFERENCES gmail_accounts(id) ON DELETE CASCADE,

  -- Campaign Info
  name TEXT NOT NULL,
  description TEXT,

  -- Template (with merge tags: {{first_name}}, {{company}}, etc.)
  subject_template TEXT NOT NULL,
  body_html_template TEXT NOT NULL,
  body_text_template TEXT,

  -- Can optionally use a saved template
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,

  -- Recipients
  recipients JSONB NOT NULL DEFAULT '[]',  -- [{email, first_name, company, custom_fields...}]

  -- Status
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'in_progress', 'paused', 'completed', 'cancelled')),

  -- Scheduling & Throttling
  scheduled_at TIMESTAMPTZ,
  throttle_seconds INTEGER DEFAULT 25,

  -- Progress Tracking
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  open_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  current_index INTEGER DEFAULT 0,  -- For resuming paused campaigns

  -- Follow-up Settings (applies to all campaign emails)
  follow_up_enabled BOOLEAN DEFAULT FALSE,
  follow_up_condition TEXT CHECK (follow_up_condition IN ('no_open', 'no_reply', 'both')),
  follow_up_delay_hours INTEGER DEFAULT 48,
  follow_up_subject TEXT,
  follow_up_body_html TEXT,

  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Table: `email_templates`

Reusable email templates with merge fields.

```sql
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Template Info
  name TEXT NOT NULL,
  description TEXT,

  -- Content (with merge tags: {{first_name}}, {{company}}, etc.)
  subject_template TEXT NOT NULL,
  body_html_template TEXT NOT NULL,
  body_text_template TEXT,

  -- Available merge fields (for UI display)
  merge_fields TEXT[] DEFAULT ARRAY['first_name', 'last_name', 'email', 'company'],

  -- Categorization
  category TEXT,  -- e.g., 'follow_up', 'introduction', 'newsletter'

  -- Usage Stats
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Table: `email_open_events`

Detailed tracking of email opens.

```sql
CREATE TABLE email_open_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbound_email_id UUID NOT NULL REFERENCES outbound_emails(id) ON DELETE CASCADE,

  -- Event Data
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,

  -- Derived Data (from IP/UA parsing)
  country TEXT,
  city TEXT,
  device_type TEXT,  -- 'desktop', 'mobile', 'tablet'
  email_client TEXT, -- 'gmail', 'outlook', 'apple_mail', etc.

  -- Deduplication
  fingerprint TEXT   -- Hash of IP + user_agent to detect unique opens
);
```

### Table: `daily_send_quotas`

Rate limiting tracking.

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

### Alteration: `gmail_accounts`

Add send scope tracking.

```sql
ALTER TABLE gmail_accounts
  ADD COLUMN IF NOT EXISTS has_send_scope BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS send_scope_granted_at TIMESTAMPTZ;
```

---

## OAuth Scope

### Required Scope

```
https://www.googleapis.com/auth/gmail.send
```

### Scope Request Flow

1. User attempts to send email
2. System checks `gmail_accounts.has_send_scope`
3. If false, redirect to `/api/auth/add-send-scope`
4. OAuth flow grants additional scope
5. Callback updates `has_send_scope = true`
6. User can now send emails

---

## API Routes

### Email Sending

| Route | Method | Description |
|-------|--------|-------------|
| `POST /api/emails/send` | Send email immediately |
| `POST /api/emails/schedule` | Schedule email for later |
| `PATCH /api/emails/[id]` | Update draft/scheduled email |
| `DELETE /api/emails/[id]` | Delete draft or cancel scheduled |
| `POST /api/emails/[id]/cancel` | Cancel scheduled email |
| `GET /api/emails/outbox` | List sent/scheduled emails |
| `GET /api/emails/[id]/tracking` | Get tracking stats for email |

### Campaigns

| Route | Method | Description |
|-------|--------|-------------|
| `GET /api/campaigns` | List campaigns |
| `POST /api/campaigns` | Create campaign |
| `GET /api/campaigns/[id]` | Get campaign details |
| `PATCH /api/campaigns/[id]` | Update campaign |
| `DELETE /api/campaigns/[id]` | Delete campaign |
| `POST /api/campaigns/[id]/start` | Start campaign |
| `POST /api/campaigns/[id]/pause` | Pause campaign |
| `POST /api/campaigns/[id]/resume` | Resume campaign |
| `POST /api/campaigns/[id]/cancel` | Cancel campaign |
| `POST /api/campaigns/[id]/preview` | Preview merged email |

### Templates

| Route | Method | Description |
|-------|--------|-------------|
| `GET /api/templates` | List templates |
| `POST /api/templates` | Create template |
| `GET /api/templates/[id]` | Get template |
| `PATCH /api/templates/[id]` | Update template |
| `DELETE /api/templates/[id]` | Delete template |
| `POST /api/templates/[id]/preview` | Preview with sample data |

### Tracking

| Route | Method | Description |
|-------|--------|-------------|
| `GET /api/tracking/open/[trackingId]` | Serve tracking pixel |
| `GET /api/settings/send-quota` | Get today's quota usage |

### OAuth

| Route | Method | Description |
|-------|--------|-------------|
| `GET /api/auth/add-send-scope` | Initiate send scope OAuth |

---

## Services

### GmailSendService

Location: `/src/lib/gmail/gmail-send-service.ts`

```typescript
class GmailSendService {
  // Send a single email
  async sendEmail(options: SendEmailOptions): Promise<SendResult>

  // Send a reply in an existing thread
  async sendReply(originalMessageId: string, options: SendEmailOptions): Promise<SendResult>

  // Inject tracking pixel into HTML body
  injectTrackingPixel(html: string, trackingId: string): string

  // Build RFC 2822 MIME message
  buildMimeMessage(options: SendEmailOptions): string

  // Encode message for Gmail API
  encodeMessage(message: string): string
}
```

### TemplateService

Location: `/src/services/email/template-service.ts`

```typescript
class TemplateService {
  // Merge template with recipient data
  mergeTemplate(template: string, data: Record<string, string>): string

  // Extract merge fields from template
  extractMergeFields(template: string): string[]

  // Validate all merge fields have values
  validateMergeData(template: string, data: Record<string, string>): ValidationResult
}
```

### QuotaService

Location: `/src/services/email/quota-service.ts`

```typescript
class QuotaService {
  // Check if user can send more emails today
  async canSend(userId: string): Promise<boolean>

  // Get remaining quota for today
  async getRemainingQuota(userId: string): Promise<number>

  // Increment send count (returns false if at limit)
  async incrementSendCount(userId: string): Promise<boolean>

  // Get quota stats for display
  async getQuotaStats(userId: string): Promise<QuotaStats>
}
```

---

## Background Jobs

### send-scheduled-emails

**Schedule:** Every 1 minute
**Location:** `/supabase/functions/send-scheduled-emails/index.ts`

**Responsibilities:**
1. Query `outbound_emails` where `status='scheduled'` and `scheduled_at <= now`
2. For each email:
   - Check user quota via `can_send_email()`
   - Refresh Gmail token if needed
   - Send via Gmail API
   - Update status to `sent` with `gmail_message_id`
   - Increment quota counter
3. Handle failures with retry logic (max 3 retries)

### campaign-processor

**Schedule:** Every 30 seconds
**Location:** `/supabase/functions/campaign-processor/index.ts`

**Responsibilities:**
1. Query `email_campaigns` where `status='in_progress'`
2. For each active campaign:
   - Check if throttle delay has passed since last send
   - Check user quota
   - Get next recipient from `current_index`
   - Merge template with recipient data
   - Create and send outbound email
   - Update campaign progress
   - Wait `throttle_seconds` before next
3. Pause campaign if quota exhausted
4. Mark complete when all recipients sent

### follow-up-checker

**Schedule:** Every 15 minutes
**Location:** `/supabase/functions/follow-up-checker/index.ts`

**Responsibilities:**
1. Query emails with `follow_up_enabled=true` and `follow_up_sent=false`
2. Check if delay period has passed (`sent_at + follow_up_delay_hours`)
3. Evaluate condition:
   - `no_open`: `open_count = 0`
   - `no_reply`: `has_reply = false`
   - `both`: Either condition
4. If condition met, create follow-up email and schedule immediately
5. Mark original email `follow_up_sent=true`

---

## UI Components

### ComposeEmail

Location: `/src/components/email/ComposeEmail.tsx`

**Features:**
- Rich text editor (HTML body)
- To/CC/BCC fields with contact autocomplete
- Subject line (editable for replies)
- Template selector
- Merge field insertion buttons
- Schedule send datetime picker
- Gmail account selector
- Send scope authorization prompt

**Props:**
```typescript
interface ComposeEmailProps {
  mode: 'new' | 'reply' | 'forward';
  replyTo?: Email;           // Original email for replies
  initialTemplate?: Template;
  onSend: () => void;
  onClose: () => void;
}
```

### SentOutbox

Location: `/src/app/(auth)/sent/page.tsx`

**Features:**
- Tabs: Sent / Scheduled / Drafts
- Email list with status badges
- Open tracking stats (opens count, last opened)
- Cancel scheduled emails
- Resend failed emails
- Filter by date range

### CampaignBuilder

Location: `/src/components/campaigns/CampaignBuilder.tsx`

**Features:**
- Campaign name/description
- Template editor or template selector
- Recipient import (CSV paste or contact filter)
- Merge field mapping
- Preview with sample recipient
- Throttle settings
- Follow-up configuration
- Schedule start time

### TemplateManager

Location: `/src/app/(auth)/templates/page.tsx`

**Features:**
- Template list with categories
- Create/edit template modal
- Merge field documentation
- Preview with sample data
- Usage stats

---

## Merge Fields

### Standard Fields

| Field | Description |
|-------|-------------|
| `{{first_name}}` | Recipient's first name |
| `{{last_name}}` | Recipient's last name |
| `{{email}}` | Recipient's email address |
| `{{company}}` | Recipient's company name |

### Custom Fields

Users can define custom fields per campaign:
- `{{title}}`
- `{{phone}}`
- `{{custom_1}}` through `{{custom_5}}`

### Merge Syntax

```html
<p>Hi {{first_name}},</p>
<p>I noticed you work at {{company}} and wanted to reach out...</p>
```

---

## Rate Limiting

### Daily Limit: 400 Emails

**Why 400?**
- Gmail's sending limits vary by account type
- 400/day is safe for regular Gmail accounts
- Prevents spam flagging
- Protects user's sender reputation

### Enforcement

1. **API Layer:** Check before accepting send request
2. **Background Jobs:** Check before each send
3. **Campaign Processor:** Pause campaign when limit reached

### Throttling: 25 Seconds

**Why 25 seconds?**
- Gmail rate limits burst sending
- Mimics human sending patterns
- Reduces spam filter triggers
- ~140 emails/hour max throughput

---

## Tracking Pixel

### Implementation

```typescript
// Transparent 1x1 GIF (43 bytes)
const TRACKING_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

// Inject into HTML before </body>
function injectTrackingPixel(html: string, trackingId: string): string {
  const pixelUrl = `${APP_URL}/api/tracking/open/${trackingId}`;
  const pixel = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none!important" />`;
  return html.replace('</body>', `${pixel}</body>`);
}
```

### Privacy Considerations

- Only track: timestamp, IP (hashed), user agent
- No PII stored in tracking events
- IP used only for geo approximation, then discarded
- User agent parsed for device/client type only

---

## Reply Detection

### How It Works

1. Outbound email stores `gmail_message_id` after sending
2. Gmail API includes `Message-ID` header
3. When syncing inbound emails, extract `In-Reply-To` header
4. Match against `outbound_emails.gmail_message_id`
5. If match found: `UPDATE outbound_emails SET has_reply=true`

### Implementation Location

Modify `/src/lib/gmail/email-parser.ts` to extract `In-Reply-To` header during sync.

---

## Error Handling

### Send Failures

| Error | Action |
|-------|--------|
| Token expired | Refresh token, retry |
| Rate limited | Wait 60s, retry |
| Invalid recipient | Mark failed, no retry |
| Network error | Retry up to 3 times |
| Quota exceeded | Pause, notify user |

### Retry Logic

```typescript
const RETRY_DELAYS = [60, 300, 900]; // 1min, 5min, 15min

async function sendWithRetry(email: OutboundEmail): Promise<void> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await sendEmail(email);
      return;
    } catch (error) {
      if (isRetryable(error) && attempt < MAX_RETRIES) {
        await delay(RETRY_DELAYS[attempt] * 1000);
        continue;
      }
      throw error;
    }
  }
}
```

---

## Security

### RLS Policies

All tables have Row Level Security:
- Users can only access their own emails/campaigns/templates
- Service role required for background job operations

### Token Security

- Gmail tokens encrypted at rest (Supabase handles)
- Tokens refreshed automatically when expired
- Send scope verified before each send attempt

---

## Logging

### Log Categories

| Category | Logger Name | Description |
|----------|-------------|-------------|
| Sending | `GmailSend` | Email send operations |
| Tracking | `EmailTracking` | Open/click tracking |
| Campaigns | `CampaignProcessor` | Campaign operations |
| Quota | `SendQuota` | Rate limiting |
| Templates | `EmailTemplates` | Template operations |

### Log Levels

- `debug`: Detailed operation data
- `info`: Normal operations
- `warn`: Recoverable issues
- `error`: Failures requiring attention

---

## Testing

### Manual Testing

1. **Send Test:** Send email to yourself, verify in Gmail Sent
2. **Tracking Test:** Open email, check tracking event recorded
3. **Schedule Test:** Schedule email 2min ahead, verify sends
4. **Quota Test:** Temporarily set limit to 5, verify enforcement
5. **Campaign Test:** Create 3-recipient campaign, verify throttling

### Automated Tests

Location: `/src/lib/gmail/__tests__/gmail-send-service.test.ts`

- Unit tests for MIME message building
- Unit tests for template merging
- Integration tests for Gmail API (with mocks)

---

## Deployment

### Edge Functions Deployment

Deploy all three background Edge Functions:

```bash
# Deploy scheduled email sender
supabase functions deploy send-scheduled-emails

# Deploy campaign processor
supabase functions deploy campaign-processor

# Deploy follow-up checker
supabase functions deploy follow-up-checker
```

### Required Environment Variables

Set these in your Supabase project:

```bash
# For Edge Functions
supabase secrets set GOOGLE_CLIENT_ID="your-google-client-id"
supabase secrets set GOOGLE_CLIENT_SECRET="your-google-client-secret"
supabase secrets set APP_URL="https://your-app-url.com"
```

### Cron Job Setup

Set up pg_cron jobs to invoke the Edge Functions (run in Supabase SQL editor):

```sql
-- Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Send scheduled emails every minute
SELECT cron.schedule(
  'send-scheduled-emails',
  '* * * * *',
  $$SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-scheduled-emails',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  )$$
);

-- Process campaigns every minute
SELECT cron.schedule(
  'process-campaigns',
  '* * * * *',
  $$SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/campaign-processor',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  )$$
);

-- Check follow-ups every hour
SELECT cron.schedule(
  'check-follow-ups',
  '0 * * * *',
  $$SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/follow-up-checker',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  )$$
);
```

### Database Migration

Run the email sending migration:

```bash
supabase db push
```

Or apply manually:

```bash
psql "$DATABASE_URL" -f supabase/migrations/026_email_sending.sql
```

---

## Notes for Next Developer

### What's Implemented (Phase 1-3)

| Component | Status | Location |
|-----------|--------|----------|
| Database schema | ✅ Complete | `supabase/migrations/026_email_sending.sql` |
| Gmail send service | ✅ Complete | `src/lib/gmail/gmail-send-service.ts` |
| OAuth send scope flow | ✅ Complete | `src/app/api/auth/add-send-scope/route.ts` |
| Email send API | ✅ Complete | `src/app/api/emails/send/route.ts` |
| Outbox API | ✅ Complete | `src/app/api/emails/outbox/route.ts` |
| Templates API | ✅ Complete | `src/app/api/templates/route.ts` |
| Tracking pixel | ✅ Complete | `src/app/api/tracking/open/[trackingId]/route.ts` |
| Quota API | ✅ Complete | `src/app/api/settings/send-quota/route.ts` |
| ComposeEmail UI | ✅ Complete | `src/components/email/ComposeEmail.tsx` |
| Sent/Outbox page | ✅ Complete | `src/app/(auth)/sent/page.tsx` |
| Scheduled emails job | ✅ Complete | `supabase/functions/send-scheduled-emails/index.ts` |
| Campaign processor job | ✅ Complete | `supabase/functions/campaign-processor/index.ts` |
| Follow-up checker job | ✅ Complete | `supabase/functions/follow-up-checker/index.ts` |

### What Needs Work (Phase 4+)

1. **Campaign Builder UI** - `/src/components/campaigns/CampaignBuilder.tsx`
   - Recipient import (CSV paste or contact selection)
   - Merge field mapping UI
   - Campaign preview with sample recipient
   - Start/pause/cancel controls

2. **Campaign API Routes**
   - `POST /api/campaigns` - Create campaign
   - `POST /api/campaigns/[id]/start` - Start campaign
   - `POST /api/campaigns/[id]/pause` - Pause campaign
   - `GET /api/campaigns/[id]` - Get campaign with stats

3. **Campaign Recipients Table**
   - Need to add `email_campaign_recipients` table to migration
   - Currently campaigns use JSONB `recipients` field
   - For better tracking, split into proper relation table

4. **Templates Page UI** - `/src/app/(auth)/templates/page.tsx`
   - Template list with categories
   - Template editor modal
   - Merge field insertion helper

5. **Reply Detection**
   - Modify email sync to extract `In-Reply-To` header
   - Match against `outbound_emails.gmail_message_id`
   - Update `has_reply` flag

6. **Analytics Dashboard**
   - Open rates, click rates (once implemented)
   - Campaign performance charts
   - Follow-up effectiveness

### Key Technical Details

**MIME Message Building:**
- Uses RFC 2822 format
- Subject encoded with UTF-8 base64 (`=?UTF-8?B?...?=`)
- Multipart/alternative with plain text and HTML parts
- URL-safe base64 for Gmail API (`-` instead of `+`, `_` instead of `/`)

**Token Refresh:**
- All Edge Functions check token expiry with 5-minute buffer
- Refresh via Google OAuth token endpoint
- Update database with new token and expiry

**Throttling Strategy:**
- Campaign processor sends max 2 emails per minute per campaign
- 25-second delay between emails
- Fits within 1-minute cron interval

**Follow-up Conditions:**
- `no_reply` - Email opened but no reply (most common)
- `no_open` - Email not opened
- `always` - Always follow up after delay

### Database Functions

These helper functions are created by the migration:

```sql
-- Check if user can send (quota + send scope)
can_send_email(p_user_id UUID, p_gmail_account_id UUID) RETURNS BOOLEAN

-- Increment daily send count
increment_send_count(p_user_id UUID) RETURNS BOOLEAN

-- Get remaining quota for today
get_remaining_quota(p_user_id UUID) RETURNS INTEGER

-- Get scheduled emails ready to send
get_scheduled_emails_to_send(p_limit INTEGER) RETURNS SETOF outbound_emails

-- Record open event with deduplication
record_email_open(
  p_tracking_id UUID,
  p_ip_address INET,
  p_user_agent TEXT,
  p_device_type TEXT,
  p_email_client TEXT
) RETURNS BOOLEAN
```

### Common Issues

1. **"Token has been expired or revoked"**
   - User may have revoked access
   - Need to re-authenticate Gmail account

2. **"Insufficient Permission" on send**
   - User hasn't granted `gmail.send` scope
   - Redirect to `/api/auth/add-send-scope`

3. **Emails not sending on schedule**
   - Check pg_cron is enabled
   - Verify cron job is created
   - Check Edge Function logs in Supabase dashboard

4. **Tracking pixel blocked**
   - Gmail's image proxy may cache
   - Some email clients block remote images
   - This is expected - tracking won't be 100%

### Testing Tips

1. **Test send scope flow:**
   - Remove `has_send_scope` from a Gmail account
   - Try to send - should prompt for authorization

2. **Test scheduling:**
   - Schedule an email for 2 minutes ahead
   - Watch Edge Function logs

3. **Test quota:**
   - Set `quota_limit` to 2 for your user
   - Try to send 3 emails

4. **Test tracking:**
   - Send email with tracking enabled
   - Open in incognito (to avoid Gmail proxy)
   - Check `email_open_events` table

---

## Future Enhancements

- [ ] Click tracking (wrap links with redirect)
- [ ] Attachment support (up to 25MB via Gmail API)
- [ ] A/B testing for campaigns
- [ ] Unsubscribe management
- [ ] Bounce detection via Gmail API
- [ ] Advanced analytics dashboard
- [ ] Email scheduling optimization (best time to send)
- [ ] Campaign recipient table (split from JSONB)
- [ ] Rich text editor (TipTap or similar)
- [ ] Contact autocomplete in ComposeEmail
