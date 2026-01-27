# Gmail Campaigns - Phase 4+ Implementation Plan

> **Status:** Phase 4-5 Complete, Phase 6-7 Pending
> **Created:** 2026-01-27
> **Last Updated:** 2026-01-27
> **Target:** Complete Campaign Builder, Templates UI, Reply Detection, Analytics

## Overview

This document outlines the implementation plan for the remaining Gmail email sending features. Phases 1-3 have established the core infrastructure (database schema, Gmail send service, background jobs). This plan covers Phase 4+ features.

---

## Implementation Status Summary

| Phase | Component | Status |
|-------|-----------|--------|
| 1-3 | Core Infrastructure | ✅ Complete |
| 4.1 | Campaign API Routes | ✅ Complete |
| 4.2 | Campaign Builder UI | ✅ Complete |
| 4.3 | Campaigns List Page | ✅ Complete |
| 4.4 | Campaign Detail Page | ✅ Complete |
| 5.1 | Templates List Page | ✅ Complete |
| 5.2 | Template Editor Modal | ✅ Complete |
| 6 | Reply Detection | ⏳ Pending |
| 7 | Analytics Dashboard | ⏳ Pending |

---

## What's Been Built (Phases 1-5)

### Core Infrastructure (Phases 1-3) - Previously Complete

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

### Campaign Management (Phase 4-5) - Just Completed

| Component | Location | Status |
|-----------|----------|--------|
| Campaign API Routes | `src/app/api/campaigns/` | ✅ Complete |
| useCampaigns hook | `src/hooks/useCampaigns.ts` | ✅ Complete |
| useTemplates hook | `src/hooks/useTemplates.ts` | ✅ Complete |
| Campaigns list page | `src/app/(auth)/campaigns/page.tsx` | ✅ Complete |
| Campaign builder wizard | `src/app/(auth)/campaigns/new/page.tsx` | ✅ Complete |
| Campaign detail page | `src/app/(auth)/campaigns/[id]/page.tsx` | ✅ Complete |
| Templates list page | `src/app/(auth)/templates/page.tsx` | ✅ Complete |
| Sidebar navigation | `src/components/layout/Sidebar.tsx` | ✅ Updated |
| API utilities | `src/lib/api/utils.ts` | ✅ Updated |

---

## Files Created/Modified in Phase 4-5

### API Routes Created

```
src/app/api/campaigns/
├── route.ts                    # GET list, POST create
└── [id]/
    ├── route.ts                # GET single, PATCH update, DELETE
    ├── start/route.ts          # POST start campaign
    ├── pause/route.ts          # POST pause campaign
    ├── cancel/route.ts         # POST cancel campaign
    ├── preview/route.ts        # POST preview merged email
    └── emails/route.ts         # GET list campaign emails
```

### UI Pages Created

```
src/app/(auth)/
├── campaigns/
│   ├── page.tsx               # Campaigns list with stats cards
│   ├── new/page.tsx           # 5-step campaign builder wizard
│   └── [id]/page.tsx          # Campaign detail with progress
└── templates/
    └── page.tsx               # Templates list with editor modal
```

### Hooks Created

```
src/hooks/
├── useCampaigns.ts            # Campaign CRUD + lifecycle actions
├── useTemplates.ts            # Template CRUD + categories
└── index.ts                   # Updated with new exports
```

### Files Modified

```
src/components/layout/Sidebar.tsx    # Added Campaigns & Templates nav links
src/lib/api/utils.ts                 # Added createApiSuccess, createApiError
```

---

## Key Implementation Details

### Campaign Builder Wizard (5 Steps)

1. **Info Step** - Name, description, Gmail account selection, optional template
2. **Recipients Step** - CSV paste/import with header detection and merge field mapping
3. **Content Step** - Subject/body editors with merge field palette and live preview
4. **Settings Step** - Throttle delay, scheduling, follow-up configuration
5. **Review Step** - Summary and email preview before launch

### Merge Fields

- Format: `{{field_name}}`
- Auto-detected from subject and body templates
- Common fields: `first_name`, `last_name`, `email`, `company`
- CSV header normalization (e.g., "First Name" → "first_name")

### Campaign Status Flow

```
draft → scheduled → in_progress → completed
                 ↓         ↓
              paused → in_progress
                 ↓
            cancelled
```

### Throttling Options

- 15 seconds (~240 emails/hour)
- 25 seconds (~144 emails/hour) - default
- 45 seconds (~80 emails/hour)
- 60 seconds (~60 emails/hour)

---

## IMPORTANT: Gotchas & Known Issues

### 1. API Utilities

The `createApiError` and `createApiSuccess` functions were missing from `src/lib/api/utils.ts`. They have been added but ensure they match your existing error handling patterns.

### 2. Smart Quotes in JSX

Avoid using smart quotes (', ") in JSX strings - they cause TypeScript parsing errors. Use regular quotes or escape properly.

### 3. Campaign Start Validation

When starting a campaign, the API validates:
- Minimum quota of 5 emails remaining
- All merge fields have corresponding recipient data
- Gmail account is connected

### 4. CSV Parsing

The CSV parser handles common header variations:
- `first_name`, `firstname`, `first` → `first_name`
- `last_name`, `lastname`, `last` → `last_name`
- `email`, `email_address`, `e-mail` → `email`

### 5. Campaign Edit Restrictions

- Only `draft` and `scheduled` campaigns can be edited
- Only `draft` and `cancelled` campaigns can be deleted
- Running campaigns must be paused or cancelled first

### 6. Auto-Refresh

The campaign detail page auto-refreshes every 5 seconds when status is `in_progress`. This is cleared on unmount.

---

## Remaining Work (Phase 6-7)

### Phase 6: Reply Detection

**Status:** Not Started

**Goal:** Connect inbound emails to outbound emails to track replies.

#### Implementation Steps:

1. **Enhance Email Parser** (`src/lib/gmail/email-parser.ts`)
   - Extract `In-Reply-To` header
   - Extract `References` header chain

2. **Modify Email Sync** (wherever sync happens)
   - After parsing inbound email, check if it's a reply
   - Update `outbound_emails.has_reply` flag
   - Update `outbound_emails.reply_received_at` timestamp
   - Increment `email_campaigns.reply_count`

3. **Add Database Index**
   ```sql
   CREATE INDEX IF NOT EXISTS idx_outbound_emails_gmail_message_id
   ON outbound_emails(user_id, gmail_message_id)
   WHERE gmail_message_id IS NOT NULL;
   ```

4. **Create Database Function**
   ```sql
   CREATE OR REPLACE FUNCTION increment_campaign_reply_count(p_campaign_id UUID)
   RETURNS VOID AS $$
   BEGIN
     UPDATE email_campaigns
     SET reply_count = reply_count + 1, updated_at = NOW()
     WHERE id = p_campaign_id;
   END;
   $$ LANGUAGE plpgsql SECURITY DEFINER;
   ```

### Phase 7: Analytics Dashboard

**Status:** Not Started

**Goal:** Visualize email performance metrics.

#### Files to Create:

```
src/app/api/analytics/
├── overview/route.ts          # Overall email stats
├── campaigns/route.ts         # Campaign comparison data
└── campaigns/[id]/route.ts    # Single campaign detailed analytics

src/app/(auth)/analytics/
└── page.tsx                   # Analytics dashboard

src/components/analytics/
├── StatsCard.tsx              # Metric display card
└── EmailChart.tsx             # Chart component (use recharts)
```

#### Key Metrics to Display:

- Total emails sent (all time, this month, this week)
- Overall open rate and reply rate
- Campaign comparison charts
- Emails sent over time (line chart)
- Device/email client breakdown

#### Database Queries:

```sql
-- Overall stats for a user
SELECT
  COUNT(*) FILTER (WHERE status = 'sent') as total_sent,
  COUNT(*) FILTER (WHERE open_count > 0) as total_opened,
  COUNT(*) FILTER (WHERE has_reply = true) as total_replied,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE open_count > 0) /
    NULLIF(COUNT(*) FILTER (WHERE status = 'sent'), 0), 1
  ) as open_rate
FROM outbound_emails
WHERE user_id = $1;
```

---

## Instructions for Next AI Developer

### To Continue Phase 6 (Reply Detection):

1. Read `src/lib/gmail/email-parser.ts` to understand current parsing
2. Find where email sync happens (likely in `src/lib/gmail/gmail-service.ts`)
3. Add `In-Reply-To` header extraction
4. Implement reply matching logic as described above
5. Create the database migration for the index
6. Test with a real email thread

### To Continue Phase 7 (Analytics):

1. Create the API routes in `src/app/api/analytics/`
2. Follow the pattern in `src/app/api/campaigns/route.ts` for structure
3. Create the analytics page at `src/app/(auth)/analytics/page.tsx`
4. Add "Analytics" to Sidebar navigation (follow Campaigns pattern)
5. Install `recharts` if not present: `npm install recharts`

### Code Patterns to Follow:

**API Routes:**
- Use `requireAuth()` for authentication
- Use Zod for request validation
- Use `createApiSuccess()` / `createApiError()` for responses
- Use `createLogger()` for logging
- Include comprehensive comments

**Hooks:**
- Follow `useCampaigns.ts` pattern
- Use `useCallback` for all functions
- Include optimistic updates where appropriate
- Use the logger for debugging

**Pages:**
- Use `PageHeader` component for headers
- Follow existing UI component patterns
- Include loading states (Skeleton)
- Include error states
- Use `Card` components for sections

### Testing:

The build tooling isn't working in the current environment (missing node_modules). After making changes:

1. Run `npm install` if needed
2. Run `npm run build` to verify no TypeScript errors
3. Run `npm run lint` for linting
4. Test manually in browser

---

## Dependencies

Already installed:
- `@supabase/supabase-js` - Database client
- `lucide-react` - Icons
- Radix UI components - UI primitives

May need to install:
- `papaparse` - For more robust CSV parsing (currently using native parsing)
- `recharts` - For analytics charts

---

## References

- [Gmail API Documentation](https://developers.google.com/gmail/api)
- [Existing Implementation](./GMAIL_SENDING_IMPLEMENTATION.md)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)

---

## Commit History

- `b6e5880` - feat(campaigns): Implement Campaign Builder UI and Templates management (Phase 4-5)
- `2e70423` - docs: Add Phase 4+ implementation plan for Gmail campaigns
