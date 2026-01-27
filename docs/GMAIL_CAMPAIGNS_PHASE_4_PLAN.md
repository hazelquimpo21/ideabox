# Gmail Campaigns - Phase 4+ Implementation Plan

> **Status:** Planning
> **Created:** 2026-01-27
> **Target:** Complete Campaign Builder, Templates UI, Reply Detection, Analytics

## Overview

This document outlines the implementation plan for the remaining Gmail email sending features. Phases 1-3 have established the core infrastructure (database schema, Gmail send service, background jobs). This plan covers Phase 4+ features.

---

## Current State Summary

### What's Already Built (Phases 1-3)

| Component | Location | Status |
|-----------|----------|--------|
| Database schema (all tables) | `supabase/migrations/026_email_sending.sql` | ✅ Complete |
| Gmail send service | `src/lib/gmail/gmail-send-service.ts` | ✅ Complete |
| Send API route | `src/app/api/emails/send/route.ts` | ✅ Complete |
| Outbox API | `src/app/api/emails/outbox/route.ts` | ✅ Complete |
| Templates API (CRUD) | `src/app/api/templates/route.ts` | ✅ Complete |
| Tracking pixel | `src/app/api/tracking/open/[trackingId]/route.ts` | ✅ Complete |
| ComposeEmail UI | `src/components/email/ComposeEmail.tsx` | ✅ Complete |
| Sent/Outbox page | `src/app/(auth)/sent/page.tsx` | ✅ Complete |
| Background jobs (3) | `supabase/functions/` | ✅ Complete |

---

## Phase 4: Campaign Builder & API

### 4.1 Campaign API Routes

**Location:** `src/app/api/campaigns/`

#### Routes to Create:

```
GET    /api/campaigns              - List all campaigns
POST   /api/campaigns              - Create new campaign
GET    /api/campaigns/[id]         - Get campaign with stats
PATCH  /api/campaigns/[id]         - Update campaign (draft only)
DELETE /api/campaigns/[id]         - Delete campaign
POST   /api/campaigns/[id]/start   - Start/resume campaign
POST   /api/campaigns/[id]/pause   - Pause campaign
POST   /api/campaigns/[id]/cancel  - Cancel campaign
POST   /api/campaigns/[id]/preview - Preview merged email
GET    /api/campaigns/[id]/emails  - Get campaign's sent emails
```

#### Request/Response Examples:

**POST /api/campaigns**
```json
{
  "name": "January Newsletter",
  "description": "Monthly product updates",
  "accountId": "uuid",
  "subjectTemplate": "{{first_name}}, check out our January updates",
  "bodyHtmlTemplate": "<p>Hi {{first_name}},</p><p>Here's what's new...</p>",
  "recipients": [
    { "email": "john@example.com", "first_name": "John", "company": "Acme" },
    { "email": "jane@example.com", "first_name": "Jane", "company": "TechCo" }
  ],
  "throttleSeconds": 25,
  "followUp": {
    "enabled": true,
    "condition": "no_reply",
    "delayHours": 48,
    "subject": "Following up - {{first_name}}",
    "bodyHtml": "<p>Hi {{first_name}}, just checking in...</p>"
  },
  "scheduledAt": "2026-01-28T09:00:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "campaign-uuid",
    "status": "draft",
    "totalRecipients": 2,
    "createdAt": "2026-01-27T..."
  }
}
```

#### Implementation Details:

1. **Route: `src/app/api/campaigns/route.ts`**
   - GET: List campaigns with pagination, filter by status
   - POST: Create campaign, validate recipients, extract merge fields

2. **Route: `src/app/api/campaigns/[id]/route.ts`**
   - GET: Return campaign with aggregated stats
   - PATCH: Update only if status is 'draft'
   - DELETE: Only allow for draft/cancelled campaigns

3. **Route: `src/app/api/campaigns/[id]/start/route.ts`**
   - POST: Transition status from draft/scheduled/paused to in_progress
   - Set started_at timestamp
   - Validate user has quota remaining

4. **Route: `src/app/api/campaigns/[id]/pause/route.ts`**
   - POST: Transition status from in_progress to paused
   - Set paused_at timestamp
   - Store current_index for resuming

5. **Route: `src/app/api/campaigns/[id]/cancel/route.ts`**
   - POST: Transition status to cancelled
   - Prevent further sends

6. **Route: `src/app/api/campaigns/[id]/preview/route.ts`**
   - POST: Merge template with sample recipient data
   - Return preview HTML for UI display

7. **Route: `src/app/api/campaigns/[id]/emails/route.ts`**
   - GET: List outbound_emails for this campaign
   - Include open/reply stats per email

---

### 4.2 Campaign Builder UI

**Location:** `src/components/campaigns/CampaignBuilder.tsx`

#### Component Structure:

```
CampaignBuilder/
├── CampaignBuilder.tsx          - Main container (stepper/wizard)
├── CampaignNameStep.tsx         - Name, description, account selection
├── RecipientImportStep.tsx      - CSV import or contact selection
├── TemplateEditorStep.tsx       - Subject/body with merge field helper
├── SettingsStep.tsx             - Throttling, follow-up config
├── ReviewStep.tsx               - Preview and confirmation
└── index.ts                     - Barrel exports
```

#### Features:

**Step 1: Campaign Info**
- Campaign name (required)
- Description (optional)
- Gmail account selector
- Template selector (optional, pre-fill subject/body)

**Step 2: Recipients**
- **CSV Import:**
  - Textarea for paste (or file upload)
  - Parse CSV with header detection
  - Column mapping UI (map CSV columns to merge fields)
  - Preview parsed recipients table
  - Validation (email format, required fields)

- **Contact Selection:**
  - Search contacts from database
  - Filter by tags, recent, VIPs
  - Multi-select checkboxes
  - Auto-fill merge data from contact profile

**Step 3: Email Content**
- Subject line input with merge field buttons
- Rich text body editor (or Textarea for HTML)
- Merge field palette: `{{first_name}}`, `{{last_name}}`, etc.
- Insert merge field at cursor
- Live preview with sample recipient data

**Step 4: Settings**
- Throttle delay (15s, 25s, 45s, 60s)
- Schedule start time (optional)
- Follow-up configuration:
  - Enable/disable
  - Condition selector
  - Delay hours
  - Follow-up subject/body

**Step 5: Review & Launch**
- Campaign summary
- Recipient count
- Email preview (merged with first recipient)
- Estimated send completion time
- "Save as Draft" or "Start Campaign" buttons

#### UI Mockup (ASCII):

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Create Campaign                                                    [X]  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ● Info  ━━━○ Recipients  ━━━○ Content  ━━━○ Settings  ━━━○ Review     │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Campaign Name *                                                 │   │
│  │  ┌─────────────────────────────────────────────────────────┐     │   │
│  │  │ January Newsletter                                      │     │   │
│  │  └─────────────────────────────────────────────────────────┘     │   │
│  │                                                                  │   │
│  │  Description                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────┐     │   │
│  │  │ Monthly product updates for subscribers                 │     │   │
│  │  └─────────────────────────────────────────────────────────┘     │   │
│  │                                                                  │   │
│  │  Send From                                                       │   │
│  │  ┌─────────────────────────────────────────────────┐ [▼]         │   │
│  │  │ john@example.com                                │             │   │
│  │  └─────────────────────────────────────────────────┘             │   │
│  │                                                                  │   │
│  │  Use Template (optional)                                         │   │
│  │  ┌─────────────────────────────────────────────────┐ [▼]         │   │
│  │  │ Select a template...                            │             │   │
│  │  └─────────────────────────────────────────────────┘             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│                                          [Cancel]  [Next →]             │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### 4.3 Campaigns List Page

**Location:** `src/app/(auth)/campaigns/page.tsx`

#### Features:
- Campaign list with status badges
- Progress bars for in_progress campaigns
- Quick actions: Start, Pause, Cancel, Delete
- Filter by status
- Search by name
- Click to view campaign details

#### Campaign Detail Page: `src/app/(auth)/campaigns/[id]/page.tsx`

- Campaign info summary
- Real-time progress (sent/total)
- Email list with individual stats
- Open rate, reply rate metrics
- Pause/Resume/Cancel controls

---

## Phase 5: Templates Page UI

### 5.1 Templates List Page

**Location:** `src/app/(auth)/templates/page.tsx`

#### Features:

- Template cards with preview
- Category filter tabs
- Create new template button
- Edit/duplicate/delete actions
- Usage stats (times used, last used)
- Search by name/content

#### UI Layout:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Email Templates                                      [+ New Template]   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  [All] [Follow-up] [Introduction] [Newsletter] [Custom]                 │
│                                                                         │
│  ┌─────────────────────────┐  ┌─────────────────────────┐              │
│  │ Follow-up Reminder      │  │ Product Update          │              │
│  │ ─────────────────────── │  │ ─────────────────────── │              │
│  │ Hi {{first_name}},      │  │ Exciting news from...   │              │
│  │ Just checking in...     │  │ Here's what's new...    │              │
│  │                         │  │                         │              │
│  │ Used: 12 times          │  │ Used: 5 times           │              │
│  │ Last: 2 days ago        │  │ Last: 1 week ago        │              │
│  │                         │  │                         │              │
│  │ [Edit] [Duplicate] [⋮]  │  │ [Edit] [Duplicate] [⋮]  │              │
│  └─────────────────────────┘  └─────────────────────────┘              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Template Editor Modal

**Location:** `src/components/templates/TemplateEditor.tsx`

#### Features:

- Template name input
- Category selector (dropdown with custom option)
- Subject template with merge field insertion
- Body template (HTML) with merge field palette
- Preview panel with sample data
- Available merge fields reference

#### Merge Field Palette:

```
┌─────────────────────────────────────────┐
│ Insert Merge Field                      │
├─────────────────────────────────────────┤
│ [{{first_name}}] [{{last_name}}]       │
│ [{{email}}] [{{company}}]               │
│ [{{custom_1}}] [{{custom_2}}]           │
└─────────────────────────────────────────┘
```

---

## Phase 6: Reply Detection

### 6.1 Overview

Reply detection connects inbound emails to outbound emails, enabling:
- Accurate "has_reply" tracking for follow-up automation
- Reply rate analytics
- Campaign performance metrics

### 6.2 Implementation Steps

#### Step 1: Enhance Email Parser

**File:** `src/lib/gmail/email-parser.ts`

Add extraction of reply headers:

```typescript
// Add to ParsedEmail interface
interface ParsedEmail {
  // ... existing fields
  inReplyTo: string | null;      // Message-ID this is replying to
  references: string[] | null;   // Thread reference chain
}

// Add to parse() method
const inReplyTo = this.getHeader(headers, 'In-Reply-To');
const referencesHeader = this.getHeader(headers, 'References');
const references = referencesHeader
  ? referencesHeader.split(/\s+/).filter(Boolean)
  : null;
```

#### Step 2: Modify Email Sync

**File:** `src/lib/gmail/gmail-service.ts` (or wherever sync happens)

After parsing an inbound email, check if it's a reply to an outbound email:

```typescript
async function processInboundEmail(parsed: ParsedEmail, userId: string) {
  // Store the email as usual
  await storeEmail(parsed, userId);

  // Check if this is a reply to an outbound email
  if (parsed.inReplyTo) {
    await checkForOutboundReply(parsed.inReplyTo, userId);
  }
}

async function checkForOutboundReply(messageId: string, userId: string) {
  // The inReplyTo header contains the Message-ID of the original email
  // Gmail's message_id format: <CAxxxxxxx@mail.gmail.com>

  const { data: outbound } = await supabase
    .from('outbound_emails')
    .update({
      has_reply: true,
      reply_received_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .eq('gmail_message_id', messageId)
    .select('id')
    .single();

  if (outbound) {
    logger.info('Reply detected for outbound email', {
      outboundId: outbound.id
    });
  }
}
```

#### Step 3: Add Database Index

Add index for faster reply matching:

```sql
CREATE INDEX IF NOT EXISTS idx_outbound_emails_gmail_message_id
ON outbound_emails(user_id, gmail_message_id)
WHERE gmail_message_id IS NOT NULL;
```

#### Step 4: Update Campaign Stats

When a reply is detected for a campaign email, update campaign reply count:

```typescript
async function checkForOutboundReply(messageId: string, userId: string) {
  const { data: outbound } = await supabase
    .from('outbound_emails')
    .update({ has_reply: true, reply_received_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('gmail_message_id', messageId)
    .select('id, campaign_id')
    .single();

  if (outbound?.campaign_id) {
    await supabase.rpc('increment_campaign_reply_count', {
      p_campaign_id: outbound.campaign_id
    });
  }
}
```

#### Step 5: Database Function

```sql
CREATE OR REPLACE FUNCTION increment_campaign_reply_count(p_campaign_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE email_campaigns
  SET reply_count = reply_count + 1,
      updated_at = NOW()
  WHERE id = p_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Phase 7: Analytics Dashboard

### 7.1 Analytics Overview Page

**Location:** `src/app/(auth)/analytics/page.tsx`

#### Key Metrics:

**Overall Stats:**
- Total emails sent (all time, this month, this week)
- Overall open rate (% of sent emails opened)
- Overall reply rate (% of sent emails with replies)
- Active campaigns count

**Charts:**
- Emails sent over time (line chart)
- Open rate trend (line chart)
- Campaign comparison (bar chart)
- Best send times (heatmap)

### 7.2 Campaign Analytics

**Location:** `src/app/(auth)/campaigns/[id]/analytics/page.tsx` (or tab in detail page)

#### Metrics Per Campaign:

- Delivery rate
- Open rate
- Unique opens vs total opens
- Reply rate
- Follow-up effectiveness
- Time to first open distribution
- Device/email client breakdown

#### Visualization Ideas:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Campaign: January Newsletter                                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐│
│  │     150      │  │    68.5%     │  │    23.3%     │  │     8.0%     ││
│  │    SENT      │  │  OPEN RATE   │  │ UNIQUE OPENS │  │ REPLY RATE   ││
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘│
│                                                                         │
│  Opens Over Time                           Device Breakdown             │
│  ┌─────────────────────────────────┐      ┌──────────────────────┐     │
│  │      ╭──╮                       │      │  Desktop  ████████ 62%│     │
│  │     ╱    ╲    ╭─╮               │      │  Mobile   ████░░░░ 31%│     │
│  │    ╱      ╲  ╱   ╲              │      │  Tablet   █░░░░░░░  7%│     │
│  │   ╱        ╲╱     ╲_____        │      └──────────────────────┘     │
│  │  ╱                              │                                    │
│  └─────────────────────────────────┘                                    │
│   Day 1    Day 2    Day 3    Day 4                                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Analytics API Routes

**Location:** `src/app/api/analytics/`

```
GET /api/analytics/overview        - Overall email stats
GET /api/analytics/campaigns       - Campaign comparison data
GET /api/analytics/campaigns/[id]  - Single campaign detailed analytics
GET /api/analytics/trends          - Time-series data for charts
```

### 7.4 Database Queries for Analytics

```sql
-- Overall stats for a user
SELECT
  COUNT(*) FILTER (WHERE status = 'sent') as total_sent,
  COUNT(*) FILTER (WHERE open_count > 0) as total_opened,
  COUNT(*) FILTER (WHERE has_reply = true) as total_replied,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE open_count > 0) /
    NULLIF(COUNT(*) FILTER (WHERE status = 'sent'), 0),
    1
  ) as open_rate,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE has_reply = true) /
    NULLIF(COUNT(*) FILTER (WHERE status = 'sent'), 0),
    1
  ) as reply_rate
FROM outbound_emails
WHERE user_id = $1;

-- Emails sent over time
SELECT
  DATE_TRUNC('day', sent_at) as date,
  COUNT(*) as sent_count,
  COUNT(*) FILTER (WHERE open_count > 0) as opened_count
FROM outbound_emails
WHERE user_id = $1
  AND status = 'sent'
  AND sent_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', sent_at)
ORDER BY date;

-- Device breakdown
SELECT
  device_type,
  COUNT(*) as count
FROM email_open_events eo
JOIN outbound_emails e ON eo.outbound_email_id = e.id
WHERE e.user_id = $1
GROUP BY device_type;
```

---

## Implementation Order

### Recommended Sequence:

1. **Phase 4.1: Campaign API Routes** (2-3 days)
   - Foundation for UI
   - Can test with Postman/curl

2. **Phase 6: Reply Detection** (1 day)
   - Small, focused change
   - Enables better analytics

3. **Phase 4.2-4.3: Campaign Builder UI** (3-4 days)
   - Builds on API routes
   - Complex UI with stepper

4. **Phase 5: Templates Page UI** (2 days)
   - Simpler than campaigns
   - API already exists

5. **Phase 7: Analytics Dashboard** (2-3 days)
   - Requires data from campaigns
   - Good to do last

---

## Technical Considerations

### State Management

For the Campaign Builder wizard:
- Use React state for form data
- Consider using a reducer for complex state transitions
- Alternatively, use a form library like react-hook-form

### CSV Parsing

For recipient import:
- Use `papaparse` library for robust CSV parsing
- Handle different delimiters (comma, tab, semicolon)
- Detect headers automatically
- Validate email format

```typescript
import Papa from 'papaparse';

function parseCSV(csvText: string): ParsedRecipients {
  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase(),
  });

  return {
    data: result.data,
    errors: result.errors,
    fields: result.meta.fields,
  };
}
```

### Real-time Progress

For campaign progress:
- Poll campaign status every 5-10 seconds
- Or use Supabase Realtime subscriptions
- Show progress bar: sent_count / total_recipients

### Error Handling

- Show toast notifications for API errors
- Prevent double-submission
- Confirm before cancelling campaigns
- Handle quota exhaustion gracefully

---

## Files to Create

### API Routes:
- [ ] `src/app/api/campaigns/route.ts`
- [ ] `src/app/api/campaigns/[id]/route.ts`
- [ ] `src/app/api/campaigns/[id]/start/route.ts`
- [ ] `src/app/api/campaigns/[id]/pause/route.ts`
- [ ] `src/app/api/campaigns/[id]/cancel/route.ts`
- [ ] `src/app/api/campaigns/[id]/preview/route.ts`
- [ ] `src/app/api/campaigns/[id]/emails/route.ts`
- [ ] `src/app/api/analytics/overview/route.ts`
- [ ] `src/app/api/analytics/campaigns/route.ts`
- [ ] `src/app/api/analytics/campaigns/[id]/route.ts`

### UI Components:
- [ ] `src/components/campaigns/CampaignBuilder.tsx`
- [ ] `src/components/campaigns/RecipientImport.tsx`
- [ ] `src/components/campaigns/MergeFieldPalette.tsx`
- [ ] `src/components/campaigns/CampaignProgress.tsx`
- [ ] `src/components/campaigns/CampaignCard.tsx`
- [ ] `src/components/templates/TemplateEditor.tsx`
- [ ] `src/components/templates/TemplateCard.tsx`
- [ ] `src/components/analytics/StatsCard.tsx`
- [ ] `src/components/analytics/EmailChart.tsx`

### Pages:
- [ ] `src/app/(auth)/campaigns/page.tsx`
- [ ] `src/app/(auth)/campaigns/new/page.tsx`
- [ ] `src/app/(auth)/campaigns/[id]/page.tsx`
- [ ] `src/app/(auth)/templates/page.tsx`
- [ ] `src/app/(auth)/analytics/page.tsx`

### Modifications:
- [ ] `src/lib/gmail/email-parser.ts` - Add In-Reply-To extraction
- [ ] `src/components/layout/Sidebar.tsx` - Add Campaigns & Analytics links

### Database:
- [ ] Migration for reply detection index
- [ ] Database functions for analytics queries

---

## Dependencies to Add

```bash
npm install papaparse @types/papaparse
npm install recharts  # For analytics charts (if not already installed)
```

---

## Testing Checklist

### Campaign API:
- [ ] Create campaign with valid data
- [ ] Create campaign with invalid email formats
- [ ] Start campaign, verify status change
- [ ] Pause campaign mid-progress
- [ ] Resume paused campaign
- [ ] Cancel running campaign
- [ ] Preview merged template

### Reply Detection:
- [ ] Send test email, reply from external client
- [ ] Verify has_reply flag updates
- [ ] Verify campaign reply_count increments
- [ ] Test with threaded replies

### Templates:
- [ ] Create template with merge fields
- [ ] Edit existing template
- [ ] Use template in campaign
- [ ] Delete template (check for FK constraints)

### Analytics:
- [ ] Verify open rate calculations
- [ ] Verify reply rate calculations
- [ ] Test date range filters
- [ ] Test campaign comparison

---

## Notes

1. **Performance:** For large recipient lists (1000+), consider pagination in the UI and batch processing in the API.

2. **Rate Limits:** Gmail has a 2000 emails/day limit for regular accounts. The 400/day limit in our system provides safety margin.

3. **Compliance:** Consider adding unsubscribe links for campaign emails (CAN-SPAM compliance).

4. **Future Enhancements:**
   - Click tracking (wrap links)
   - A/B testing
   - Attachment support
   - Bounce detection
   - Email scheduling optimization

---

## References

- [Gmail API Documentation](https://developers.google.com/gmail/api)
- [Existing Implementation](./GMAIL_SENDING_IMPLEMENTATION.md)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
