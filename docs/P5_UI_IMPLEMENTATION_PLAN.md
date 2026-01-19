# P5 UI Implementation Plan - Email Intelligence

> **Created:** January 19, 2026
> **Branch:** `claude/plan-email-intelligence-I09HY`
> **Status:** Ready for Implementation

This document provides a detailed, actionable plan for completing P5 (UI Pages) of the Enhanced Email Intelligence feature.

---

## Executive Summary

### What's Already Done
- ✅ Hub Page exists (`src/app/(auth)/hub/page.tsx`) - 517 lines
- ✅ Hub Priorities API (`/api/hub/priorities`)
- ✅ `useHubPriorities` hook (153 lines)
- ✅ Contacts API (`/api/contacts`, `/api/contacts/[id]`)
- ✅ Dates API (`/api/dates`, `/api/dates/[id]`)
- ✅ Hub Priority Service with extracted dates integration

### What Needs to Be Built
| Task | Effort | Priority |
|------|--------|----------|
| Hub `extracted_date` type support | Small | P5.1 |
| `useContacts` hook | Small | P5.2 |
| `useExtractedDates` hook | Small | P5.3 |
| Contacts Page | Medium | P5.4 |
| Timeline Page | Medium | P5.5 |

---

## P5.1: Hub Page - Add Extracted Date Support

### Current Gap
The Hub page's `TYPE_CONFIG` only supports `email`, `action`, and `event` types. It's missing the `extracted_date` type.

### File to Modify
`src/app/(auth)/hub/page.tsx`

### Changes Required

#### 1. Add to TYPE_CONFIG (around line 55)

```typescript
const TYPE_CONFIG: Record<
  HubPriorityItem['type'],
  { icon: React.ElementType; color: string; bgColor: string; label: string }
> = {
  email: { /* existing */ },
  action: { /* existing */ },
  event: { /* existing */ },
  // ADD THIS:
  extracted_date: {
    icon: CalendarClock, // Import from lucide-react
    color: 'text-rose-600 dark:text-rose-400',
    bgColor: 'bg-rose-100 dark:bg-rose-900/30',
    label: 'Date',
  },
};
```

#### 2. Import CalendarClock icon (line 34)

```typescript
import {
  // ... existing imports
  CalendarClock,
} from 'lucide-react';
```

#### 3. Add date-specific badges in PriorityCard

For extracted dates, show the date type as an additional badge:
- `deadline` → 🔴 Deadline
- `payment_due` → 💰 Payment Due
- `birthday` → 🎂 Birthday
- `expiration` → ⚠️ Expiration

### Acceptance Criteria
- [ ] Extracted dates appear in Hub with CalendarClock icon
- [ ] Date type is shown (deadline, birthday, etc.)
- [ ] Links work correctly (`/timeline?date=<id>`)

---

## P5.2: Create useContacts Hook

### File to Create
`src/hooks/useContacts.ts`

### Interface Design

```typescript
interface UseContactsOptions {
  isVip?: boolean;
  isMuted?: boolean;
  relationshipType?: string;
  search?: string;
  sortBy?: 'email_count' | 'last_seen_at' | 'name';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

interface UseContactsReturn {
  contacts: Contact[];
  total: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  toggleVip: (contactId: string) => Promise<void>;
  toggleMuted: (contactId: string) => Promise<void>;
  updateRelationship: (contactId: string, type: string) => Promise<void>;
}
```

### Implementation Notes
- Fetch from `/api/contacts` with query params
- Support optimistic updates for VIP/muted toggles
- Cache results with SWR-like pattern
- ~150 lines estimated

### Acceptance Criteria
- [ ] Fetches contacts with all filters
- [ ] Pagination works correctly
- [ ] VIP/muted toggle with optimistic update
- [ ] Error handling and loading states

---

## P5.3: Create useExtractedDates Hook

### File to Create
`src/hooks/useExtractedDates.ts`

### Interface Design

```typescript
interface UseExtractedDatesOptions {
  type?: DateType;
  from?: string; // YYYY-MM-DD
  to?: string;
  isAcknowledged?: boolean;
  page?: number;
  limit?: number;
}

interface UseExtractedDatesReturn {
  dates: ExtractedDate[];
  total: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  acknowledge: (dateId: string) => Promise<void>;
  snooze: (dateId: string, until: Date) => Promise<void>;
  hide: (dateId: string) => Promise<void>;
}
```

### Implementation Notes
- Fetch from `/api/dates` with query params
- Support acknowledge/snooze/hide actions via POST to `/api/dates/[id]`
- Group dates by day for timeline view
- ~180 lines estimated

### Acceptance Criteria
- [ ] Fetches dates with all filters
- [ ] Date range filtering works
- [ ] Acknowledge/snooze/hide actions work
- [ ] Returns related email info

---

## P5.4: Create Contacts Page

### File to Create
`src/app/(auth)/contacts/page.tsx`

### Page Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Contacts                               [Search...] [Filters]│
├─────────────────────────────────────────────────────────────┤
│  VIP (5)   All (127)   Muted (12)                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ⭐ John Smith          john@acme.com                │    │
│  │    Client • Acme Corp • 47 emails • Last: 2d ago   │    │
│  │    [View Emails] [Mute]                            │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │    Sarah Johnson       sarah@company.com            │    │
│  │    Colleague • 23 emails • Last: 1w ago            │    │
│  │    [View Emails] [Mark VIP] [Mute]                 │    │
│  └─────────────────────────────────────────────────────┘    │
│  ...                                                        │
│  [Load More] or pagination                                  │
└─────────────────────────────────────────────────────────────┘
```

### Components to Create
1. **ContactCard** - Single contact card with actions
2. **ContactFilters** - Filter tabs (VIP/All/Muted) + search
3. **ContactList** - List with loading/empty states

### Features
- Tab filters: VIP | All | Muted
- Search by name/email
- Sort by: Email count, Last seen, Name
- Quick actions: Mark VIP, Mute, View emails
- Relationship type badge (client, colleague, vendor, etc.)
- Show email count and last contact date

### Acceptance Criteria
- [ ] Lists all contacts with pagination
- [ ] Filter tabs work (VIP/All/Muted)
- [ ] Search filters in real-time
- [ ] VIP star toggle works
- [ ] Mute toggle works
- [ ] "View emails" links to filtered inbox
- [ ] Mobile responsive

---

## P5.5: Create Timeline Page

### File to Create
`src/app/(auth)/timeline/page.tsx`

### Page Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Timeline                    [Calendar | List] [Filters]    │
├─────────────────────────────────────────────────────────────┤
│  TODAY - January 19                                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 🔴 Invoice #1234 due          Payment Due           │    │
│  │    From: billing@vendor.com   [View Email] [Done]   │    │
│  └─────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│  TOMORROW - January 20                                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 🟡 Submit proposal            Deadline              │    │
│  │    Client: Acme Corp          [View Email] [Snooze] │    │
│  └─────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│  NEXT WEEK                                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 🎂 Sarah's Birthday           Birthday • Jan 25     │    │
│  │                               [Acknowledge]         │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Components to Create
1. **DateCard** - Single date item with actions
2. **DateFilters** - Type filter dropdown + date range
3. **DateGroup** - Group header (Today, Tomorrow, This Week, etc.)
4. **TimelineList** - Grouped list view

### Features
- Group dates: Overdue | Today | Tomorrow | This Week | Next Week | Later
- Filter by type: All | Deadlines | Payments | Birthdays | Events
- Actions: Acknowledge (mark done), Snooze (pick date), Hide
- Link to source email
- Color-coded by urgency (overdue=red, today=orange, upcoming=yellow)
- Show related contact if available

### Date Type Icons
| Type | Icon | Color |
|------|------|-------|
| deadline | Clock | Red |
| payment_due | DollarSign | Orange |
| birthday | Cake | Pink |
| anniversary | Heart | Purple |
| expiration | AlertTriangle | Yellow |
| appointment | CalendarCheck | Blue |
| follow_up | ArrowRight | Teal |
| event | Calendar | Green |

### Acceptance Criteria
- [ ] Lists dates grouped by time period
- [ ] Overdue section highlighted at top
- [ ] Type filter works
- [ ] Acknowledge action marks date as done
- [ ] Snooze opens date picker and updates snooze_until
- [ ] Hide removes from view
- [ ] "View Email" links to email detail
- [ ] Mobile responsive

---

## Implementation Order

### Recommended Sequence

1. **P5.1: Hub extracted_date support** (~30 min)
   - Quick win, enables extracted dates in Hub immediately

2. **P5.2: useContacts hook** (~1-2 hours)
   - Prerequisite for Contacts page
   - Follow useEmails pattern

3. **P5.3: useExtractedDates hook** (~1-2 hours)
   - Prerequisite for Timeline page
   - Similar to useContacts

4. **P5.4: Contacts Page** (~2-3 hours)
   - Uses useContacts hook
   - Follow existing page patterns (inbox, clients)

5. **P5.5: Timeline Page** (~3-4 hours)
   - Most complex, uses useExtractedDates hook
   - Needs date grouping logic

### Total Estimated Effort
~8-12 hours of development time

---

## File Structure After Implementation

```
src/
├── app/(auth)/
│   ├── hub/page.tsx           # Modified (add extracted_date type)
│   ├── contacts/page.tsx      # NEW
│   └── timeline/page.tsx      # NEW
├── hooks/
│   ├── useContacts.ts         # NEW
│   ├── useExtractedDates.ts   # NEW
│   └── index.ts               # Update exports
└── components/
    ├── contacts/              # NEW (optional, inline is fine)
    │   ├── ContactCard.tsx
    │   └── index.ts
    └── timeline/              # NEW (optional, inline is fine)
        ├── DateCard.tsx
        ├── DateGroup.tsx
        └── index.ts
```

---

## Testing Considerations

### Unit Tests Needed
- [ ] `useContacts.test.ts` - Filter, pagination, optimistic updates
- [ ] `useExtractedDates.test.ts` - Filter, actions
- [ ] Hub page with extracted_date type

### Manual Testing Checklist
- [ ] Hub shows extracted dates with correct styling
- [ ] Contacts page loads and filters work
- [ ] Timeline page loads and groups correctly
- [ ] All actions (VIP, mute, acknowledge, snooze) work
- [ ] Mobile layouts are correct
- [ ] Empty states display properly

---

## Dependencies

### Required Before Starting
1. ✅ Database migrations applied (011-013)
2. ✅ Hub Priority Service updated with extracted dates
3. ✅ Contacts API working
4. ✅ Dates API working

### External Dependencies
- lucide-react (already installed)
- date-fns or similar for date grouping (check if already installed)

---

## Notes for Developer

### Patterns to Follow
- Look at `src/app/(auth)/inbox/page.tsx` for page structure
- Look at `src/hooks/useEmails.ts` for hook pattern
- Look at `src/app/(auth)/hub/page.tsx` for card components

### Code Style
- Max 400 lines per file
- Use JSDoc headers
- Use createLogger for logging
- Follow existing component patterns

### Questions to Consider
1. Should Timeline have a calendar view or just list view? (Start with list, add calendar later)
2. Should snooze have preset options (1 day, 1 week) or just date picker? (Presets + custom)
3. Should Contacts page link to "View emails from this contact" in inbox? (Yes, filter by sender)
