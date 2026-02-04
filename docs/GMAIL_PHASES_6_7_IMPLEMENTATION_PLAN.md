# Gmail Implementation Plan - Phases 6-7

> **Status:** Planning Document
> **Created:** 2026-01-27
> **Target:** Reply Detection (Phase 6) and Analytics Dashboard (Phase 7)
> **Dependencies:** Phases 1-5 Complete

---

## Executive Summary

This document provides a detailed implementation plan for the remaining Gmail email sending features:

| Phase | Feature | Effort | Priority |
|-------|---------|--------|----------|
| 6 | Reply Detection | Medium | High |
| 7 | Analytics Dashboard | Medium-Large | High |

**Estimated Files to Create/Modify:**
- Phase 6: ~6 files
- Phase 7: ~10 files

---

## Phase 6: Reply Detection

### Overview

Reply detection connects inbound emails to outbound emails, allowing users to:
- See which sent emails received replies
- Track reply rates per campaign
- Trigger follow-ups based on reply status

### Technical Approach

When an email is received, Gmail includes headers that indicate if it's a reply:
- `In-Reply-To`: Contains the Message-ID of the email being replied to
- `References`: Contains a chain of Message-IDs in the thread

We already store `gmail_message_id` on outbound emails after sending. We need to:
1. Extract reply headers during inbound email sync
2. Match `In-Reply-To` against our `outbound_emails.gmail_message_id`
3. Update tracking flags when a match is found

---

### Phase 6.1: Email Parser Enhancement

**File:** `src/lib/gmail/email-parser.ts`

**Current State:** Parser extracts basic email fields (from, to, subject, body, date)

**Changes Required:**

```typescript
// Add to EmailMetadata interface
interface EmailMetadata {
  // ... existing fields
  inReplyTo?: string;      // NEW: Message-ID this is replying to
  references?: string[];   // NEW: Thread message ID chain
}

// Add extraction in parseEmailHeaders or equivalent function
function extractReplyHeaders(headers: gmail_v1.Schema$MessagePartHeader[]): {
  inReplyTo?: string;
  references?: string[];
} {
  const inReplyTo = headers.find(h => h.name?.toLowerCase() === 'in-reply-to')?.value;
  const referencesRaw = headers.find(h => h.name?.toLowerCase() === 'references')?.value;

  // References header contains space-separated Message-IDs
  const references = referencesRaw
    ? referencesRaw.split(/\s+/).filter(Boolean)
    : undefined;

  return { inReplyTo, references };
}
```

**Testing:**
- Send an email from IdeaBox
- Reply to it from Gmail directly
- Sync the reply and verify headers are extracted

---

### Phase 6.2: Database Migration

**File:** `supabase/migrations/027_reply_detection.sql`

```sql
-- =========================================
-- Reply Detection Enhancement Migration
-- =========================================

-- Add index for efficient reply matching
-- This allows quick lookup when an inbound email arrives
CREATE INDEX IF NOT EXISTS idx_outbound_emails_gmail_message_id
ON outbound_emails(user_id, gmail_message_id)
WHERE gmail_message_id IS NOT NULL;

-- Add index for finding emails awaiting reply tracking
CREATE INDEX IF NOT EXISTS idx_outbound_emails_awaiting_reply
ON outbound_emails(user_id, status, has_reply)
WHERE status = 'sent' AND has_reply = FALSE;

-- Function to mark outbound email as replied
-- Called during email sync when a reply is detected
CREATE OR REPLACE FUNCTION mark_email_replied(
  p_user_id UUID,
  p_gmail_message_id TEXT,
  p_reply_received_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE(
  email_id UUID,
  campaign_id UUID
) AS $$
DECLARE
  v_email_id UUID;
  v_campaign_id UUID;
BEGIN
  -- Find and update the outbound email
  UPDATE outbound_emails
  SET
    has_reply = TRUE,
    reply_received_at = p_reply_received_at,
    updated_at = NOW()
  WHERE user_id = p_user_id
    AND gmail_message_id = p_gmail_message_id
    AND has_reply = FALSE
  RETURNING id, campaign_id INTO v_email_id, v_campaign_id;

  -- If this email belongs to a campaign, increment reply count
  IF v_campaign_id IS NOT NULL THEN
    UPDATE email_campaigns
    SET
      reply_count = reply_count + 1,
      updated_at = NOW()
    WHERE id = v_campaign_id;
  END IF;

  RETURN QUERY SELECT v_email_id, v_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if an inbound email is a reply to one of our outbound emails
CREATE OR REPLACE FUNCTION check_and_mark_reply(
  p_user_id UUID,
  p_in_reply_to TEXT,
  p_references TEXT[],
  p_received_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS BOOLEAN AS $$
DECLARE
  v_message_id TEXT;
  v_result RECORD;
BEGIN
  -- First check In-Reply-To header (most direct)
  IF p_in_reply_to IS NOT NULL THEN
    SELECT * INTO v_result
    FROM mark_email_replied(p_user_id, p_in_reply_to, p_received_at);

    IF v_result.email_id IS NOT NULL THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- If no match, check References chain
  IF p_references IS NOT NULL THEN
    FOREACH v_message_id IN ARRAY p_references LOOP
      SELECT * INTO v_result
      FROM mark_email_replied(p_user_id, v_message_id, p_received_at);

      IF v_result.email_id IS NOT NULL THEN
        RETURN TRUE;
      END IF;
    END LOOP;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION mark_email_replied TO authenticated;
GRANT EXECUTE ON FUNCTION check_and_mark_reply TO authenticated;
```

---

### Phase 6.3: Email Sync Integration

**Location:** Find the email sync handler (likely in `src/lib/gmail/gmail-service.ts` or a sync-related file)

**Changes Required:**

After parsing an inbound email, add reply detection:

```typescript
// In the email sync handler, after parsing the email
async function processInboundEmail(email: ParsedEmail, userId: string) {
  // ... existing processing

  // NEW: Check if this is a reply to one of our outbound emails
  if (email.inReplyTo || email.references?.length) {
    const { data: replyResult } = await supabase.rpc('check_and_mark_reply', {
      p_user_id: userId,
      p_in_reply_to: email.inReplyTo || null,
      p_references: email.references || null,
      p_received_at: email.receivedAt || new Date().toISOString(),
    });

    if (replyResult) {
      logger.info('Detected reply to outbound email', {
        inReplyTo: email.inReplyTo,
        userId,
      });
    }
  }

  // ... continue with existing processing
}
```

---

### Phase 6.4: UI Updates for Reply Tracking

**Files to Update:**

1. **Campaign Detail Page** (`src/app/(auth)/campaigns/[id]/page.tsx`)
   - Already shows `reply_count` - verify it displays correctly

2. **Sent/Outbox Page** (`src/app/(auth)/sent/page.tsx`)
   - Add "Replied" badge to emails that have received replies
   - Show reply timestamp on hover

```typescript
// In the email list item component
{email.has_reply && (
  <Badge variant="success" className="ml-2">
    <Reply className="h-3 w-3 mr-1" />
    Replied
  </Badge>
)}
```

3. **Email Detail View** (if exists)
   - Show "View Reply" link that navigates to the reply in inbox

---

### Phase 6 Testing Checklist

- [ ] Send email from IdeaBox to yourself
- [ ] Reply to that email from Gmail web
- [ ] Trigger email sync
- [ ] Verify `has_reply` is set to TRUE
- [ ] Verify `reply_received_at` timestamp is recorded
- [ ] If part of campaign, verify `reply_count` incremented
- [ ] Verify UI shows "Replied" badge

---

## Phase 7: Analytics Dashboard

### Overview

The Analytics Dashboard provides visual insights into email performance:
- Overall sending statistics
- Campaign comparison charts
- Open and reply rate trends
- Device and email client breakdown

### Design Principles

1. **Performance:** Use database aggregations, not client-side calculations
2. **Real-time:** Data should reflect current state (not cached)
3. **Responsive:** Charts should work on mobile and desktop
4. **Actionable:** Surface insights that help users improve

---

### Phase 7.1: Analytics API Routes

**Directory:** `src/app/api/analytics/`

#### 7.1.1: Overview Stats

**File:** `src/app/api/analytics/overview/route.ts`

```typescript
// GET /api/analytics/overview
// Returns: Overall email statistics for the current user

interface OverviewStats {
  // All-time stats
  totalSent: number;
  totalOpened: number;
  totalReplied: number;
  overallOpenRate: number;  // percentage
  overallReplyRate: number; // percentage

  // This month
  thisMonthSent: number;
  thisMonthOpened: number;
  thisMonthReplied: number;

  // This week
  thisWeekSent: number;
  thisWeekOpened: number;
  thisWeekReplied: number;

  // Trends (vs previous period)
  monthOverMonthChange: number;  // percentage change
  weekOverWeekChange: number;    // percentage change

  // Quota
  todayQuotaUsed: number;
  todayQuotaRemaining: number;
}
```

**SQL Query:**

```sql
WITH stats AS (
  SELECT
    -- All time
    COUNT(*) FILTER (WHERE status = 'sent') as total_sent,
    COUNT(*) FILTER (WHERE open_count > 0) as total_opened,
    COUNT(*) FILTER (WHERE has_reply = true) as total_replied,

    -- This month
    COUNT(*) FILTER (
      WHERE status = 'sent'
      AND sent_at >= date_trunc('month', CURRENT_DATE)
    ) as this_month_sent,
    COUNT(*) FILTER (
      WHERE open_count > 0
      AND sent_at >= date_trunc('month', CURRENT_DATE)
    ) as this_month_opened,
    COUNT(*) FILTER (
      WHERE has_reply = true
      AND sent_at >= date_trunc('month', CURRENT_DATE)
    ) as this_month_replied,

    -- Last month (for comparison)
    COUNT(*) FILTER (
      WHERE status = 'sent'
      AND sent_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
      AND sent_at < date_trunc('month', CURRENT_DATE)
    ) as last_month_sent,

    -- This week
    COUNT(*) FILTER (
      WHERE status = 'sent'
      AND sent_at >= date_trunc('week', CURRENT_DATE)
    ) as this_week_sent,
    COUNT(*) FILTER (
      WHERE open_count > 0
      AND sent_at >= date_trunc('week', CURRENT_DATE)
    ) as this_week_opened,

    -- Last week (for comparison)
    COUNT(*) FILTER (
      WHERE status = 'sent'
      AND sent_at >= date_trunc('week', CURRENT_DATE - INTERVAL '1 week')
      AND sent_at < date_trunc('week', CURRENT_DATE)
    ) as last_week_sent

  FROM outbound_emails
  WHERE user_id = $1
)
SELECT
  *,
  ROUND(100.0 * total_opened / NULLIF(total_sent, 0), 1) as open_rate,
  ROUND(100.0 * total_replied / NULLIF(total_sent, 0), 1) as reply_rate,
  ROUND(100.0 * (this_month_sent - last_month_sent) / NULLIF(last_month_sent, 0), 1) as mom_change,
  ROUND(100.0 * (this_week_sent - last_week_sent) / NULLIF(last_week_sent, 0), 1) as wow_change
FROM stats;
```

#### 7.1.2: Campaign Analytics

**File:** `src/app/api/analytics/campaigns/route.ts`

```typescript
// GET /api/analytics/campaigns
// Returns: Campaign performance comparison data

interface CampaignAnalytics {
  campaigns: Array<{
    id: string;
    name: string;
    status: string;
    totalRecipients: number;
    sentCount: number;
    openCount: number;
    replyCount: number;
    openRate: number;
    replyRate: number;
    startedAt: string | null;
    completedAt: string | null;
  }>;

  // Aggregates
  averageOpenRate: number;
  averageReplyRate: number;
  bestPerforming: string | null;  // campaign name
}
```

#### 7.1.3: Single Campaign Analytics

**File:** `src/app/api/analytics/campaigns/[id]/route.ts`

```typescript
// GET /api/analytics/campaigns/[id]
// Returns: Detailed analytics for a single campaign

interface CampaignDetailedAnalytics {
  campaign: {
    id: string;
    name: string;
    status: string;
    // ... basic info
  };

  // Time series data for charts
  sentOverTime: Array<{ date: string; count: number }>;
  opensOverTime: Array<{ date: string; count: number }>;

  // Email client breakdown
  emailClients: Array<{ client: string; count: number }>;

  // Device breakdown
  devices: Array<{ type: string; count: number }>;

  // Individual email performance
  topPerformers: Array<{
    recipientEmail: string;
    openCount: number;
    hasReplied: boolean;
  }>;

  // No engagement list
  noEngagement: Array<{
    recipientEmail: string;
    sentAt: string;
  }>;
}
```

#### 7.1.4: Sends Over Time

**File:** `src/app/api/analytics/timeline/route.ts`

```typescript
// GET /api/analytics/timeline?period=30d
// Returns: Email sends grouped by day/week

interface TimelineData {
  period: '7d' | '30d' | '90d' | '1y';
  data: Array<{
    date: string;
    sent: number;
    opened: number;
    replied: number;
  }>;
}
```

**SQL Query:**

```sql
SELECT
  DATE(sent_at) as date,
  COUNT(*) as sent,
  COUNT(*) FILTER (WHERE open_count > 0) as opened,
  COUNT(*) FILTER (WHERE has_reply = true) as replied
FROM outbound_emails
WHERE user_id = $1
  AND status = 'sent'
  AND sent_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(sent_at)
ORDER BY date ASC;
```

---

### Phase 7.2: Analytics UI Components

**Directory:** `src/components/analytics/`

#### 7.2.1: Stats Card Component

**File:** `src/components/analytics/StatsCard.tsx`

```typescript
interface StatsCardProps {
  title: string;
  value: number | string;
  change?: number;        // percentage change
  changeLabel?: string;   // e.g., "vs last month"
  icon?: LucideIcon;
  loading?: boolean;
}

// Example usage:
<StatsCard
  title="Emails Sent"
  value={1234}
  change={12.5}
  changeLabel="vs last month"
  icon={Send}
/>
```

**Design:**
- Card with subtle shadow
- Large bold number
- Change indicator (green up arrow or red down arrow)
- Icon on the right side

#### 7.2.2: Email Performance Chart

**File:** `src/components/analytics/EmailChart.tsx`

```typescript
interface EmailChartProps {
  data: Array<{
    date: string;
    sent: number;
    opened: number;
    replied: number;
  }>;
  period: '7d' | '30d' | '90d';
}

// Uses recharts LineChart or AreaChart
```

#### 7.2.3: Campaign Comparison Chart

**File:** `src/components/analytics/CampaignComparisonChart.tsx`

```typescript
interface CampaignComparisonChartProps {
  campaigns: Array<{
    name: string;
    openRate: number;
    replyRate: number;
  }>;
}

// Uses recharts BarChart - grouped bars for open/reply rates
```

#### 7.2.4: Device/Client Breakdown

**File:** `src/components/analytics/BreakdownChart.tsx`

```typescript
interface BreakdownChartProps {
  title: string;
  data: Array<{ name: string; value: number }>;
  type: 'pie' | 'donut' | 'bar';
}

// Uses recharts PieChart or horizontal BarChart
```

---

### Phase 7.3: Analytics Dashboard Page

**File:** `src/app/(auth)/analytics/page.tsx`

**Layout:**

```
┌─────────────────────────────────────────────────────────────────────┐
│  Analytics                                              [Period: ▼] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐               │
│  │ Sent    │  │ Opened  │  │ Replied │  │ Quota   │               │
│  │  1,234  │  │   890   │  │   234   │  │ 380/400 │               │
│  │ +12% ▲  │  │ 72.1%   │  │ 19.0%   │  │         │               │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘               │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Emails Over Time                          │   │
│  │  [Line chart showing sent/opened/replied over 30 days]       │   │
│  │                                                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────┐  ┌──────────────────────────────┐   │
│  │  Campaign Performance    │  │  Email Client Breakdown      │   │
│  │  [Bar chart]             │  │  [Pie chart]                 │   │
│  │                          │  │                              │   │
│  └──────────────────────────┘  └──────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Recent Campaigns                                            │   │
│  │  ┌──────────────────────────────────────────────────────┐   │   │
│  │  │ Newsletter Q1  │ 500 sent │ 72% open │ 15% reply │ ▶ │   │   │
│  │  │ Cold Outreach  │ 200 sent │ 45% open │ 8% reply  │ ▶ │   │   │
│  │  │ Follow-ups     │ 150 sent │ 68% open │ 22% reply │ ▶ │   │   │
│  │  └──────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Features:**
- Period selector (7d, 30d, 90d, 1y)
- Stats cards row with key metrics
- Email timeline chart
- Campaign comparison chart
- Email client/device breakdown
- Recent campaigns table with quick stats

---

### Phase 7.4: Analytics Hook

**File:** `src/hooks/useAnalytics.ts`

```typescript
interface UseAnalyticsOptions {
  period?: '7d' | '30d' | '90d' | '1y';
  campaignId?: string;
}

interface UseAnalyticsReturn {
  overview: OverviewStats | null;
  timeline: TimelineData | null;
  campaigns: CampaignAnalytics | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useAnalytics(options: UseAnalyticsOptions = {}): UseAnalyticsReturn {
  // Fetch overview, timeline, and campaigns data
  // Handle loading and error states
  // Memoize results
}
```

---

### Phase 7.5: Navigation Update

**File:** `src/components/layout/Sidebar.tsx`

Add Analytics link to sidebar navigation:

```typescript
{
  name: 'Analytics',
  href: '/analytics',
  icon: BarChart3,
}
```

Place after "Campaigns" and before "Templates" in the menu order.

---

### Phase 7 Testing Checklist

- [ ] Overview API returns correct aggregate stats
- [ ] Timeline API returns correct daily breakdown
- [ ] Campaign comparison API returns all campaigns with stats
- [ ] Stats cards display correctly with loading states
- [ ] Timeline chart renders with real data
- [ ] Campaign comparison chart renders with multiple campaigns
- [ ] Device/client breakdown shows data from email_open_events
- [ ] Period selector updates all charts
- [ ] Empty states display appropriately for new users
- [ ] Mobile responsive layout works

---

## Implementation Order

### Recommended Sequence

```
Phase 6.1 → Phase 6.2 → Phase 6.3 → Phase 6.4 (Reply Detection Complete)
    ↓
Phase 7.1 → Phase 7.2 → Phase 7.3 → Phase 7.4 → Phase 7.5 (Analytics Complete)
```

### Detailed Task Breakdown

#### Phase 6 Tasks

1. **6.1: Email Parser Enhancement** (~1-2 hours)
   - [ ] Read current `src/lib/gmail/email-parser.ts`
   - [ ] Add `inReplyTo` and `references` to interface
   - [ ] Implement header extraction
   - [ ] Add unit tests

2. **6.2: Database Migration** (~30 min)
   - [ ] Create `supabase/migrations/027_reply_detection.sql`
   - [ ] Add indexes
   - [ ] Add `mark_email_replied` function
   - [ ] Add `check_and_mark_reply` function
   - [ ] Test migration locally

3. **6.3: Email Sync Integration** (~1-2 hours)
   - [ ] Find email sync handler
   - [ ] Add reply detection call
   - [ ] Add logging
   - [ ] Test with real emails

4. **6.4: UI Updates** (~1 hour)
   - [ ] Add "Replied" badge to sent page
   - [ ] Verify campaign detail shows reply count
   - [ ] Add tooltip with reply timestamp

#### Phase 7 Tasks

1. **7.1: Analytics API Routes** (~3-4 hours)
   - [ ] Create `/api/analytics/overview/route.ts`
   - [ ] Create `/api/analytics/campaigns/route.ts`
   - [ ] Create `/api/analytics/campaigns/[id]/route.ts`
   - [ ] Create `/api/analytics/timeline/route.ts`
   - [ ] Test all endpoints

2. **7.2: Analytics Components** (~3-4 hours)
   - [ ] Install recharts: `npm install recharts`
   - [ ] Create `StatsCard.tsx`
   - [ ] Create `EmailChart.tsx`
   - [ ] Create `CampaignComparisonChart.tsx`
   - [ ] Create `BreakdownChart.tsx`
   - [ ] Add loading skeletons

3. **7.3: Analytics Dashboard Page** (~2-3 hours)
   - [ ] Create `/app/(auth)/analytics/page.tsx`
   - [ ] Implement layout with components
   - [ ] Add period selector
   - [ ] Add empty states
   - [ ] Make responsive

4. **7.4: Analytics Hook** (~1 hour)
   - [ ] Create `useAnalytics.ts`
   - [ ] Implement data fetching
   - [ ] Add to hooks index

5. **7.5: Navigation Update** (~15 min)
   - [ ] Add Analytics to Sidebar
   - [ ] Test navigation

---

## Dependencies

### Existing (No Installation Needed)

- `@supabase/supabase-js` - Database client
- `lucide-react` - Icons (BarChart3, TrendingUp, TrendingDown, etc.)
- Radix UI components - UI primitives

### New Dependencies Required

```bash
npm install recharts
```

Recharts is the recommended charting library for React:
- Works well with Next.js
- Good TypeScript support
- Responsive by default
- Lightweight

---

## Code Patterns Reference

### API Route Pattern

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { createApiSuccess, createApiError } from '@/lib/api/utils';
import { createLogger } from '@/lib/logger';

const logger = createLogger('AnalyticsAPI');

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth();
    const supabase = createServerSupabaseClient();

    // Your query here
    const { data, error } = await supabase
      .from('table')
      .select('*')
      .eq('user_id', user.id);

    if (error) throw error;

    return createApiSuccess(data);
  } catch (error) {
    logger.error('Failed to fetch analytics', { error });
    return createApiError(error);
  }
}
```

### Hook Pattern

```typescript
import { useState, useEffect, useCallback } from 'react';
import { createLogger } from '@/lib/logger';

const logger = createLogger('useAnalytics');

export function useAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/analytics/overview');
      if (!response.ok) throw new Error('Failed to fetch');
      const result = await response.json();
      setData(result.data);
    } catch (err) {
      logger.error('Failed to fetch analytics', { error: err });
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh: fetchData };
}
```

---

## Files Summary

### Phase 6 Files

| File | Action | Description |
|------|--------|-------------|
| `src/lib/gmail/email-parser.ts` | Modify | Add reply header extraction |
| `supabase/migrations/027_reply_detection.sql` | Create | Database migration |
| Email sync handler (location TBD) | Modify | Add reply detection call |
| `src/app/(auth)/sent/page.tsx` | Modify | Add replied badge |
| `src/app/(auth)/campaigns/[id]/page.tsx` | Verify | Reply count display |

### Phase 7 Files

| File | Action | Description |
|------|--------|-------------|
| `src/app/api/analytics/overview/route.ts` | Create | Overview stats endpoint |
| `src/app/api/analytics/campaigns/route.ts` | Create | Campaign comparison endpoint |
| `src/app/api/analytics/campaigns/[id]/route.ts` | Create | Single campaign analytics |
| `src/app/api/analytics/timeline/route.ts` | Create | Time series endpoint |
| `src/components/analytics/StatsCard.tsx` | Create | Stats card component |
| `src/components/analytics/EmailChart.tsx` | Create | Timeline chart |
| `src/components/analytics/CampaignComparisonChart.tsx` | Create | Campaign comparison chart |
| `src/components/analytics/BreakdownChart.tsx` | Create | Pie/bar breakdown chart |
| `src/app/(auth)/analytics/page.tsx` | Create | Analytics dashboard page |
| `src/hooks/useAnalytics.ts` | Create | Analytics data hook |
| `src/hooks/index.ts` | Modify | Export new hook |
| `src/components/layout/Sidebar.tsx` | Modify | Add Analytics nav link |

---

## Next Steps for Developer

1. Start with **Phase 6.1** - Read and understand `src/lib/gmail/email-parser.ts`
2. Find where email sync happens to plan Phase 6.3 integration
3. Create the database migration (Phase 6.2)
4. Implement reply detection in sync (Phase 6.3)
5. Update UI (Phase 6.4)
6. Test Phase 6 thoroughly before moving to Phase 7
7. Install recharts and begin Phase 7.1 API routes
8. Build out UI components and dashboard

---

## Questions to Resolve

1. **Email Sync Location:** Need to identify exactly where inbound emails are processed
2. **Recharts Version:** Confirm latest stable version to install
3. **Chart Color Scheme:** Align with existing design system colors
4. **Mobile Charts:** Determine which charts to hide/simplify on mobile

---

*Document created: 2026-01-27*
*For questions, refer to GMAIL_SENDING_IMPLEMENTATION.md and GMAIL_CAMPAIGNS_PHASE_4_PLAN.md*
