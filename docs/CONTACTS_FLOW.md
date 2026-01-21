# IdeaBox - Contacts Flow

## Overview

Contacts are central to IdeaBox's intelligence system. Every email is linked to a contact,
enabling features like VIP prioritization, relationship insights, and communication patterns.

This document explains:
1. How contacts are created and managed
2. How emails are linked to contacts
3. How Google Contacts import works
4. How VIP suggestions work during onboarding

---

## Contact Lifecycle

### Creation Sources

Contacts are created automatically from three sources:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Email Sync     │     │  Google Import  │     │  Manual Entry   │
│  (auto-created) │     │  (onboarding)   │     │  (future)       │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         ▼                       ▼                       ▼
    ┌─────────────────────────────────────────────────────────┐
    │                    contacts table                        │
    │  - id, user_id, email (unique per user)                 │
    │  - name, avatar_url, google_resource_name               │
    │  - email_count, sent_count, received_count              │
    │  - first_seen_at, last_seen_at                          │
    │  - is_vip, is_muted, relationship_type                  │
    │  - google_labels, is_google_starred                     │
    │  - company, job_title (AI-enriched)                     │
    └─────────────────────────────────────────────────────────┘
```

### Import Source Tracking

Each contact has an `import_source` field:

| Source | Description |
|--------|-------------|
| `email` | Auto-created when processing emails (most common) |
| `google` | Imported from Google People API |
| `manual` | User explicitly added (future feature) |

---

## Email → Contact Linking

### How It Works

Every email processed by IdeaBox is linked to a contact:

```
┌─────────────────────────────────────────────────────────────────┐
│                       Email Processing                          │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  EmailProcessor.process(email, context)                         │
│                                                                 │
│  1. Extract sender email & name from headers                    │
│  2. Call ContactService.upsertFromEmail()                       │
│  3. Contact created/updated with:                               │
│     - Increment email_count                                     │
│     - Update first_seen_at / last_seen_at                       │
│     - Store name if better than existing                        │
│  4. Contact ID returned for enrichment check                    │
│  5. AI analyzers run (categorization, action extraction, etc.)  │
│  6. ContactEnricher runs if contact needs enrichment            │
└─────────────────────────────────────────────────────────────────┘
```

### Contact Upsert Function

The `upsert_contact_from_email` database function (migration 012) handles atomic upsert:

```sql
-- Called for every email processed
SELECT upsert_contact_from_email(
  p_user_id := 'user-uuid',
  p_email := 'sender@example.com',
  p_name := 'John Doe',
  p_email_date := '2026-01-15T10:00:00Z',
  p_is_sent := false  -- received email
);
```

This function:
- Creates contact if it doesn't exist
- Increments `email_count` (and `received_count` or `sent_count`)
- Updates `last_seen_at` to email date
- Updates `first_seen_at` if earlier than existing
- Updates `name` only if we don't have one (preserves better names)

### Why Link Every Email?

Linking emails to contacts enables:

1. **VIP Prioritization**: Emails from VIP contacts appear at the top
2. **Contact Insights**: View all emails from a person in one place
3. **Communication Patterns**: Track response times, frequency
4. **AI Context**: Analyzers can use contact history for better categorization
5. **Smart Suggestions**: Suggest contacts as VIPs based on communication volume

---

## Google Contacts Import

### Why Import from Google?

Manual VIP entry during onboarding is tedious. Google Contacts provides:

| Feature | Value |
|---------|-------|
| Starred contacts | Excellent VIP candidates (user already marked them important) |
| Contact groups | Relationship hints (Work, Family, Clients) |
| Contact photos | Better UI with avatars |
| Full names | Often better than email header names |
| Phone numbers | For future features |

### Required OAuth Scope

```typescript
'https://www.googleapis.com/auth/contacts.readonly'
```

This is read-only access. IdeaBox never modifies user's Google Contacts.

### Import Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Onboarding - VIP Step                       │
└─────────────────────────────────────────────────────────────────┘
                               │
           User clicks "Import from Google"
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  POST /api/contacts/import-google                               │
│                                                                 │
│  1. Check if user has contacts.readonly scope                   │
│  2. If not: return 403, redirect to re-auth with new scope      │
│  3. If yes: fetch contacts via GooglePeopleService              │
│  4. For each contact with email:                                │
│     - Call upsert_google_contact() to merge with existing       │
│     - Store: avatar_url, google_resource_name, google_labels    │
│     - Mark is_google_starred if starred in Google               │
│  5. Update gmail_accounts.contacts_synced_at                    │
│  6. Return import stats                                         │
└─────────────────────────────────────────────────────────────────┘
```

### Merging with Email-Derived Contacts

When importing a Google contact that already exists from email:

```
Google Contact: john@example.com
  - name: "John Smith"
  - avatar: "https://google.photo/123"
  - labels: ["Work", "VIP"]
  - starred: true

Existing Contact (from email): john@example.com
  - name: "John" (from email header)
  - email_count: 47
  - first_seen_at: 2025-06-01

MERGED Result:
  - name: "John Smith" (Google's is better, but preserve if email had it first)
  - avatar_url: "https://google.photo/123" (NEW)
  - google_labels: ["Work", "VIP"] (NEW)
  - is_google_starred: true (NEW)
  - email_count: 47 (PRESERVED)
  - first_seen_at: 2025-06-01 (PRESERVED)
```

---

## VIP Suggestions

### During Onboarding

The VIP Contacts step shows smart suggestions:

```
┌─────────────────────────────────────────────────────────────────┐
│                  GET /api/contacts/vip-suggestions              │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  ContactService.getVipSuggestions(userId, limit)                │
│                                                                 │
│  Calls get_vip_suggestions() database function                  │
│                                                                 │
│  Priority order:                                                │
│  1. Google starred contacts (is_google_starred = true)          │
│  2. Contacts with relationship_type = 'client' or 'colleague'   │
│  3. High email count (> 20 emails)                              │
│  4. Recent activity (last 30 days)                              │
│  5. In important Google groups (VIP, Work, Clients labels)      │
└─────────────────────────────────────────────────────────────────┘
```

### Suggestion Reasons

Each suggestion includes a reason:

| Reason | Trigger |
|--------|---------|
| "Starred in Google Contacts" | `is_google_starred = true` |
| "Frequent communication (50 emails)" | `email_count >= 20` |
| "Recent communication" | `last_seen_at` in last 7 days |
| "Marked as client" | `relationship_type = 'client'` |
| "In VIP group in Google" | `'VIP' = ANY(google_labels)` |

### Marking VIPs

When user confirms VIP selections:

```
┌─────────────────────────────────────────────────────────────────┐
│                  POST /api/contacts/mark-vip                    │
│                  Body: { contactIds: [...] }                    │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. Update contacts.is_vip = true for selected                  │
│  2. Fetch email addresses for selected contacts                 │
│  3. Merge into user_context.vip_emails (for AI)                 │
│  4. Return count of contacts marked                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Contact Aliases (Future Enhancement)

For users with multiple Gmail accounts, the same person may appear with different emails:
- john@work.com (work account)
- john.doe@gmail.com (personal account)

The `contact_aliases` table links these:

```sql
-- Link an alias to a primary contact
SELECT link_contact_alias(
  'user-uuid',
  'primary-contact-uuid',
  'john.doe@gmail.com',
  'manual'  -- or 'google', 'auto'
);

-- Find contact by any email (checks aliases)
SELECT * FROM find_contact_by_email('user-uuid', 'john.doe@gmail.com');
-- Returns the primary contact even if queried by alias
```

---

## Database Schema

### contacts table

```sql
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  email TEXT NOT NULL,
  name TEXT,
  display_name TEXT,  -- User-set override

  -- Communication stats
  email_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  received_count INTEGER DEFAULT 0,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,

  -- User flags
  is_vip BOOLEAN DEFAULT FALSE,
  is_muted BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  relationship_type TEXT,  -- client, colleague, vendor, etc.

  -- Google-imported data (NEW Jan 2026)
  avatar_url TEXT,
  google_resource_name TEXT,  -- "people/c123456789"
  google_labels TEXT[],       -- ["Work", "VIP"]
  is_google_starred BOOLEAN DEFAULT FALSE,
  google_synced_at TIMESTAMPTZ,
  import_source TEXT DEFAULT 'email',

  -- AI-enriched data
  company TEXT,
  job_title TEXT,
  phone TEXT,
  linkedin_url TEXT,
  extraction_confidence DECIMAL(3,2),
  last_extracted_at TIMESTAMPTZ,

  -- Constraints
  UNIQUE(user_id, email)
);
```

### contact_aliases table (NEW Jan 2026)

```sql
CREATE TABLE contact_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  primary_contact_id UUID NOT NULL REFERENCES contacts(id),
  alias_email TEXT NOT NULL,
  created_via TEXT DEFAULT 'manual',  -- google, manual, auto
  confidence DECIMAL(3,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, alias_email)
);
```

---

## API Endpoints

### GET /api/contacts
List contacts with filters and sorting.

### GET /api/contacts/vip-suggestions
Get VIP suggestions for onboarding.

### POST /api/contacts/import-google
Import contacts from Google People API.

### POST /api/contacts/mark-vip
Mark selected contacts as VIPs.

### GET /api/contacts/[id]
Get a single contact with details.

### PATCH /api/contacts/[id]
Update contact (VIP status, relationship, mute).

---

## Service Layer

### ContactService

Central service for all contact operations:

```typescript
import { contactService } from '@/services/contacts';

// Email processing
const contactId = await contactService.upsertFromEmail({
  userId, email, name, emailDate, isSent
});

// Find contact (checks aliases)
const contact = await contactService.findByEmail(userId, email);

// Google import
const result = await contactService.importFromGoogle({
  userId, accessToken, accountId, maxContacts
});

// VIP operations
const suggestions = await contactService.getVipSuggestions(userId, 15);
const marked = await contactService.markAsVip(userId, contactIds);

// Alias management
await contactService.linkAlias(userId, primaryContactId, aliasEmail);
```

---

## Logging

All contact operations are logged for troubleshooting:

```typescript
// Email → Contact linking
logger.info('Linking email to contact', {
  userId: userId.substring(0, 8),
  senderEmail: normalizedEmail.substring(0, 30),
  operation: 'email_to_contact_link',
});

logger.info('Email successfully linked to contact', {
  contactId: contact.id.substring(0, 8),
  emailCount: contact.email_count,
  operation: 'email_contact_linked',
});

// Google import
logger.info('Google contacts import complete', {
  imported: result.imported,
  starred: result.starred,
  skipped: result.skipped,
});
```

---

## Troubleshooting

### Contact not created from email

Check logs for:
- `Skipping contact upsert: invalid sender email`
- `Contact upsert returned null`
- `Failed to link email to contact`

Common causes:
- Email address is invalid (no @)
- Database function `upsert_contact_from_email` not found (run migration 012)

### Google import fails

Check logs for:
- `Contacts scope not available`
- `Failed to import Google contact`

Solutions:
- User needs to re-authorize with contacts.readonly scope
- Check Google Cloud Console for People API quota

### VIP suggestions empty

Check:
- Are there any contacts? (Run email sync first)
- Are any contacts starred in Google? (Import from Google)
- Are there contacts with sufficient email count?

---

---

## Contacts Page Features (NEW Jan 2026)

### Page-Based Pagination

The contacts page now uses page-based pagination (not infinite scroll) for better shareability and UX:

```
┌─────────────────────────────────────────────────────────────────┐
│  GET /api/contacts?page=1&limit=50                              │
│                                                                 │
│  Returns:                                                       │
│  - contacts: array of contacts for current page                 │
│  - X-Total-Count header: total number of contacts               │
│  - Link header: pagination links (RFC 5988)                     │
│                                                                 │
│  URL State:                                                     │
│  - Page number stored in URL (?page=2)                          │
│  - Shareable and bookmarkable                                   │
│  - Browser back/forward navigation works                        │
└─────────────────────────────────────────────────────────────────┘
```

**Pagination Component** (`src/components/ui/pagination.tsx`):
- Page numbers with ellipsis for large sets
- Prev/Next navigation
- Optional info display ("Showing 1-50 of 234 contacts")
- Keyboard accessible

### CRM-Style Contact Detail Page

Clicking a contact card navigates to `/contacts/[id]` detail page (not inbox filter):

```
┌─────────────────────────────────────────────────────────────────┐
│  Contact Detail Page (/contacts/[id])                           │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Profile: Name, Email, Company, Job Title, Relationship  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Stats: Total Emails | Last 30 Days | Last Contact       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Email History (with Direction Tabs)                      │   │
│  │ [All] [Received] [Sent]                                  │   │
│  │                                                          │   │
│  │ • Email 1 - [Received] Subject...  Jan 15               │   │
│  │ • Email 2 - [Sent] Subject...      Jan 14               │   │
│  │                                                          │   │
│  │ < 1 2 3 ... 10 >  (pagination)                          │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Email Direction Filter**:
- `all`: Both sent and received emails with this contact
- `received`: Emails FROM the contact (they are sender)
- `sent`: Emails TO the contact (user sent to them)

### API: Email Direction Parameter

The emails API now supports contact-based filtering:

```
GET /api/emails?contactEmail=john@example.com&direction=all

Parameters:
- contactEmail: Filter emails involving this contact
- direction: 'all' | 'received' | 'sent'

Response includes `direction` field on each email:
{
  "id": "...",
  "subject": "...",
  "direction": "received"  // or "sent" or "unknown"
}
```

---

## Google Contacts Sync Progress (NEW Jan 2026)

### Sync Status Banner

A global progress banner shows during contacts import:

```
┌─────────────────────────────────────────────────────────────────┐
│ ████████████████░░░░ 75%                                    [X] │
│ 🔄 Importing contacts (375 of ~500) from work@gmail.com...      │
│    127 skipped (no email address)                               │
└─────────────────────────────────────────────────────────────────┘
```

**Features**:
- Sticky banner below navbar (visible across all pages)
- Real-time progress percentage and counts
- Current account indicator for multi-account syncs
- Dismissible (sync continues in background)
- Error state with retry button
- Success state with auto-dismiss

### Context Provider

Global sync state managed via React Context:

```typescript
import { useContactsSyncStatus } from '@/lib/contexts/sync-status-context';

function SyncButton() {
  const { isActive, startSync, status } = useContactsSyncStatus();

  return (
    <Button
      onClick={() => startSync('contacts')}
      disabled={isActive}
    >
      {isActive ? `Syncing ${status.progress}%` : 'Sync Contacts'}
    </Button>
  );
}
```

**Available Methods**:
- `startSync(type)` - Begin sync, show banner
- `updateProgress(data)` - Update counts/percentage
- `completeSync(result)` - Mark complete, show success
- `failSync(error)` - Mark failed, show error
- `dismiss()` - Hide banner (sync continues)
- `reset()` - Return to idle state

### Progress Tracking API

Sync progress stored in database for polling:

```
GET /api/contacts/sync-progress

Response:
{
  "status": "in_progress",
  "progress": 75,
  "imported": 375,
  "estimatedTotal": 500,
  "skipped": 127,
  "currentAccount": "work@gmail.com"
}
```

Progress stored in `user_profiles.sync_progress` JSONB field.

---

## Future Enhancements

1. **Contact Deduplication**: Auto-detect same person with different emails
2. **Contact Merge UI**: Let users manually merge contacts
3. **Contact Export**: Export contacts to CSV
4. ~~**Contact Timeline**: Show all interactions with a contact~~ ✅ DONE (email history on detail page)
5. **Contact Health**: Warn when important contacts go quiet
