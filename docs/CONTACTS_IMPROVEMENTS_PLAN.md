# Contacts Display & Sync Improvements

> **Status:** Planning
> **Created:** January 21, 2026
> **Branch:** `claude/contacts-display-sync-improvements-QShyY`

## Overview

This document outlines improvements to the contacts feature focusing on three areas:
1. **Pagination** - Fix the 50-contact limit with proper page-based navigation
2. **Sync UX** - Better feedback during Google contacts import
3. **Contact Detail** - Enhanced CRM-light experience with full email history

---

## Design Decisions

### Pagination Approach: Page Numbers (Not Infinite Scroll)
**Rationale:**
- Explicit page numbers give users better orientation in large lists
- Easier to share specific "pages" or return to a known position
- Better for SEO if we add SSR later
- Simpler state management than infinite scroll

### Sync UX: Background Sync with Status Banner
**Rationale:**
- Users can continue working while sync runs
- Non-blocking UI is more respectful of user's time
- Status banner provides persistent visibility without modal fatigue
- Can dismiss and check back later

### Contact Navigation: Direct to Detail Page
**Rationale:**
- CRM-light experience means contact is the primary entity
- Email history lives inside contact detail page
- Reduces clicks to access contact information
- Still provide "View emails in inbox" as secondary action

---

## Implementation Plan

### Phase 1: Pagination System

#### 1.1 Update `useContacts` Hook

**File:** `src/hooks/useContacts.ts`

**Changes:**
- Add `page` and `totalPages` to state
- Replace `loadMore()` with `goToPage(page: number)`
- Add `totalCount` from API response
- Update return type with pagination info

**New Interface:**
```typescript
export interface UseContactsReturn {
  contacts: Contact[];
  isLoading: boolean;
  error: Error | null;
  // Pagination
  pagination: {
    page: number;
    totalPages: number;
    totalCount: number;
    pageSize: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  goToPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  // ... existing methods
}
```

#### 1.2 Create Pagination Component

**File:** `src/components/ui/pagination.tsx` (NEW)

**Features:**
- Page number buttons (1, 2, 3, ..., 10)
- Previous/Next buttons
- Ellipsis for large page counts (1, 2, ..., 8, 9, 10)
- Current page highlight
- Disabled states for boundaries
- Items per page info ("Showing 1-50 of 847")

#### 1.3 Update Contacts Page

**File:** `src/app/(auth)/contacts/page.tsx`

**Changes:**
- Replace "Load More" button with Pagination component
- Update stats to show total count from pagination
- Add page info to URL query params for shareability (`?page=2`)
- Scroll to top on page change

---

### Phase 2: Enhanced Sync UX

#### 2.1 Create Sync Status Context

**File:** `src/lib/contexts/sync-status-context.tsx` (NEW)

**Purpose:** Global state for sync operations visible across pages

**Interface:**
```typescript
interface SyncStatus {
  isActive: boolean;
  type: 'contacts' | 'emails' | null;
  progress: number;  // 0-100
  message: string;   // "Importing contacts from Gmail..."
  details: {
    imported: number;
    total: number;
    currentAccount?: string;
  };
  startedAt: Date | null;
  error: string | null;
}
```

#### 2.2 Create Sync Status Banner

**File:** `src/components/layout/SyncStatusBanner.tsx` (NEW)

**Features:**
- Sticky banner at top of page (below navbar)
- Progress bar with percentage
- Real-time count: "Importing 127 of ~500 contacts..."
- Account name if multiple accounts
- Dismiss button (hides banner, sync continues)
- Error state with retry button
- Auto-dismiss on completion after 5s

#### 2.3 Update Import Google Contacts API

**File:** `src/app/api/contacts/import-google/route.ts`

**Changes:**
- Add progress tracking to database during import
- Store progress in `user_profiles.sync_progress` (existing JSONB field)
- Return estimated total before starting

#### 2.4 Create Sync Progress Polling Endpoint

**File:** `src/app/api/contacts/sync-progress/route.ts` (NEW)

**Purpose:** Lightweight endpoint for polling sync progress

**Response:**
```json
{
  "status": "in_progress",
  "progress": 45,
  "imported": 127,
  "estimatedTotal": 500,
  "currentAccount": "hazel@gmail.com",
  "startedAt": "2026-01-21T10:00:00Z"
}
```

#### 2.5 Update SyncContactsButton

**File:** `src/components/contacts/SyncContactsButton.tsx`

**Changes:**
- Integrate with SyncStatusContext
- Start sync triggers banner (not local state)
- Button shows "Syncing..." when context.isActive
- Remove local progress handling (delegated to banner)

#### 2.6 Add Banner to Auth Layout

**File:** `src/app/(auth)/layout.tsx`

**Changes:**
- Wrap with SyncStatusProvider
- Add SyncStatusBanner below Navbar

---

### Phase 3: Contact Detail Enhancements

#### 3.1 Update Contact Cards to Link to Detail Page

**File:** `src/app/(auth)/contacts/page.tsx`

**Changes:**
- Wrap ContactCard in `<Link href={`/contacts/${contact.id}`}>`
- Move "View Emails" button to detail page
- Add hover state indicating clickability

#### 3.2 Add Sent Emails to Contact Detail

**File:** `src/app/(auth)/contacts/[id]/page.tsx`

**Changes:**
- Fetch both received AND sent emails
- Add tabs: "All" | "Received" | "Sent"
- Update email query to include `direction` filter
- Show sent/received indicator on each email

#### 3.3 Email History Pagination

**File:** `src/app/(auth)/contacts/[id]/page.tsx`

**Changes:**
- Add pagination to email history section
- Default 20 per page, "Load more" or page numbers
- Sort by date descending (most recent first)

#### 3.4 Update Emails API for Direction Filter

**File:** `src/app/api/emails/route.ts`

**Changes:**
- Add `direction` query param: 'sent' | 'received' | 'all'
- Sent emails: user is in To/CC/BCC, contact is sender
- Received emails: contact is sender, user is recipient

---

## File Changes Summary

### New Files
| File | Purpose |
|------|---------|
| `src/components/ui/pagination.tsx` | Reusable pagination component |
| `src/lib/contexts/sync-status-context.tsx` | Global sync state |
| `src/components/layout/SyncStatusBanner.tsx` | Sync progress banner |
| `src/app/api/contacts/sync-progress/route.ts` | Progress polling endpoint |

### Modified Files
| File | Changes |
|------|---------|
| `src/hooks/useContacts.ts` | Add page-based pagination |
| `src/app/(auth)/contacts/page.tsx` | Pagination UI, link to detail |
| `src/app/(auth)/contacts/[id]/page.tsx` | Sent emails, pagination |
| `src/app/api/contacts/import-google/route.ts` | Progress tracking |
| `src/app/api/emails/route.ts` | Direction filter |
| `src/components/contacts/SyncContactsButton.tsx` | Use context |
| `src/app/(auth)/layout.tsx` | Add banner + provider |

### No Database Changes
We'll use the existing `user_profiles.sync_progress` JSONB field for progress tracking. No new tables or columns needed.

---

## API Contracts

### GET /api/contacts (Updated)

**Query Params:**
```
page=1           // Page number (1-indexed)
limit=50         // Items per page (default: 50, max: 100)
search=john      // Search filter
sortBy=name      // Sort field
sortOrder=asc    // Sort direction
isVip=true       // VIP filter
isMuted=false    // Muted filter
```

**Response:**
```json
{
  "data": [...contacts],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalCount": 847,
    "totalPages": 17,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### GET /api/contacts/sync-progress (New)

**Response:**
```json
{
  "status": "idle" | "in_progress" | "completed" | "error",
  "progress": 0-100,
  "imported": 127,
  "estimatedTotal": 500,
  "currentAccount": "hazel@gmail.com",
  "message": "Importing contacts...",
  "startedAt": "2026-01-21T10:00:00Z",
  "completedAt": null,
  "error": null
}
```

### GET /api/emails (Updated)

**New Query Param:**
```
direction=all|sent|received   // Filter by email direction
contactEmail=john@example.com // Combined with direction for contact page
```

---

## Logging Strategy

All operations will use structured logging with the following patterns:

### Pagination Logging
```typescript
logger.debug('Page navigation', {
  from: previousPage,
  to: newPage,
  totalPages,
  userId: userId.substring(0, 8),
});
```

### Sync Logging
```typescript
logger.start('Google contacts sync initiated', {
  userId: userId.substring(0, 8),
  accountCount: accounts.length,
  maxContacts,
});

logger.info('Sync progress', {
  progress: Math.round((imported / total) * 100),
  imported,
  total,
  currentAccount: account.email,
});

logger.success('Google contacts sync complete', {
  imported: totalImported,
  starred: totalStarred,
  skipped: totalSkipped,
  durationMs: Date.now() - startTime,
});
```

### Contact Detail Logging
```typescript
logger.start('Fetching contact emails', {
  contactId: contactId.substring(0, 8),
  direction,
  page,
});

logger.success('Contact emails fetched', {
  count: emails.length,
  direction,
  hasMore,
});
```

---

## Testing Checklist

### Pagination
- [ ] Page 1 loads by default
- [ ] Clicking page number navigates correctly
- [ ] Previous/Next buttons work
- [ ] Disabled states at boundaries
- [ ] URL updates with page param
- [ ] Direct URL access works (`/contacts?page=5`)
- [ ] Filters persist across pages
- [ ] Total count is accurate

### Sync UX
- [ ] Banner appears when sync starts
- [ ] Progress updates in real-time
- [ ] Can dismiss banner
- [ ] Banner reappears if navigating away and back
- [ ] Completion shows success state
- [ ] Error state shows retry option
- [ ] Multiple accounts show which is current

### Contact Detail
- [ ] Click card goes to detail page
- [ ] Back button returns to contacts list
- [ ] Sent emails appear in history
- [ ] Tab switching works (All/Received/Sent)
- [ ] Email pagination loads more
- [ ] Counts are accurate

---

## Implementation Order

1. **Pagination Component** - Foundation for other work
2. **useContacts Pagination** - Hook changes
3. **Contacts Page Pagination** - UI integration
4. **Sync Status Context** - Foundation for sync UX
5. **Sync Progress API** - Backend for polling
6. **Sync Status Banner** - UI component
7. **Update Import API** - Progress tracking
8. **Contact Card Links** - Quick win
9. **Email Direction Filter** - API change
10. **Contact Detail Emails** - Final UI work

---

## Rollback Plan

All changes are additive or modify existing behavior incrementally. If issues arise:
1. Pagination defaults to page 1, existing behavior preserved
2. Sync banner can be disabled by removing from layout
3. Contact links can revert to inbox filter approach

No database migrations = easy rollback via git revert.
