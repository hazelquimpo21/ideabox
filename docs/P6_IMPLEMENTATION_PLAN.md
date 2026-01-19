# Email Intelligence P6: Next Steps Implementation Plan

> **Created:** January 19, 2026
> **Status:** Ready for Implementation
> **Branch:** `claude/plan-email-intelligence-FEhH8`

This document provides a detailed, actionable implementation plan for the final enhancements to the Enhanced Email Intelligence feature.

---

## Executive Summary

### Completed Work (P1-P5)
- ✅ Database migrations (011-013)
- ✅ User context service with caching
- ✅ Hub Priority Service with extracted dates
- ✅ Contact backfill endpoint and script
- ✅ Test suite for Hub and backfill
- ✅ Contacts page (`/contacts`)
- ✅ Timeline page (`/timeline`)
- ✅ Hooks: `useContacts`, `useExtractedDates`

### P6 Work (This Plan)

| Priority | Task | Effort | Dependencies |
|----------|------|--------|--------------|
| P6.1 | Sidebar Navigation Updates | Small | None |
| P6.2 | Contact Detail Page | Medium | P6.1 |
| P6.3 | Calendar View for Timeline | Medium | None |
| P6.4 | E2E Testing | Medium | P6.1-P6.3 |

---

## Priority 6.1: Sidebar Navigation Updates

### What
Add Contacts and Timeline links to the main sidebar navigation.

### Why
The Contacts and Timeline pages exist but are not discoverable from the sidebar navigation. Users need a way to access these new features.

### Current State
The sidebar (`src/components/layout/Sidebar.tsx`) has these main nav items:
- Hub, Discover, Inbox, Actions, Clients, Archive

### Implementation

#### Step 6.1.1: Add Icons Import

**File:** `src/components/layout/Sidebar.tsx`

Add to existing imports:
```typescript
import {
  // ... existing imports
  BookUser,      // For Contacts
  CalendarDays,  // For Timeline
} from 'lucide-react';
```

#### Step 6.1.2: Add Nav Items

Insert after "Clients" entry in `mainNavItems` array:

```typescript
const mainNavItems: NavItem[] = [
  { label: 'Hub', href: '/hub', icon: Target },
  { label: 'Discover', href: '/discover', icon: Sparkles },
  { label: 'Inbox', href: '/inbox', icon: Inbox },
  { label: 'Actions', href: '/actions', icon: CheckSquare, badge: 'count', countKey: 'action_required' },
  { label: 'Clients', href: '/clients', icon: Users },
  // ─── NEW ITEMS ───────────────────────────────────────────
  { label: 'Contacts', href: '/contacts', icon: BookUser },
  { label: 'Timeline', href: '/timeline', icon: CalendarDays },
  // ─────────────────────────────────────────────────────────
  { label: 'Archive', href: '/archive', icon: Archive },
];
```

### Acceptance Criteria
- [ ] Contacts link appears in sidebar with BookUser icon
- [ ] Timeline link appears in sidebar with CalendarDays icon
- [ ] Both links show active state when on respective pages
- [ ] Mobile sidebar shows both new items
- [ ] Links work correctly on desktop and mobile

### Estimated Changes
- 1 file modified
- ~5 lines added

---

## Priority 6.2: Contact Detail Page

### What
Create a `/contacts/[id]` page that shows:
- Contact profile (name, email, company, job title)
- VIP/muted status toggles
- Relationship type selector
- Email history with this contact
- Extracted dates related to this contact
- Notes field

### Why
Users can see a list of contacts but cannot dive deep into a single contact's details and communication history. This is essential for understanding and managing relationships.

### File Structure
```
src/app/(auth)/contacts/[id]/
├── page.tsx           # Main contact detail page
└── loading.tsx        # Loading skeleton
```

### Implementation

#### Step 6.2.1: Create Contact Detail Page

**File:** `src/app/(auth)/contacts/[id]/page.tsx`

```typescript
/**
 * Contact Detail Page
 *
 * Displays detailed information about a single contact including:
 * - Profile info (name, email, company, job title)
 * - VIP/muted status with toggles
 * - Relationship type selector
 * - Email history timeline
 * - Related extracted dates
 * - Notes field
 *
 * @module app/(auth)/contacts/[id]/page
 */

'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Star,
  VolumeX,
  Mail,
  Building2,
  Briefcase,
  Calendar,
  Clock,
  ExternalLink,
  Edit2,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  Skeleton,
} from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { useContacts, ContactRelationshipType } from '@/hooks/useContacts';
import { createLogger } from '@/lib/utils/logger';
import { toast } from 'sonner';

const logger = createLogger('ContactDetailPage');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface ContactEmail {
  id: string;
  subject: string;
  date: string;
  snippet: string;
  category: string;
}

interface RelatedDate {
  id: string;
  date_type: string;
  date: string;
  title: string;
  is_acknowledged: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const RELATIONSHIP_TYPES: { value: ContactRelationshipType; label: string }[] = [
  { value: 'client', label: 'Client' },
  { value: 'colleague', label: 'Colleague' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'friend', label: 'Friend' },
  { value: 'family', label: 'Family' },
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'service', label: 'Service' },
  { value: 'unknown', label: 'Unknown' },
];

const RELATIONSHIP_COLORS: Record<ContactRelationshipType, string> = {
  client: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  colleague: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  vendor: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  friend: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
  family: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  recruiter: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  service: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  unknown: 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-500',
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function ContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const contactId = params.id as string;

  // ─────────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────────
  const [contact, setContact] = React.useState<any>(null);
  const [emails, setEmails] = React.useState<ContactEmail[]>([]);
  const [dates, setDates] = React.useState<RelatedDate[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState('');
  const [isSavingNotes, setIsSavingNotes] = React.useState(false);

  const { toggleVip, toggleMuted, updateRelationshipType } = useContacts();

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch contact data
  // ─────────────────────────────────────────────────────────────────────────────
  const fetchContact = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch contact details
      const contactRes = await fetch(`/api/contacts/${contactId}`);
      if (!contactRes.ok) {
        if (contactRes.status === 404) {
          throw new Error('Contact not found');
        }
        throw new Error('Failed to fetch contact');
      }
      const contactData = await contactRes.json();
      setContact(contactData);
      setNotes(contactData.notes || '');

      // Fetch emails from this contact
      const emailsRes = await fetch(`/api/emails?sender=${encodeURIComponent(contactData.email)}&limit=20`);
      if (emailsRes.ok) {
        const emailsData = await emailsRes.json();
        setEmails(emailsData.emails || []);
      }

      // Fetch related dates
      const datesRes = await fetch(`/api/dates?contact_id=${contactId}&limit=10`);
      if (datesRes.ok) {
        const datesData = await datesRes.json();
        setDates(datesData.dates || []);
      }

      logger.success('Contact data loaded', { contactId: contactId.substring(0, 8) });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      logger.error('Failed to load contact', { error: message });
    } finally {
      setIsLoading(false);
    }
  }, [contactId]);

  React.useEffect(() => {
    fetchContact();
  }, [fetchContact]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────────
  const handleToggleVip = async () => {
    if (!contact) return;
    const newValue = !contact.is_vip;
    setContact({ ...contact, is_vip: newValue });
    try {
      await toggleVip(contactId);
      toast.success(newValue ? 'Marked as VIP' : 'Removed VIP status');
    } catch {
      setContact({ ...contact, is_vip: !newValue });
      toast.error('Failed to update VIP status');
    }
  };

  const handleToggleMuted = async () => {
    if (!contact) return;
    const newValue = !contact.is_muted;
    setContact({ ...contact, is_muted: newValue });
    try {
      await toggleMuted(contactId);
      toast.success(newValue ? 'Contact muted' : 'Contact unmuted');
    } catch {
      setContact({ ...contact, is_muted: !newValue });
      toast.error('Failed to update mute status');
    }
  };

  const handleRelationshipChange = async (value: ContactRelationshipType) => {
    if (!contact) return;
    const oldValue = contact.relationship_type;
    setContact({ ...contact, relationship_type: value });
    try {
      await updateRelationshipType(contactId, value);
      toast.success('Relationship type updated');
    } catch {
      setContact({ ...contact, relationship_type: oldValue });
      toast.error('Failed to update relationship type');
    }
  };

  const handleSaveNotes = async () => {
    if (!contact) return;
    setIsSavingNotes(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error('Failed to save notes');
      toast.success('Notes saved');
    } catch {
      toast.error('Failed to save notes');
    } finally {
      setIsSavingNotes(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────
  if (isLoading) {
    return <ContactDetailSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-medium">{error}</h2>
        <Button onClick={() => router.push('/contacts')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Contacts
        </Button>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/contacts')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{contact.name || contact.email}</h1>
          {contact.name && (
            <p className="text-muted-foreground">{contact.email}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant={contact.is_vip ? 'default' : 'outline'}
            size="sm"
            onClick={handleToggleVip}
          >
            <Star className={cn('h-4 w-4 mr-1', contact.is_vip && 'fill-current')} />
            {contact.is_vip ? 'VIP' : 'Mark VIP'}
          </Button>
          <Button
            variant={contact.is_muted ? 'secondary' : 'outline'}
            size="sm"
            onClick={handleToggleMuted}
          >
            <VolumeX className="h-4 w-4 mr-1" />
            {contact.is_muted ? 'Muted' : 'Mute'}
          </Button>
        </div>
      </div>

      {/* Profile Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Company</label>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span>{contact.company || 'Unknown'}</span>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Job Title</label>
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <span>{contact.job_title || 'Unknown'}</span>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Relationship</label>
            <Select
              value={contact.relationship_type}
              onValueChange={handleRelationshipChange}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RELATIONSHIP_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Email Count</label>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>{contact.email_count || 0} emails</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{contact.email_count || 0}</div>
            <p className="text-xs text-muted-foreground">Total Emails</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{contact.recent_email_count || 0}</div>
            <p className="text-xs text-muted-foreground">Last 30 Days</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {contact.last_seen_at
                ? formatDistanceToNow(new Date(contact.last_seen_at), { addSuffix: true })
                : 'Never'}
            </div>
            <p className="text-xs text-muted-foreground">Last Contact</p>
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            placeholder="Add notes about this contact..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
          <Button
            size="sm"
            onClick={handleSaveNotes}
            disabled={isSavingNotes || notes === (contact.notes || '')}
          >
            {isSavingNotes ? 'Saving...' : 'Save Notes'}
          </Button>
        </CardContent>
      </Card>

      {/* Email History */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Email History</CardTitle>
          <Link href={`/inbox?sender=${encodeURIComponent(contact.email)}`}>
            <Button variant="ghost" size="sm">
              View All <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {emails.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No emails found from this contact
            </p>
          ) : (
            <div className="space-y-2">
              {emails.map((email) => (
                <Link
                  key={email.id}
                  href={`/inbox/${email.id}`}
                  className="block p-3 rounded-lg border hover:bg-accent transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate flex-1">{email.subject}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {format(new Date(email.date), 'MMM d, yyyy')}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate mt-1">
                    {email.snippet}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Related Dates */}
      {dates.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Related Dates</CardTitle>
            <Link href={`/timeline?contact_id=${contactId}`}>
              <Button variant="ghost" size="sm">
                View All <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dates.map((date) => (
                <div
                  key={date.id}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg border',
                    date.is_acknowledged && 'opacity-50'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{date.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {date.date_type} - {format(new Date(date.date), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                  {date.is_acknowledged && (
                    <Badge variant="secondary">Done</Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOADING SKELETON
// ═══════════════════════════════════════════════════════════════════════════════

function ContactDetailSkeleton() {
  return (
    <div className="container max-w-4xl py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded" />
        <div className="flex-1">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32 mt-2" />
        </div>
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-20" />
      </div>
      <Skeleton className="h-48 w-full rounded-lg" />
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
      <Skeleton className="h-40 w-full rounded-lg" />
    </div>
  );
}
```

#### Step 6.2.2: Create Loading Component

**File:** `src/app/(auth)/contacts/[id]/loading.tsx`

```typescript
import { Skeleton } from '@/components/ui';

export default function ContactDetailLoading() {
  return (
    <div className="container max-w-4xl py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded" />
        <div className="flex-1">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32 mt-2" />
        </div>
      </div>
      <Skeleton className="h-48 w-full rounded-lg" />
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
    </div>
  );
}
```

#### Step 6.2.3: Add Notes Column to Database

**File:** `supabase/migrations/014_contact_notes.sql`

```sql
-- Add notes column to contacts table
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes TEXT;

-- Create index for efficient lookup
CREATE INDEX IF NOT EXISTS idx_contacts_user_email ON contacts(user_id, email);
```

#### Step 6.2.4: Update Contact API Schema

**File:** `src/lib/api/schemas.ts`

Add `notes` to the contact update schema:

```typescript
// In contactUpdateSchema
notes: z.string().max(5000).optional(),
```

### Acceptance Criteria
- [ ] Contact detail page loads at `/contacts/[id]`
- [ ] Shows contact profile (name, email, company, job title)
- [ ] VIP toggle works with optimistic update
- [ ] Muted toggle works with optimistic update
- [ ] Relationship type selector works
- [ ] Email history shows recent emails from contact
- [ ] Related dates section shows extracted dates linked to contact
- [ ] Notes can be saved
- [ ] Loading skeleton displays while fetching
- [ ] Error state shows when contact not found
- [ ] Back button returns to contacts list

### Estimated Changes
- 3 new files created
- 1 migration file created
- 1 schema file updated
- ~500 lines of code

---

## Priority 6.3: Calendar View for Timeline

### What
Add an optional calendar view to the Timeline page, allowing users to see dates in a monthly calendar format instead of the grouped list.

### Why
Different users prefer different ways to visualize their timeline. A calendar view provides spatial context for understanding date distribution and planning.

### Implementation

#### Step 6.3.1: Add View Toggle to Timeline Page

**File:** `src/app/(auth)/timeline/page.tsx`

Add state and toggle button:

```typescript
// Add to existing state
const [viewMode, setViewMode] = React.useState<'list' | 'calendar'>('list');

// Add toggle in the header
<div className="flex items-center gap-2">
  <Button
    variant={viewMode === 'list' ? 'default' : 'outline'}
    size="sm"
    onClick={() => setViewMode('list')}
  >
    <List className="h-4 w-4 mr-1" />
    List
  </Button>
  <Button
    variant={viewMode === 'calendar' ? 'default' : 'outline'}
    size="sm"
    onClick={() => setViewMode('calendar')}
  >
    <CalendarDays className="h-4 w-4 mr-1" />
    Calendar
  </Button>
</div>
```

#### Step 6.3.2: Create Calendar Component

**File:** `src/components/timeline/CalendarView.tsx`

```typescript
/**
 * Calendar View Component for Timeline
 *
 * Displays extracted dates in a monthly calendar grid.
 * Supports month navigation and date type color coding.
 *
 * @module components/timeline/CalendarView
 */

'use client';

import * as React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
} from 'lucide-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
} from 'date-fns';
import { Button, Card, Badge } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import type { ExtractedDate } from '@/hooks/useExtractedDates';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface CalendarViewProps {
  dates: ExtractedDate[];
  onDateClick?: (date: Date, items: ExtractedDate[]) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const DATE_TYPE_COLORS: Record<string, string> = {
  deadline: 'bg-red-500',
  payment_due: 'bg-orange-500',
  event: 'bg-purple-500',
  birthday: 'bg-pink-500',
  anniversary: 'bg-rose-500',
  expiration: 'bg-yellow-500',
  appointment: 'bg-blue-500',
  follow_up: 'bg-green-500',
  reminder: 'bg-teal-500',
  recurring: 'bg-gray-500',
  other: 'bg-gray-400',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function CalendarView({ dates, onDateClick }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = React.useState(new Date());
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // Calendar calculations
  // ─────────────────────────────────────────────────────────────────────────────
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Group dates by day for quick lookup
  const datesByDay = React.useMemo(() => {
    const map = new Map<string, ExtractedDate[]>();
    dates.forEach((d) => {
      const key = format(new Date(d.date), 'yyyy-MM-dd');
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(d);
    });
    return map;
  }, [dates]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────────
  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const handleToday = () => setCurrentMonth(new Date());

  const handleDayClick = (day: Date) => {
    const key = format(day, 'yyyy-MM-dd');
    const dayDates = datesByDay.get(key) || [];
    setSelectedDate(day);
    onDateClick?.(day, dayDates);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Month Navigation */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {format(currentMonth, 'MMMM yyyy')}
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleToday}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Calendar Grid */}
      <Card className="p-4">
        {/* Weekday Headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="text-center text-xs font-medium text-muted-foreground py-2"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day, index) => {
            const key = format(day, 'yyyy-MM-dd');
            const dayDates = datesByDay.get(key) || [];
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const isTodayDate = isToday(day);

            return (
              <button
                key={index}
                onClick={() => handleDayClick(day)}
                className={cn(
                  'relative h-20 p-1 rounded-md border transition-colors text-left',
                  isCurrentMonth
                    ? 'bg-background hover:bg-accent'
                    : 'bg-muted/50 text-muted-foreground',
                  isSelected && 'ring-2 ring-primary',
                  isTodayDate && 'border-primary'
                )}
              >
                <span
                  className={cn(
                    'text-sm',
                    isTodayDate && 'font-bold text-primary'
                  )}
                >
                  {format(day, 'd')}
                </span>

                {/* Date indicators */}
                {dayDates.length > 0 && (
                  <div className="absolute bottom-1 left-1 right-1 flex flex-wrap gap-0.5">
                    {dayDates.slice(0, 3).map((d, i) => (
                      <div
                        key={i}
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          DATE_TYPE_COLORS[d.date_type] || DATE_TYPE_COLORS.other,
                          d.is_acknowledged && 'opacity-40'
                        )}
                        title={d.title}
                      />
                    ))}
                    {dayDates.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{dayDates.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Selected Day Details */}
      {selectedDate && (
        <SelectedDayPanel
          date={selectedDate}
          items={datesByDay.get(format(selectedDate, 'yyyy-MM-dd')) || []}
          onClose={() => setSelectedDate(null)}
        />
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {Object.entries(DATE_TYPE_COLORS).slice(0, 6).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1">
            <div className={cn('h-2 w-2 rounded-full', color)} />
            <span className="capitalize text-muted-foreground">
              {type.replace('_', ' ')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SELECTED DAY PANEL
// ═══════════════════════════════════════════════════════════════════════════════

function SelectedDayPanel({
  date,
  items,
  onClose,
}: {
  date: Date;
  items: ExtractedDate[];
  onClose: () => void;
}) {
  if (items.length === 0) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium">{format(date, 'EEEE, MMMM d, yyyy')}</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <p className="text-sm text-muted-foreground text-center py-4">
          No items scheduled for this day
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium">{format(date, 'EEEE, MMMM d, yyyy')}</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              'flex items-start gap-3 p-2 rounded-md border',
              item.is_acknowledged && 'opacity-50'
            )}
          >
            <div
              className={cn(
                'h-2 w-2 rounded-full mt-2',
                DATE_TYPE_COLORS[item.date_type] || DATE_TYPE_COLORS.other
              )}
            />
            <div className="flex-1">
              <p className="font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground capitalize">
                {item.date_type.replace('_', ' ')}
                {item.time && ` at ${item.time}`}
              </p>
            </div>
            {item.is_acknowledged && (
              <Badge variant="secondary" className="text-xs">
                Done
              </Badge>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

export default CalendarView;
```

#### Step 6.3.3: Update Timeline Page

**File:** `src/app/(auth)/timeline/page.tsx`

Import and use the calendar component:

```typescript
import { CalendarView } from '@/components/timeline/CalendarView';

// In the render, switch between views:
{viewMode === 'list' ? (
  // Existing list view code
  <div className="space-y-6">
    {/* ... existing grouped list ... */}
  </div>
) : (
  <CalendarView
    dates={dates}
    onDateClick={(day, items) => {
      // Optionally handle date click
    }}
  />
)}
```

### Acceptance Criteria
- [ ] Toggle button switches between List and Calendar views
- [ ] Calendar shows current month with navigation
- [ ] Dates are indicated with colored dots
- [ ] Clicking a day shows items for that day
- [ ] Month navigation works (prev/next/today)
- [ ] Legend explains date type colors
- [ ] Acknowledged items appear faded
- [ ] Works on mobile (responsive grid)

### Estimated Changes
- 1 new file created (`CalendarView.tsx`)
- 1 file modified (timeline page)
- ~400 lines of code

---

## Priority 6.4: E2E Testing

### What
Create comprehensive E2E tests for:
- Contacts page (list, filter, search, VIP/mute toggles)
- Contact detail page (profile, email history, notes)
- Timeline page (list view, calendar view, actions)
- Hub integration with extracted dates

### Why
These new pages need test coverage to ensure they work correctly and don't regress during future changes.

### Test Framework
Using Playwright (if exists) or Vitest with Testing Library for component tests.

### Implementation

#### Step 6.4.1: Contacts Page Tests

**File:** `src/app/(auth)/contacts/__tests__/page.test.tsx`

```typescript
/**
 * Contacts Page Tests
 *
 * Tests for the contacts list page including:
 * - Loading and displaying contacts
 * - Filtering by VIP/muted status
 * - Searching contacts
 * - VIP and mute toggle actions
 * - Pagination
 *
 * @module app/(auth)/contacts/__tests__/page.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ContactsPage from '../page';

// Mock useContacts hook
vi.mock('@/hooks/useContacts', () => ({
  useContacts: vi.fn(() => ({
    contacts: mockContacts,
    isLoading: false,
    error: null,
    hasMore: false,
    stats: { total: 2, vip: 1, muted: 0, clients: 1 },
    toggleVip: vi.fn(),
    toggleMuted: vi.fn(),
    loadMore: vi.fn(),
    refetch: vi.fn(),
    setFilters: vi.fn(),
  })),
}));

const mockContacts = [
  {
    id: '1',
    email: 'john@acme.com',
    name: 'John Smith',
    company: 'Acme Corp',
    job_title: 'CEO',
    relationship_type: 'client',
    is_vip: true,
    is_muted: false,
    email_count: 47,
    last_seen_at: '2026-01-15T10:00:00Z',
  },
  {
    id: '2',
    email: 'jane@example.com',
    name: 'Jane Doe',
    company: null,
    job_title: null,
    relationship_type: 'unknown',
    is_vip: false,
    is_muted: false,
    email_count: 12,
    last_seen_at: '2026-01-10T10:00:00Z',
  },
];

describe('ContactsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders contacts list', async () => {
    render(<ContactsPage />);

    await waitFor(() => {
      expect(screen.getByText('John Smith')).toBeInTheDocument();
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });
  });

  it('displays VIP badge for VIP contacts', async () => {
    render(<ContactsPage />);

    await waitFor(() => {
      const johnCard = screen.getByText('John Smith').closest('div');
      expect(johnCard).toContainElement(screen.getByTitle('VIP'));
    });
  });

  it('shows contact company and job title', async () => {
    render(<ContactsPage />);

    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      expect(screen.getByText('CEO')).toBeInTheDocument();
    });
  });

  it('shows email count', async () => {
    render(<ContactsPage />);

    await waitFor(() => {
      expect(screen.getByText('47 emails')).toBeInTheDocument();
    });
  });

  it('filters by search term', async () => {
    const user = userEvent.setup();
    render(<ContactsPage />);

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'john');

    // Verify filter is applied (mock would need to be updated)
    await waitFor(() => {
      expect(screen.getByDisplayValue('john')).toBeInTheDocument();
    });
  });

  it('handles VIP toggle', async () => {
    const user = userEvent.setup();
    const mockToggleVip = vi.fn();
    vi.mocked(useContacts).mockReturnValue({
      ...vi.mocked(useContacts)(),
      toggleVip: mockToggleVip,
    });

    render(<ContactsPage />);

    const vipButton = screen.getAllByRole('button', { name: /vip/i })[0];
    await user.click(vipButton);

    expect(mockToggleVip).toHaveBeenCalledWith('1');
  });
});
```

#### Step 6.4.2: Timeline Page Tests

**File:** `src/app/(auth)/timeline/__tests__/page.test.tsx`

```typescript
/**
 * Timeline Page Tests
 *
 * Tests for the timeline/extracted dates page including:
 * - Loading and displaying dates grouped by time period
 * - Filtering by date type
 * - Acknowledge, snooze, hide actions
 * - Calendar view toggle
 *
 * @module app/(auth)/timeline/__tests__/page.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TimelinePage from '../page';

vi.mock('@/hooks/useExtractedDates', () => ({
  useExtractedDates: vi.fn(() => ({
    dates: mockDates,
    groupedDates: mockGroupedDates,
    isLoading: false,
    error: null,
    stats: { total: 3, overdue: 1, pending: 2, done: 0 },
    acknowledge: vi.fn(),
    snooze: vi.fn(),
    hide: vi.fn(),
    refetch: vi.fn(),
  })),
}));

const mockDates = [
  {
    id: '1',
    date_type: 'deadline',
    date: '2026-01-18',
    title: 'Project proposal due',
    is_acknowledged: false,
    is_recurring: false,
  },
  {
    id: '2',
    date_type: 'birthday',
    date: '2026-01-20',
    title: "Sarah's Birthday",
    is_acknowledged: false,
    is_recurring: true,
  },
];

const mockGroupedDates = {
  overdue: [mockDates[0]],
  today: [],
  tomorrow: [],
  thisWeek: [mockDates[1]],
  nextWeek: [],
  later: [],
};

describe('TimelinePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders timeline with date groups', async () => {
    render(<TimelinePage />);

    await waitFor(() => {
      expect(screen.getByText('Overdue')).toBeInTheDocument();
      expect(screen.getByText('Project proposal due')).toBeInTheDocument();
    });
  });

  it('shows date type badges', async () => {
    render(<TimelinePage />);

    await waitFor(() => {
      expect(screen.getByText('deadline')).toBeInTheDocument();
      expect(screen.getByText('birthday')).toBeInTheDocument();
    });
  });

  it('displays overdue warning styling', async () => {
    render(<TimelinePage />);

    await waitFor(() => {
      const overdueSection = screen.getByText('Overdue').closest('section');
      expect(overdueSection).toHaveClass('border-red-500');
    });
  });

  it('handles acknowledge action', async () => {
    const user = userEvent.setup();
    const mockAcknowledge = vi.fn();
    vi.mocked(useExtractedDates).mockReturnValue({
      ...vi.mocked(useExtractedDates)(),
      acknowledge: mockAcknowledge,
    });

    render(<TimelinePage />);

    const doneButton = screen.getAllByRole('button', { name: /done/i })[0];
    await user.click(doneButton);

    expect(mockAcknowledge).toHaveBeenCalledWith('1');
  });

  it('toggles between list and calendar view', async () => {
    const user = userEvent.setup();
    render(<TimelinePage />);

    // Find calendar view button
    const calendarButton = screen.getByRole('button', { name: /calendar/i });
    await user.click(calendarButton);

    // Calendar view should be visible
    await waitFor(() => {
      expect(screen.getByText(/january 2026/i)).toBeInTheDocument();
    });
  });
});
```

#### Step 6.4.3: Contact Detail Page Tests

**File:** `src/app/(auth)/contacts/[id]/__tests__/page.test.tsx`

```typescript
/**
 * Contact Detail Page Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ContactDetailPage from '../page';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'test-id' }),
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock fetch
global.fetch = vi.fn();

const mockContact = {
  id: 'test-id',
  email: 'john@acme.com',
  name: 'John Smith',
  company: 'Acme Corp',
  job_title: 'CEO',
  relationship_type: 'client',
  is_vip: true,
  is_muted: false,
  email_count: 47,
  recent_email_count: 5,
  last_seen_at: '2026-01-15T10:00:00Z',
  notes: 'Important client',
};

describe('ContactDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/contacts/test-id')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockContact),
        });
      }
      if (url.includes('/api/emails')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ emails: [] }),
        });
      }
      if (url.includes('/api/dates')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ dates: [] }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
  });

  it('renders contact profile', async () => {
    render(<ContactDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('John Smith')).toBeInTheDocument();
      expect(screen.getByText('john@acme.com')).toBeInTheDocument();
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      expect(screen.getByText('CEO')).toBeInTheDocument();
    });
  });

  it('shows VIP status', async () => {
    render(<ContactDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /vip/i })).toBeInTheDocument();
    });
  });

  it('displays email stats', async () => {
    render(<ContactDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('47')).toBeInTheDocument(); // Total emails
      expect(screen.getByText('5')).toBeInTheDocument();  // Recent emails
    });
  });

  it('shows existing notes', async () => {
    render(<ContactDetailPage />);

    await waitFor(() => {
      const notesTextarea = screen.getByPlaceholderText(/notes/i);
      expect(notesTextarea).toHaveValue('Important client');
    });
  });

  it('handles 404 error', async () => {
    (global.fetch as jest.Mock).mockImplementation(() =>
      Promise.resolve({ ok: false, status: 404 })
    );

    render(<ContactDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/contact not found/i)).toBeInTheDocument();
    });
  });
});
```

#### Step 6.4.4: Hook Tests

**File:** `src/hooks/__tests__/useContacts.test.ts`

```typescript
/**
 * useContacts Hook Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useContacts } from '../useContacts';

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            range: vi.fn(() => Promise.resolve({ data: mockContacts, error: null })),
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: {}, error: null })),
      })),
    })),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } } })),
    },
  })),
}));

const mockContacts = [
  { id: '1', email: 'test@example.com', name: 'Test User', is_vip: false },
];

describe('useContacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches contacts on mount', async () => {
    const { result } = renderHook(() => useContacts());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.contacts).toHaveLength(1);
    });
  });

  it('calculates stats correctly', async () => {
    const { result } = renderHook(() => useContacts());

    await waitFor(() => {
      expect(result.current.stats.total).toBe(1);
    });
  });

  it('handles toggle VIP', async () => {
    const { result } = renderHook(() => useContacts());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.toggleVip('1');
    });

    // Verify optimistic update
    expect(result.current.contacts[0].is_vip).toBe(true);
  });
});
```

**File:** `src/hooks/__tests__/useExtractedDates.test.ts`

```typescript
/**
 * useExtractedDates Hook Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useExtractedDates } from '../useExtractedDates';

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: mockDates, error: null })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: {}, error: null })),
      })),
    })),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } } })),
    },
  })),
}));

const mockDates = [
  {
    id: '1',
    date_type: 'deadline',
    date: '2026-01-20',
    title: 'Test Deadline',
    is_acknowledged: false,
  },
];

describe('useExtractedDates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches dates on mount', async () => {
    const { result } = renderHook(() => useExtractedDates());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.dates).toHaveLength(1);
    });
  });

  it('groups dates by time period', async () => {
    const { result } = renderHook(() => useExtractedDates());

    await waitFor(() => {
      expect(result.current.groupedDates).toBeDefined();
    });
  });

  it('handles acknowledge action', async () => {
    const { result } = renderHook(() => useExtractedDates());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.acknowledge('1');
    });

    // Verify optimistic update
    expect(result.current.dates[0].is_acknowledged).toBe(true);
  });
});
```

### Test Directory Structure

```
src/
├── app/(auth)/
│   ├── contacts/
│   │   ├── __tests__/
│   │   │   └── page.test.tsx
│   │   └── [id]/
│   │       └── __tests__/
│   │           └── page.test.tsx
│   └── timeline/
│       └── __tests__/
│           └── page.test.tsx
└── hooks/
    └── __tests__/
        ├── useContacts.test.ts
        └── useExtractedDates.test.ts
```

### Acceptance Criteria
- [ ] All tests pass with `npm test`
- [ ] Coverage > 70% for new pages
- [ ] Coverage > 80% for hooks
- [ ] Tests cover happy path and error states
- [ ] Tests cover user interactions (clicks, typing)

### Estimated Changes
- 5 new test files
- ~800 lines of test code

---

## Implementation Order

### Phase 1: Foundation (P6.1)
1. Update Sidebar with Contacts and Timeline links
2. Verify navigation works

### Phase 2: Contact Detail (P6.2)
1. Create contact detail page
2. Add notes column migration
3. Update API schema
4. Test navigation from contacts list

### Phase 3: Calendar View (P6.3)
1. Create CalendarView component
2. Update Timeline page with toggle
3. Test view switching

### Phase 4: Testing (P6.4)
1. Create hook tests
2. Create page tests
3. Run full test suite

---

## File Summary

### Files to Create

| File | Purpose | Lines |
|------|---------|-------|
| `src/app/(auth)/contacts/[id]/page.tsx` | Contact detail page | ~400 |
| `src/app/(auth)/contacts/[id]/loading.tsx` | Loading skeleton | ~30 |
| `src/components/timeline/CalendarView.tsx` | Calendar component | ~300 |
| `supabase/migrations/014_contact_notes.sql` | Notes column | ~5 |
| `src/app/(auth)/contacts/__tests__/page.test.tsx` | Contacts tests | ~150 |
| `src/app/(auth)/contacts/[id]/__tests__/page.test.tsx` | Detail tests | ~100 |
| `src/app/(auth)/timeline/__tests__/page.test.tsx` | Timeline tests | ~150 |
| `src/hooks/__tests__/useContacts.test.ts` | Hook tests | ~100 |
| `src/hooks/__tests__/useExtractedDates.test.ts` | Hook tests | ~100 |

### Files to Modify

| File | Changes |
|------|---------|
| `src/components/layout/Sidebar.tsx` | Add nav items |
| `src/app/(auth)/timeline/page.tsx` | Add calendar toggle |
| `src/lib/api/schemas.ts` | Add notes field |

---

## Quick Start Commands

```bash
# After implementation, run these commands to verify:

# 1. Run the dev server
npm run dev

# 2. Run all tests
npm test

# 3. Run specific test files
npm test -- src/hooks/__tests__/useContacts.test.ts
npm test -- src/app/(auth)/contacts/__tests__/

# 4. Check TypeScript
npm run type-check

# 5. Run linter
npm run lint
```

---

## Risk Considerations

### Low Risk
- Sidebar changes (simple addition)
- Calendar view (isolated component)

### Medium Risk
- Contact detail page (new page with multiple data sources)
- Test setup (may need additional mocking)

### Mitigations
- Test each feature in isolation before integration
- Use optimistic updates for responsive UI
- Comprehensive error handling

---

## Notes for Implementation

1. **Sidebar Icons**: Use `BookUser` for Contacts (represents address book) and `CalendarDays` for Timeline (represents calendar with dates).

2. **Contact Detail Data**: The API already returns `recent_email_count` - use this for the "Last 30 Days" stat.

3. **Calendar Performance**: For large date sets, consider limiting the calendar to show only dates within ±3 months of current view.

4. **Test Mocking**: Use the same Supabase mock patterns established in existing tests (`hub-priority-service.test.ts`).

5. **Mobile Considerations**: Ensure calendar view is usable on mobile - consider a smaller cell height or week view option for small screens.
