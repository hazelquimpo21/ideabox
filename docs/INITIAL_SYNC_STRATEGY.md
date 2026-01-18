# IdeaBox - Initial Sync Strategy

> **Status:** ✅ IMPLEMENTED
> **See Also:** `docs/DISCOVERY_DASHBOARD_PLAN.md` for detailed implementation plan

## First-Run User Experience

When a user first connects their Gmail account, they should see immediate value. Don't make them wait hours for the next scheduled sync - give them something to explore right away.

## Implementation Summary

The initial sync system has been fully implemented with the following features:

### Token Optimization (20-30% savings)
- **Pre-filtering**: Skip no-reply, notification emails before AI
- **Auto-categorization**: Domain patterns (linkedin.com → newsletter)
- **Subject patterns**: "[ACTION]" → action_required automatically
- **Sender patterns**: Learn and reuse categorization from similar senders

### Partial Success Handling
- Continue processing even if some emails fail
- Track and display failures separately
- Allow retry from Discovery Dashboard

### Discovery Dashboard
After initial sync completes, users see a rich dashboard showing:
- Category cards with counts and descriptions
- Detected/suggested clients
- Quick action buttons
- Failed analysis summary (if any)

## Onboarding Flow with Initial Sync

### Step-by-Step Flow (IMPLEMENTED)

```
1. User completes OAuth → Gmail connected ✓
2. User adds clients (optional) ✓
3. User configures sync (email count, include read) ✓  ← NEW STEP
4. User clicks "Finish Setup" ✓
5. → IMMEDIATELY trigger initial sync
6. Show loading screen with real-time progress
7. Pre-filter emails (skip noise, auto-categorize)
8. Run AI analysis on remaining emails
9. Build Discovery Dashboard response
10. Redirect to Discovery Dashboard ← NOT inbox!
11. User explores categorized emails
```

### Loading Screen Design (IMPLEMENTED)

The loading screen is now built into `src/app/onboarding/page.tsx`:

```tsx
// Sync in progress UI (from src/app/onboarding/page.tsx)
if (isSyncing) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardContent className="pt-6">
          {/* Icon and Title */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <span className="text-3xl animate-pulse">✨</span>
            </div>
            <h2 className="text-2xl font-bold">Analyzing Your Emails</h2>
            <p className="text-muted-foreground mt-2">{syncStep}</p>
          </div>

          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex justify-between text-sm text-muted-foreground mb-2">
              <span>Progress</span>
              <span>{syncProgress}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${syncProgress}%` }}
              />
            </div>
          </div>

          {/* Real-time Discoveries */}
          {(discoveries.actionItems > 0 || discoveries.events > 0) && (
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium">Found so far:</p>
              <div className="flex flex-wrap gap-2">
                {discoveries.actionItems > 0 && (
                  <Badge variant="secondary">
                    {discoveries.actionItems} action items
                  </Badge>
                )}
                {discoveries.events > 0 && (
                  <Badge variant="secondary">
                    {discoveries.events} events
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

## Initial Sync Implementation (IMPLEMENTED)

### API Routes

**POST /api/onboarding/initial-sync** (`src/app/api/onboarding/initial-sync/route.ts`)
- Triggers initial email batch analysis
- Returns `InitialSyncResponse` with categories, clients, failures, suggested actions

**GET /api/onboarding/sync-status** (`src/app/api/onboarding/sync-status/route.ts`)
- Returns real-time progress for polling
- Includes discoveries found so far

### Sync Services Architecture

```
src/services/sync/
├── initial-sync-orchestrator.ts  ← Main coordinator
├── email-prefilter.ts            ← Token optimization
├── sender-patterns.ts            ← Pattern learning
├── action-suggester.ts           ← Quick action generation
├── discovery-builder.ts          ← Response building
└── index.ts                      ← Barrel export
```

### InitialSyncOrchestrator Flow

```typescript
// From src/services/sync/initial-sync-orchestrator.ts
class InitialSyncOrchestrator {
  async execute(): Promise<InitialSyncResponse> {
    // 1. Update progress: "Fetching emails..."
    await this.updateProgress(10, 'Fetching emails from Gmail...');

    // 2. Fetch emails from database (already synced)
    const emails = await this.fetchEmailsToAnalyze();

    // 3. Pre-filter emails (saves 20-30% tokens)
    const prefilterResults = this.prefilter.filterBatch(emails);

    // 4. Auto-categorize what we can
    for (const result of prefilterResults) {
      if (result.autoCategoryReason) {
        await this.updateEmailCategory(result.emailId, result.autoCategory!);
      }
    }

    // 5. Run AI analysis on remaining emails
    const needsAI = prefilterResults.filter(r => r.needsAI);
    for (const batch of batches) {
      await this.processBatch(batch);
      await this.updateProgress(progress, `Analyzing emails (${i}/${total})...`);
    }

    // 6. Build and return Discovery response
    const discovery = await this.discoveryBuilder.build(this.userId);
    return discovery;
  }
}

## Progress Tracking (IMPLEMENTED)

We chose **Option 3: Database + Client Polling** for simplicity and reliability.

### Hook: useInitialSyncProgress

```typescript
// From src/hooks/useInitialSyncProgress.ts
export function useInitialSyncProgress(options: UseInitialSyncProgressOptions) {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [discoveries, setDiscoveries] = useState({
    actionItems: 0,
    events: 0,
    clientsDetected: [],
  });

  const pollProgress = useCallback(async () => {
    const response = await fetch('/api/onboarding/sync-status');
    const data = await response.json();

    setStatus(data.status);
    setProgress(data.progress);
    setCurrentStep(data.currentStep);
    setDiscoveries(data.discoveries);

    if (data.status === 'completed') {
      stopPolling();
      options.onComplete?.(data.result);
    }
  }, []);

  // Polls every 1 second when active
  const startPolling = () => { /* ... */ };
  const stopPolling = () => { /* ... */ };

  return { status, progress, currentStep, discoveries, startPolling, stopPolling };
}
```

### Database Schema

Progress is stored in `user_profiles.sync_progress` as JSONB:

```typescript
interface StoredSyncProgress {
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  currentStep: string;
  discoveries: {
    actionItems: number;
    events: number;
    clientsDetected: string[];
  };
  result?: InitialSyncResponse;
  error?: string;
}
```

## Configuration (IMPLEMENTED)

### Config File: `src/config/initial-sync.ts`

```typescript
export const INITIAL_SYNC_CONFIG = {
  // Number of emails to fetch on first sync
  maxEmails: 50,

  // Include read emails (true = better demo)
  includeRead: true,

  // Batch size for AI processing
  batchSize: 5,

  // Poll interval in milliseconds
  pollIntervalMs: 1000,

  // Maximum sync duration before timeout
  timeoutMs: 120_000,  // 2 minutes
};

// Skip these sender patterns (no AI needed)
export const SKIP_SENDER_PATTERNS = [
  /no-?reply@/i,
  /noreply@/i,
  /notifications?@/i,
  /mailer-daemon/i,
  /postmaster@/i,
  /@bounce\./i,
];

// Auto-categorize by domain
export const AUTO_CATEGORIZE_DOMAINS: Record<string, EmailCategory> = {
  'linkedin.com': 'newsletter',
  'twitter.com': 'newsletter',
  'facebook.com': 'newsletter',
  'github.com': 'admin',
  'stripe.com': 'admin',
  'aws.amazon.com': 'admin',
};

// Auto-categorize by subject prefix
export const AUTO_CATEGORIZE_PREFIXES: Record<string, EmailCategory> = {
  '[ACTION]': 'action_required',
  '[URGENT]': 'action_required',
  'Re:': null,  // Doesn't override
  'Fwd:': null,
};
```

### User Configuration (SyncConfigStep)

Users can configure initial sync in the onboarding wizard:

```tsx
// From src/app/onboarding/components/SyncConfigStep.tsx
<div className="space-y-6">
  <div>
    <Label>How many recent emails should we analyze?</Label>
    <RadioGroup value={emailCount} onValueChange={setEmailCount}>
      <RadioGroupItem value="25">Quick preview (25 emails)</RadioGroupItem>
      <RadioGroupItem value="50">Recommended (50 emails)</RadioGroupItem>
      <RadioGroupItem value="100">Comprehensive (100 emails)</RadioGroupItem>
    </RadioGroup>
  </div>

  <div className="flex items-center space-x-2">
    <Switch checked={includeRead} onCheckedChange={setIncludeRead} />
    <Label>Include emails I've already read</Label>
  </div>
</div>
```

## Error Handling (IMPLEMENTED)

### Partial Success Pattern

The sync continues even if some emails fail. Failures are tracked and displayed:

```typescript
// From src/services/sync/initial-sync-orchestrator.ts
for (const email of batch) {
  try {
    await this.analyzeEmail(email);
    successCount++;
  } catch (error) {
    // Log failure but continue processing
    this.failures.push({
      emailId: email.id,
      subject: email.subject,
      sender: email.from_email,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}
```

### Error UI (onboarding/page.tsx)

```tsx
if (syncError) {
  return (
    <Card className="w-full max-w-lg">
      <CardContent className="pt-6">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
            <span className="text-3xl">😕</span>
          </div>
          <h2 className="text-2xl font-bold">Analysis Failed</h2>
          <p className="text-muted-foreground mt-2">{syncError}</p>
        </div>

        <div className="flex gap-3 justify-center">
          <Button onClick={handleRetrySync}>Try Again</Button>
          <Button variant="outline" onClick={handleSkipSync}>
            Skip for Now
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-4">
          You can always run the analysis later from Settings
        </p>
      </CardContent>
    </Card>
  );
}
```

### FailureSummary Component

After successful sync with some failures:

```tsx
// From src/components/discover/FailureSummary.tsx
<Collapsible>
  <CollapsibleTrigger className="flex items-center gap-2">
    <AlertTriangle className="w-4 h-4 text-amber-500" />
    <span>{failures.length} emails couldn't be analyzed</span>
    <ChevronDown />
  </CollapsibleTrigger>
  <CollapsibleContent>
    {failures.map(failure => (
      <div key={failure.emailId} className="p-3 border-b">
        <p className="font-medium">{failure.subject}</p>
        <p className="text-sm text-muted-foreground">{failure.sender}</p>
        <p className="text-sm text-red-600">{failure.error}</p>
      </div>
    ))}
  </CollapsibleContent>
</Collapsible>
```

## Background Sync After Initial

After initial sync completes, schedule regular syncs:

```typescript
// After successful initial sync
await scheduleRegularSync(user.id);

// services/jobs/schedule-sync.ts
export async function scheduleRegularSync(userId: string) {
  // Set up hourly sync for this user's accounts
  await supabase
    .from('gmail_accounts')
    .update({ sync_enabled: true })
    .eq('user_id', userId);
  
  // Next sync will happen in next cron job run
  logger.info('Regular sync scheduled', { userId });
}
```

## User Communication

### Setting Expectations

Show users what's happening:

```tsx
<div className="sync-explainer">
  <h3>What's happening?</h3>
  <ul>
    <li>✓ Fetching your last 50 emails</li>
    <li>✓ AI is categorizing each email</li>
    <li>✓ Extracting action items</li>
    <li>✓ Identifying client correspondence</li>
  </ul>
  
  <p className="note">
    This is a one-time setup. After this, IdeaBox will 
    sync new emails automatically every hour.
  </p>
</div>
```

## Performance Considerations

### Time Estimates

```typescript
// Realistic timing for 50 emails:
const timings = {
  gmailFetch: 5_000,      // 5 seconds to fetch from Gmail
  aiAnalysis: 30_000,     // 30 seconds for AI analysis (50 emails × 600ms each)
  saveToDb: 2_000,        // 2 seconds to save results
  total: 37_000,          // ~37 seconds total
};

// Show estimated time to user
<p>Estimated time: ~1 minute</p>
```

### Optimization Tips

```typescript
// 1. Process in smaller batches
const BATCH_SIZE = 10;  // Process 10 at a time

// 2. Use Promise.all for parallel processing
await Promise.all(
  batch.map(email => analyzer.analyze(email))
);

// 3. Don't block UI - run in background
// Start sync in background job, redirect immediately
startBackgroundSync(userId);
router.push('/inbox?syncing=true');

// Show banner: "We're analyzing your emails in the background..."
```

## Success Metrics

Track initial sync performance:

```sql
-- Add to user_profiles
ALTER TABLE user_profiles 
  ADD COLUMN initial_sync_duration_ms INTEGER,
  ADD COLUMN initial_sync_email_count INTEGER,
  ADD COLUMN initial_sync_completed_at TIMESTAMPTZ;
```

```typescript
// Track in sync service
const startTime = Date.now();

// ... perform sync ...

await supabase
  .from('user_profiles')
  .update({
    initial_sync_duration_ms: Date.now() - startTime,
    initial_sync_email_count: emails.length,
    initial_sync_completed_at: new Date().toISOString(),
  })
  .eq('id', userId);
```

## Testing the Initial Sync

### Local Development

```typescript
// Test with a small number first
const TEST_INITIAL_SYNC_CONFIG = {
  maxResults: 10,  // Just 10 emails for testing
  includeRead: true,
};
```

### Mock Data for Demo

```typescript
// If user has very few emails, show demo data
if (emails.length < 5) {
  const demoEmails = generateDemoEmails();
  await saveDemoEmails(demoEmails, userId);
  
  // Mark as demo
  await supabase
    .from('user_profiles')
    .update({ using_demo_data: true })
    .eq('id', userId);
}
```

## Updated Onboarding Flow Diagram (IMPLEMENTED)

```
┌────────────────────────────────────────────────────────┐
│ 1. User connects Gmail                                 │
│    ↓                                                   │
│ 2. User adds clients (optional)                        │
│    ↓                                                   │
│ 3. User configures sync (email count, include read)    │  ← NEW STEP!
│    ↓                                                   │
│ 4. User clicks "Finish Setup"                          │
│    ↓                                                   │
│ 5. Loading screen with real-time progress              │
│    ↓  (shows progress: 0%→100%)                        │
│ 6. Backend: Pre-filter emails (skip noise)             │  ← TOKEN SAVER!
│    ↓                                                   │
│ 7. Backend: Auto-categorize by domain/pattern          │  ← TOKEN SAVER!
│    ↓                                                   │
│ 8. Backend: AI analyzes remaining emails               │
│    ↓  (real-time discoveries shown)                    │
│ 9. Build Discovery Dashboard response                  │
│    ↓                                                   │
│ 10. Redirect to Discovery Dashboard                    │  ← NOT inbox!
│    ↓                                                   │
│ 11. User sees category cards, client insights!         │  🎉
│    ↓                                                   │
│ 12. User clicks "Go to Inbox" to continue              │
│    ↓                                                   │
│ 13. Background: Schedule hourly sync                   │
└────────────────────────────────────────────────────────┘
```

## Discovery Dashboard

After initial sync, users land on the Discovery Dashboard (`/discover`) which shows:

1. **Hero Section** - Welcome message with stats (emails analyzed, action items found)
2. **Category Cards** - Grid showing each category with count and top emails
3. **Client Insights** - Detected and suggested clients to add
4. **Quick Actions** - Suggested next steps (archive newsletters, view urgent, etc.)
5. **Failure Summary** - Collapsible list of any failed analyses

This is a much better first impression than just dumping users into an inbox.

## Key Takeaways

**Don't make users wait!** Fetch and analyze a reasonable number of recent emails (50-100) during onboarding so they can:
- See the system in action immediately
- Test categorization accuracy
- Find action items from real emails
- Understand the value before committing

**Save tokens intelligently!** Pre-filter and auto-categorize to reduce AI calls by 20-30%:
- Skip no-reply, notification emails
- Auto-categorize by domain (linkedin.com → newsletter)
- Learn sender patterns for future emails

**Handle failures gracefully!** Partial success is better than complete failure:
- Continue processing even when some emails fail
- Track and display failures separately
- Allow retry from Discovery Dashboard

This dramatically improves conversion and user satisfaction compared to "check back in an hour."

## Related Files

| File | Purpose |
|------|---------|
| `src/types/discovery.ts` | Type definitions |
| `src/config/initial-sync.ts` | Configuration |
| `src/services/sync/*.ts` | Sync services |
| `src/hooks/useInitialSyncProgress.ts` | Progress hook |
| `src/components/discover/*.tsx` | Dashboard components |
| `src/app/(auth)/discover/page.tsx` | Dashboard page |
| `src/app/onboarding/page.tsx` | Onboarding with sync |
| `docs/DISCOVERY_DASHBOARD_PLAN.md` | Full implementation plan |
