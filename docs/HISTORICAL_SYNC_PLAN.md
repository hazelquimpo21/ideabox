# Historical Email Sync for CRM Contact Data

> **Status:** Planning
> **Created:** January 21, 2026
> **Purpose:** Populate contact communication history from older emails without AI analysis costs

## Problem Statement

Currently, IdeaBox syncs and AI-analyzes recent emails (50-100 by default). This means:
- Contact `email_count`, `sent_count`, `received_count` only reflect recent activity
- `first_seen_at` might not reflect the true start of a relationship
- Historical communication patterns are invisible
- CRM-style contact views lack depth

## Solution: Two-Tier Email Sync

### Tier 1: Full Analysis (Current Behavior)
- Recent emails (configurable, default 30-90 days)
- Full AI analysis (categorization, action extraction, events)
- Store body_text + body_html
- Cost: ~$0.0004 per email

### Tier 2: Metadata-Only Historical Sync (NEW)
- Older emails (6-12+ months back)
- **NO AI analysis** - zero OpenAI cost
- Store only metadata needed for CRM:
  - `gmail_id`, `thread_id`
  - `sender_email`, `sender_name`
  - `recipient_email`
  - `subject`, `date`
  - `snippet` (Gmail's ~200 char preview)
  - `gmail_labels`
- Update contact stats via existing `upsert_contact_from_email`
- Cost: ~$0 (Gmail API free within quotas)

---

## Implementation Plan

### Phase 1: Database Changes

#### 1.1 Add `sync_type` to emails table

```sql
-- Migration: Add sync_type column to distinguish full vs metadata-only emails
ALTER TABLE emails ADD COLUMN sync_type TEXT DEFAULT 'full';
-- Values: 'full' (AI analyzed), 'metadata' (historical, CRM only)

-- Index for filtering
CREATE INDEX idx_emails_sync_type ON emails(user_id, sync_type);

COMMENT ON COLUMN emails.sync_type IS
  'full = AI analyzed with body stored, metadata = historical CRM data only';
```

#### 1.2 Add historical sync tracking to gmail_accounts

```sql
-- Track historical sync progress per account
ALTER TABLE gmail_accounts
  ADD COLUMN historical_sync_status TEXT DEFAULT 'not_started',
  ADD COLUMN historical_sync_oldest_date TIMESTAMPTZ,
  ADD COLUMN historical_sync_email_count INTEGER DEFAULT 0,
  ADD COLUMN historical_sync_started_at TIMESTAMPTZ,
  ADD COLUMN historical_sync_completed_at TIMESTAMPTZ;

-- Values for historical_sync_status:
-- 'not_started', 'in_progress', 'completed', 'failed'
```

---

### Phase 2: Historical Sync Service

#### 2.1 Create HistoricalSyncService

**File:** `src/services/sync/historical-sync-service.ts`

```typescript
interface HistoricalSyncConfig {
  // How far back to sync (default: 12 months)
  monthsBack: number;

  // Batch size for Gmail API calls (max 500)
  batchSize: number;

  // Rate limiting - emails per minute
  rateLimitPerMinute: number;

  // Only sync emails from/to these domains (optional filter)
  domainFilter?: string[];
}

interface HistoricalSyncProgress {
  status: 'in_progress' | 'completed' | 'failed';
  emailsProcessed: number;
  emailsTotal: number;  // estimate
  contactsUpdated: number;
  oldestEmailDate: Date | null;
  currentPage: string | null;  // Gmail pagination token
  error?: string;
}

class HistoricalSyncService {
  /**
   * Start or resume historical sync for a Gmail account
   */
  async sync(
    accountId: string,
    config: Partial<HistoricalSyncConfig> = {},
    onProgress?: (progress: HistoricalSyncProgress) => void
  ): Promise<HistoricalSyncResult>;

  /**
   * Process a single email - metadata only, no AI
   */
  private async processEmailMetadata(
    message: gmail_v1.Schema$Message,
    context: SyncContext
  ): Promise<void>;

  /**
   * Update contact stats without AI analysis
   */
  private async updateContactFromEmail(
    email: EmailMetadata,
    context: SyncContext
  ): Promise<void>;
}
```

#### 2.2 Processing Flow

```
1. User triggers "Sync Contact History" from Contacts page
   │
2. Check gmail_accounts.historical_sync_status
   │  - If 'completed': show "Already synced" message
   │  - If 'in_progress': resume from last page token
   │  - If 'not_started' or 'failed': start fresh
   │
3. Build Gmail query for historical emails
   │  Query: "before:2025-12-01 -in:spam -in:trash"
   │  (before = start of recent sync period)
   │
4. Fetch emails in batches using messages.list
   │  - Get only message IDs first (fast)
   │  - Batch fetch metadata using messages.get(format='metadata')
   │
5. For each email batch:
   │  a. Parse email headers (from, to, subject, date)
   │  b. Insert into emails table with sync_type='metadata'
   │  c. Call upsert_contact_from_email for sender
   │  d. Update progress in gmail_accounts
   │  e. Save page token for resume capability
   │
6. On completion:
   │  - Set historical_sync_status = 'completed'
   │  - Store oldest_email_date for reference
   │  - Show summary to user
```

---

### Phase 3: API Endpoints

#### 3.1 Start Historical Sync

**File:** `src/app/api/contacts/historical-sync/route.ts`

```typescript
// POST /api/contacts/historical-sync
// Body: { accountId?: string, monthsBack?: number }
//
// If accountId not provided, syncs all connected accounts
// Returns: { syncId: string, estimatedEmails: number }
```

#### 3.2 Get Sync Progress

**File:** `src/app/api/contacts/historical-sync/progress/route.ts`

```typescript
// GET /api/contacts/historical-sync/progress
//
// Returns: {
//   status: 'idle' | 'in_progress' | 'completed',
//   accounts: [{
//     email: string,
//     status: string,
//     progress: number,
//     emailsProcessed: number,
//     contactsUpdated: number,
//   }]
// }
```

---

### Phase 4: UI Components

#### 4.1 Sync Contact History Button

**Location:** Contacts page header (next to existing "Sync Contacts" button)

```tsx
// New button in contacts page
<Button
  variant="outline"
  onClick={handleHistoricalSync}
  disabled={historicalSyncStatus === 'in_progress'}
>
  {historicalSyncStatus === 'in_progress'
    ? `Syncing History (${progress}%)`
    : historicalSyncStatus === 'completed'
    ? 'History Synced ✓'
    : 'Sync Contact History'
  }
</Button>
```

#### 4.2 Historical Sync Modal

Show before starting:
- Estimated emails to process
- Time estimate
- What data will be populated
- "This is free - no AI costs"

#### 4.3 Progress Integration

Reuse existing `SyncStatusBanner` component with historical sync support:
- "Syncing contact history (2,847 of ~5,000 emails)..."
- Shows contacts updated count
- Dismissible, sync continues in background

---

### Phase 5: Contact Display Enhancements

#### 5.1 Show Historical vs Recent Stats

On contact detail page, distinguish:
```
Communication Stats
├── Total Emails: 127 (since Mar 2024)
│   └── From historical sync: 89
│   └── AI analyzed: 38
├── Recent (last 90 days): 12 emails
└── Response patterns: [based on AI-analyzed only]
```

#### 5.2 "Load Full Email" for Historical

When user clicks a historical (metadata-only) email:
1. Fetch full body from Gmail API on-demand
2. Display in email detail view
3. Optionally: "Analyze this email" button to run AI

---

## Data Model

### Email Record (Metadata Only)

```typescript
interface MetadataOnlyEmail {
  // Required (same as full)
  id: string;
  user_id: string;
  gmail_account_id: string;
  gmail_id: string;
  thread_id: string;
  sender_email: string;
  date: Date;

  // Populated from metadata
  subject: string | null;
  sender_name: string | null;
  recipient_email: string | null;
  snippet: string | null;
  gmail_labels: string[];

  // Metadata sync specific
  sync_type: 'metadata';

  // NOT populated (null/default)
  body_text: null;
  body_html: null;
  category: null;         // No AI categorization
  analyzed_at: null;      // Never AI analyzed
  priority_score: 5;      // Default
  topics: null;
}
```

### Storage Estimates

| Emails | Metadata Only | With Bodies | Savings |
|--------|---------------|-------------|---------|
| 1,000  | ~2 MB         | ~30 MB      | 93%     |
| 5,000  | ~10 MB        | ~150 MB     | 93%     |
| 10,000 | ~20 MB        | ~300 MB     | 93%     |

---

## Gmail API Usage

### Query for Historical Emails

```typescript
// Get emails older than recent sync period
const query = `before:${recentSyncStartDate} -in:spam -in:trash -in:draft`;

// Use metadata format for efficiency
const response = await gmail.users.messages.get({
  userId: 'me',
  id: messageId,
  format: 'metadata',  // Much faster than 'full'
  metadataHeaders: ['From', 'To', 'Subject', 'Date'],
});
```

### Quota Consumption

- `messages.list`: 5 units per call (returns up to 500 IDs)
- `messages.get (metadata)`: 5 units per call
- Daily limit: 1,000,000,000 units

**For 10,000 emails:**
- list calls: ~20 × 5 = 100 units
- get calls: 10,000 × 5 = 50,000 units
- Total: ~50,100 units (0.005% of daily quota)

---

## Configuration

### Default Settings

```typescript
// src/config/historical-sync.ts
export const HISTORICAL_SYNC_CONFIG = {
  // How far back to sync by default
  defaultMonthsBack: 12,
  maxMonthsBack: 36,  // 3 years max

  // Batch sizes
  listBatchSize: 500,    // Gmail messages.list max
  getBatchSize: 100,     // Concurrent get requests

  // Rate limiting
  requestsPerMinute: 250,  // Stay well under Gmail limits

  // Progress saves
  saveProgressEvery: 100,  // Save page token every N emails

  // Filters
  excludeLabels: ['SPAM', 'TRASH', 'DRAFT'],
  excludeQuery: '-in:spam -in:trash -in:draft',
};
```

### User-Configurable Options

- Months back (3, 6, 12, 24, 36)
- Include/exclude sent mail
- Domain filter (e.g., "only sync @client.com emails")

---

## Error Handling

### Resumable Sync

If sync fails mid-way:
1. Last successful page token saved in `gmail_accounts`
2. User can "Resume" from where it stopped
3. Duplicate detection via `gmail_id` unique constraint

### Rate Limit Handling

```typescript
// Reuse existing exponential backoff from GmailService
if (error.code === 429) {
  const retryAfter = error.headers?.['retry-after'] || 60;
  await sleep(retryAfter * 1000);
  // Retry
}
```

### Partial Failure

- Log failed emails but continue
- Show summary: "Synced 4,892 of 5,000 emails. 108 failed."
- Failed emails can be retried individually

---

## Testing Plan

### Unit Tests
- [ ] `HistoricalSyncService.processEmailMetadata` correctly extracts headers
- [ ] Contact upsert updates counts correctly for historical emails
- [ ] Duplicate detection works (same gmail_id)
- [ ] Page token resume works correctly

### Integration Tests
- [ ] Full sync flow with mock Gmail API
- [ ] Progress tracking updates correctly
- [ ] UI shows accurate progress

### Manual Testing
- [ ] Sync 100 historical emails
- [ ] Verify contact stats updated
- [ ] Check storage usage
- [ ] Test resume after interruption

---

## Rollout Plan

### Phase 1: Backend (No UI)
1. Add database columns
2. Implement `HistoricalSyncService`
3. Create API endpoints
4. Test with dev account

### Phase 2: Admin/Power User Access
1. Add button (hidden behind feature flag)
2. Test with real user data
3. Monitor performance and costs

### Phase 3: General Availability
1. Remove feature flag
2. Add to onboarding as optional step
3. Document in help/FAQ

---

## Success Metrics

- Contact stats accurately reflect full communication history
- Zero increase in OpenAI costs
- Sync 10,000 emails in < 5 minutes
- Storage increase < 50MB per 10,000 emails
- User satisfaction: "Now I can see my full history with contacts"

---

## Future Enhancements

1. **Selective AI Analysis**: "Analyze important historical emails" - let user pick specific old emails for AI analysis
2. **Smart Historical**: Only sync emails from/to existing contacts (skip newsletters, promos)
3. **Incremental Historical**: As time passes, automatically promote "metadata" to "full" for recent period
4. **Export**: Export contact communication history to CSV
