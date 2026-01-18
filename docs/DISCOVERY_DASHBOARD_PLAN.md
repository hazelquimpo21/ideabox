# IdeaBox - Discovery Dashboard Implementation Plan

> **Purpose:** Design and implementation plan for the initial email batch analysis experience
> **Created:** January 2026
> **Status:** Planning

---

## Overview

When a user first connects their Gmail, we want to:
1. Fetch and analyze an initial batch of emails
2. Show them a **Discovery Dashboard** with insights (not just dump them in inbox)
3. Handle failures gracefully with partial success
4. Be smart about token usage

---

## User Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ONBOARDING FLOW                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. CONNECT GMAIL                                                           │
│     └─→ OAuth flow → gmail_accounts table updated                           │
│                                                                             │
│  2. ADD CLIENTS (optional)                                                  │
│     └─→ User adds known clients for better tagging                          │
│                                                                             │
│  3. FINISH SETUP (click button)                                             │
│     └─→ Triggers initial batch analysis                                     │
│         ┌────────────────────────────────────────────────────┐              │
│         │  INITIAL BATCH ANALYSIS                            │              │
│         │                                                    │              │
│         │  a) Fetch last 50 emails from Gmail               │              │
│         │  b) Pre-filter (skip spam, no-reply, etc.)        │              │
│         │  c) Run AI analysis on filtered emails            │              │
│         │  d) Build category summary                         │              │
│         │  e) Detect clients in emails                       │              │
│         │  f) Return results (including any failures)        │              │
│         └────────────────────────────────────────────────────┘              │
│                                                                             │
│  4. DISCOVERY DASHBOARD (NEW!)                                              │
│     └─→ Show insights, category cards, quick actions                        │
│     └─→ User explores, takes quick actions                                  │
│     └─→ Click "Go to Inbox" when ready                                      │
│                                                                             │
│  5. INBOX (normal app experience)                                           │
│     └─→ Hourly sync continues in background                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## When Does Initial Batch Analysis Happen?

### Trigger Point
**When:** User clicks "Finish Setup" on the final onboarding step (after connecting Gmail and optionally adding clients).

**Why here (not earlier):**
- We need Gmail connected first
- We want client list available for better tagging
- User has committed to the app (completed onboarding)

### NOT Triggered On:
- Every page load
- Gmail reconnection (only on first connect)
- Adding additional Gmail accounts (handled separately)

### Re-trigger Conditions:
- User explicitly clicks "Re-analyze" in settings
- User connects a NEW Gmail account (analyze that account's emails)

---

## Data Structures

### InitialSyncRequest
```typescript
// POST /api/onboarding/initial-sync
interface InitialSyncRequest {
  // Optional overrides (defaults in config)
  maxEmails?: number;        // Default: 50
  includeRead?: boolean;     // Default: true
}
```

### InitialSyncResponse
```typescript
interface InitialSyncResponse {
  success: boolean;

  // Summary stats
  stats: {
    totalFetched: number;        // How many we got from Gmail
    preFiltered: number;         // Skipped before AI (spam, no-reply)
    analyzed: number;            // Successfully AI-analyzed
    failed: number;              // AI analysis failed
    totalTokensUsed: number;     // For transparency
    estimatedCost: number;       // In USD
    processingTimeMs: number;
  };

  // Category breakdown (the core of Discovery Dashboard)
  categories: CategorySummary[];

  // Client detection results
  clientInsights: ClientInsight[];

  // Failed emails (for transparency)
  failures: AnalysisFailure[];

  // Quick action suggestions
  suggestedActions: SuggestedAction[];
}

interface CategorySummary {
  category: EmailCategory;
  count: number;
  unreadCount: number;

  // Sample content for the card
  topSenders: Array<{
    name: string;
    email: string;
    count: number;
  }>;
  sampleSubjects: string[];      // 2-3 recent subjects

  // Category-specific insight
  insight: string;               // "3 need response by Friday"

  // Urgency indicator (for action_required)
  urgentCount?: number;

  // For events
  upcomingEvent?: {
    title: string;
    date: string;
  };
}

interface ClientInsight {
  clientId: string | null;       // null if suggested new client
  clientName: string;
  isNewSuggestion: boolean;      // true if we're suggesting adding this client
  emailCount: number;
  actionRequiredCount: number;
  sampleSubject: string;
  relationshipSignal: 'positive' | 'neutral' | 'negative' | 'unknown';
}

interface AnalysisFailure {
  emailId: string;
  subject: string;
  sender: string;
  reason: string;                // "API timeout", "Content too long", etc.
  canRetry: boolean;
}

interface SuggestedAction {
  id: string;
  type: 'archive_category' | 'add_client' | 'view_urgent' | 'add_events';
  label: string;                 // "Archive 15 promotional emails"
  description: string;
  category?: EmailCategory;
  count?: number;
  priority: 'high' | 'medium' | 'low';
}

type EmailCategory =
  | 'action_required'
  | 'event'
  | 'newsletter'
  | 'promo'
  | 'admin'
  | 'personal'
  | 'noise';
```

---

## Implementation Checklist

### Phase 1: Backend - Enhanced Initial Sync

#### 1.1 Pre-filter Service
- [ ] Create `src/services/sync/email-prefilter.ts`
  - [ ] `shouldAnalyzeWithAI(email): boolean` - skip spam, no-reply, etc.
  - [ ] `quickCategorize(email): EmailCategory | null` - rule-based categorization
  - [ ] `isKnownPromoSender(email, userPatterns): boolean`
- [ ] Add pre-filter stats to sync response
- [ ] Write tests for pre-filter logic

#### 1.2 Enhanced Sync Response
- [ ] Update `src/services/sync/email-sync-service.ts`
  - [ ] Add `performInitialSync()` method (distinct from incremental)
  - [ ] Return `InitialSyncResponse` structure (not just success/fail)
  - [ ] Build category summaries during processing
  - [ ] Track and return failures with reasons
- [ ] Update `src/app/api/onboarding/initial-sync/route.ts`
  - [ ] Return rich response structure
  - [ ] Include processing stats

#### 1.3 Client Detection Enhancement
- [ ] Update `src/services/analyzers/client-tagger.ts`
  - [ ] Return `new_client_suggestion` when detecting unknown business emails
  - [ ] Include relationship signal in response
- [ ] Create `buildClientInsights()` helper to aggregate client data

#### 1.4 Suggested Actions Generator
- [ ] Create `src/services/sync/action-suggester.ts`
  - [ ] `generateSuggestedActions(categories, clients): SuggestedAction[]`
  - [ ] Logic for each action type:
    - Archive category (if promo/noise count > 5)
    - Add client (if new client suggestions exist)
    - View urgent (if action_required with urgency > 7)
    - Add events (if events detected)

---

### Phase 2: Frontend - Analysis Loading Screen

#### 2.1 Enhanced Loading Component
- [ ] Update `src/app/onboarding/components/InitialSync.tsx`
  - [ ] Real-time progress updates (SSE or polling)
  - [ ] Show discoveries as they happen:
    ```
    Analyzing emails... [=====     ] 25/50

    📬 Found so far:
    • 5 action items
    • 1 event detected
    • Client recognized: Acme Corp
    ```
  - [ ] Animated category counters
- [ ] Handle partial failure gracefully in UI
- [ ] Add "Skip for now" option (continue in background)

#### 2.2 Progress Tracking
- [ ] Create `src/hooks/useInitialSyncProgress.ts`
  - [ ] Poll `/api/onboarding/sync-status` every 1s
  - [ ] Return: progress %, current status, discoveries so far
- [ ] Update database to track sync progress
  - [ ] Add `sync_progress` column to `user_profiles` (or use separate table)

---

### Phase 3: Frontend - Discovery Dashboard

#### 3.1 Discovery Dashboard Page
- [ ] Create `src/app/(auth)/discover/page.tsx`
  - [ ] Receives sync results (from state or refetch)
  - [ ] Hero section: "Here's what we found in your last 50 emails"
  - [ ] Grid of category cards
  - [ ] Client insights section
  - [ ] Quick actions bar
  - [ ] "Go to Inbox" CTA

#### 3.2 Category Card Component
- [ ] Create `src/components/discover/CategoryCard.tsx`
  - [ ] Icon + category name + count
  - [ ] Unread badge
  - [ ] Top senders list
  - [ ] Sample subjects (truncated)
  - [ ] Category-specific insight
  - [ ] Click → goes to inbox filtered by category
- [ ] Create variants for each category (different colors, icons)

#### 3.3 Client Insights Component
- [ ] Create `src/components/discover/ClientInsights.tsx`
  - [ ] List detected clients with email counts
  - [ ] "Add as client" button for suggestions
  - [ ] Relationship signal indicator
  - [ ] Click → goes to client emails

#### 3.4 Quick Actions Bar
- [ ] Create `src/components/discover/QuickActions.tsx`
  - [ ] Render suggested actions as buttons
  - [ ] Handle action execution:
    - [ ] `archive_category` → bulk archive API call
    - [ ] `add_client` → open add client modal
    - [ ] `view_urgent` → navigate to filtered inbox
    - [ ] `add_events` → navigate to events page
  - [ ] Show success toast after action

#### 3.5 Failure Summary Component
- [ ] Create `src/components/discover/FailureSummary.tsx`
  - [ ] Collapsible section (hidden by default if < 3 failures)
  - [ ] List failed emails with reasons
  - [ ] "Retry failed" button (optional, uses tokens)
  - [ ] Reassuring copy: "These are saved but uncategorized"

---

### Phase 4: Navigation & State Management

#### 4.1 Onboarding Flow Update
- [ ] Update onboarding completion logic
  - [ ] After sync completes → redirect to `/discover` (not `/inbox`)
  - [ ] Store sync results in state (React Context or URL params)
- [ ] Add `initialSyncCompleted` flag to user profile

#### 4.2 Discovery Dashboard Access
- [ ] Only show `/discover` after initial sync
- [ ] After user leaves discover → they go to normal inbox
- [ ] Add "View Initial Analysis" link in settings (to revisit)

#### 4.3 Prevent Re-analysis
- [ ] Check `initialSyncCompleted` before allowing initial sync
- [ ] Show "Already completed" message if trying to re-run
- [ ] Provide "Re-analyze" option in settings (explicit action)

---

### Phase 5: Token Optimization

#### 5.1 Pre-filter Rules
- [ ] Implement in `email-prefilter.ts`:
  - [ ] Skip `SPAM` labeled emails
  - [ ] Skip `no-reply@`, `noreply@`, `mailer-daemon@`
  - [ ] Skip if sender domain in known promo list
  - [ ] Auto-categorize obvious patterns:
    - `receipt@`, `order@` → admin
    - `newsletter@`, `digest@` → newsletter
    - `promo@`, `deals@` → promo

#### 5.2 Sender Pattern Caching
- [ ] Create `src/services/sync/sender-patterns.ts`
  - [ ] After initial sync, build sender → category map
  - [ ] Store in `user_profiles.sender_patterns` (JSONB)
  - [ ] Use for future emails (skip AI if high-confidence pattern)

#### 5.3 Batch Similar Emails
- [ ] Group emails by sender domain before analysis
- [ ] If 5+ emails from same sender, analyze 1-2, apply pattern to rest
- [ ] Track which emails used pattern vs. full AI analysis

---

### Phase 6: Testing & Polish

#### 6.1 Unit Tests
- [ ] Pre-filter service tests
- [ ] Category summary builder tests
- [ ] Suggested actions generator tests
- [ ] Client insights builder tests

#### 6.2 Integration Tests
- [ ] Full initial sync flow (mock Gmail + OpenAI)
- [ ] Partial failure handling
- [ ] Discovery dashboard rendering with various data shapes

#### 6.3 Edge Cases
- [ ] User with 0 emails
- [ ] User with all spam
- [ ] 100% analysis failure
- [ ] Very slow API responses (timeout handling)

#### 6.4 Polish
- [ ] Loading animations
- [ ] Empty state designs
- [ ] Error message copy
- [ ] Mobile responsive layout for discover page

---

## File Structure (New Files)

```
src/
├── app/
│   ├── (auth)/
│   │   └── discover/
│   │       └── page.tsx                    # Discovery Dashboard page
│   └── api/
│       └── onboarding/
│           ├── initial-sync/
│           │   └── route.ts                # Enhanced (already exists, update)
│           └── sync-status/
│               └── route.ts                # Progress polling endpoint (NEW)
│
├── components/
│   └── discover/
│       ├── index.ts                        # Barrel export
│       ├── CategoryCard.tsx                # Category summary card
│       ├── CategoryCardGrid.tsx            # Grid layout for cards
│       ├── ClientInsights.tsx              # Client detection results
│       ├── QuickActions.tsx                # Suggested action buttons
│       ├── FailureSummary.tsx              # Failed analysis display
│       └── DiscoveryHero.tsx               # Hero section with stats
│
├── hooks/
│   └── useInitialSyncProgress.ts           # Progress tracking hook
│
├── services/
│   └── sync/
│       ├── email-prefilter.ts              # Pre-AI filtering logic
│       ├── action-suggester.ts             # Generate suggested actions
│       ├── sender-patterns.ts              # Sender → category cache
│       └── discovery-builder.ts            # Build discovery response
│
└── types/
    └── discovery.ts                        # Discovery-related types
```

---

## Detailed Sequence: What Happens When?

### Step-by-Step Timeline

```
TIME        EVENT                           WHAT HAPPENS
────────────────────────────────────────────────────────────────────
T+0s        User clicks "Finish Setup"
            │
            ├─→ Frontend: Show loading screen
            ├─→ Frontend: Start polling /sync-status
            └─→ Backend: POST /initial-sync triggered

T+1s        Backend: Fetch emails
            │
            ├─→ Gmail API: Fetch last 50 messages
            ├─→ Update progress: "Fetching emails... 0%"
            └─→ Save raw emails to database

T+5s        Backend: Pre-filter
            │
            ├─→ Filter out spam, no-reply (e.g., 5 removed)
            ├─→ Quick-categorize obvious ones (e.g., 8 auto-tagged)
            ├─→ Update progress: "Preparing analysis... 10%"
            └─→ 37 emails remain for AI analysis

T+6s        Backend: AI Analysis begins
            │
            ├─→ Process in batches of 10
            ├─→ Run 3 analyzers per email (parallel)
            ├─→ Update progress every batch: "Analyzing... 20%"
            └─→ Frontend: Show discoveries as they come

T+6-35s     Backend: Batch processing
            │
            ├─→ Batch 1: emails 1-10 analyzed
            │   └─→ Progress: 30%, discoveries: "3 action items"
            ├─→ Batch 2: emails 11-20 analyzed
            │   └─→ Progress: 50%, discoveries: "Event found!"
            ├─→ Batch 3: emails 21-30 analyzed
            │   └─→ Progress: 70%, discoveries: "Client: Acme"
            └─→ Batch 4: emails 31-37 analyzed
                └─→ Progress: 90%

T+36s       Backend: Build summary
            │
            ├─→ Aggregate category counts
            ├─→ Build category insights
            ├─→ Compile client insights
            ├─→ Generate suggested actions
            └─→ Update progress: "Finishing up... 95%"

T+37s       Backend: Return response
            │
            ├─→ Return InitialSyncResponse
            ├─→ Mark onboarding complete
            └─→ Update progress: "Complete! 100%"

T+38s       Frontend: Redirect
            │
            ├─→ Stop polling
            ├─→ Store results in state
            └─→ Navigate to /discover

T+38s+      User on Discovery Dashboard
            │
            ├─→ See category cards with insights
            ├─→ See client detection results
            ├─→ Take quick actions (archive, etc.)
            └─→ Click "Go to Inbox" when ready
```

---

## API Contracts

### POST /api/onboarding/initial-sync

**Request:**
```typescript
// Body (optional)
{
  maxEmails?: number,    // default: 50
  includeRead?: boolean  // default: true
}
```

**Response (200 OK):**
```typescript
{
  success: true,
  stats: {
    totalFetched: 50,
    preFiltered: 5,
    analyzed: 43,
    failed: 2,
    totalTokensUsed: 12500,
    estimatedCost: 0.019,
    processingTimeMs: 37000
  },
  categories: [
    {
      category: "action_required",
      count: 12,
      unreadCount: 8,
      topSenders: [
        { name: "Maria Chen", email: "maria@acme.com", count: 3 },
        { name: "Support", email: "support@stripe.com", count: 2 }
      ],
      sampleSubjects: [
        "Re: Q4 Project Timeline",
        "Quick question about the API"
      ],
      insight: "3 are urgent (deadline this week)",
      urgentCount: 3
    },
    // ... other categories
  ],
  clientInsights: [
    {
      clientId: "uuid-123",
      clientName: "Acme Corp",
      isNewSuggestion: false,
      emailCount: 5,
      actionRequiredCount: 2,
      sampleSubject: "Re: Q4 Project Timeline",
      relationshipSignal: "positive"
    },
    {
      clientId: null,
      clientName: "Globex Inc",
      isNewSuggestion: true,
      emailCount: 3,
      actionRequiredCount: 1,
      sampleSubject: "Partnership opportunity",
      relationshipSignal: "unknown"
    }
  ],
  failures: [
    {
      emailId: "uuid-456",
      subject: "Fwd: Fwd: Fwd: Long thread...",
      sender: "someone@example.com",
      reason: "Content exceeded maximum length",
      canRetry: false
    }
  ],
  suggestedActions: [
    {
      id: "action-1",
      type: "archive_category",
      label: "Archive 15 promotional emails",
      description: "These are marketing emails from stores",
      category: "promo",
      count: 15,
      priority: "medium"
    },
    {
      id: "action-2",
      type: "view_urgent",
      label: "Review 3 urgent items",
      description: "These have deadlines this week",
      priority: "high"
    }
  ]
}
```

**Response (500 Error - Complete Failure):**
```typescript
{
  success: false,
  error: "Gmail API rate limit exceeded",
  canRetry: true,
  retryAfterMs: 60000
}
```

### GET /api/onboarding/sync-status

**Response:**
```typescript
{
  status: "in_progress" | "completed" | "failed",
  progress: 65,  // 0-100
  currentStep: "Analyzing emails...",
  discoveries: {
    actionItems: 5,
    events: 1,
    clientsDetected: ["Acme Corp"]
  },
  // Only present when complete
  result?: InitialSyncResponse
}
```

---

## Configuration

```typescript
// src/config/initial-sync.ts
export const INITIAL_SYNC_CONFIG = {
  // Email fetching
  maxEmails: 50,
  includeRead: true,
  excludeLabels: ['SPAM', 'TRASH'],

  // Pre-filtering
  skipSenders: [
    /^no-?reply@/i,
    /^mailer-daemon@/i,
    /^postmaster@/i,
  ],
  autoCategorizeDomains: {
    'amazon.com': 'promo',
    'target.com': 'promo',
    // ... populated from user learning
  },

  // Processing
  batchSize: 10,
  maxRetries: 2,
  timeoutMs: 60000,

  // Progress updates
  progressUpdateIntervalMs: 1000,

  // Token optimization
  skipAIThreshold: 0.95,  // If pre-filter confidence > 95%, skip AI
  maxSimilarEmailsToAnalyze: 2,  // Per sender domain
};
```

---

## Success Metrics

After implementing, track:

1. **Completion Rate:** % of users who complete initial sync without abandoning
2. **Time to Value:** Seconds from "Finish Setup" to seeing Discovery Dashboard
3. **Quick Action Engagement:** % of users who take at least one suggested action
4. **Token Efficiency:** Tokens used per email (target: < 400 avg)
5. **Failure Rate:** % of emails that fail analysis (target: < 5%)
6. **Discovery to Inbox:** % of users who click through to inbox from discover

---

## Open Questions

1. **Should Discovery Dashboard be a separate page or a modal overlay on inbox?**
   - Separate page: Cleaner, dedicated experience
   - Modal: Faster to dismiss, inbox visible behind

2. **How long to keep Discovery Dashboard accessible?**
   - Just once after initial sync?
   - Always available in sidebar?
   - Available in settings?

3. **Should we offer "deep analysis" option (more emails, more tokens)?**
   - Default: 50 emails
   - Power user: "Analyze last 200 emails" (warning about cost/time)

4. **Re-analysis for additional Gmail accounts?**
   - When user adds second Gmail, analyze that account separately
   - Show mini-discover for just that account?

---

## Dependencies

- Existing: Gmail service, AI analyzers, email processor
- New: SSE or polling infrastructure for progress updates
- UI: New discover components (can use existing shadcn primitives)

---

## Estimated Effort

| Phase | Description | Effort |
|-------|-------------|--------|
| 1 | Backend - Enhanced Initial Sync | Medium |
| 2 | Frontend - Loading Screen | Small |
| 3 | Frontend - Discovery Dashboard | Medium |
| 4 | Navigation & State | Small |
| 5 | Token Optimization | Medium |
| 6 | Testing & Polish | Medium |

**Total: Medium-Large feature**

---

## Next Steps

1. Review this plan and provide feedback
2. Decide on open questions
3. Start with Phase 1 (backend) - this unblocks everything else
4. Build Discovery Dashboard components in parallel with backend work
