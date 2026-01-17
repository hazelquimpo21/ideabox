# IdeaBox - Initial Sync Strategy

## First-Run User Experience

When a user first connects their Gmail account, they should see immediate value. Don't make them wait hours for the next scheduled sync - give them something to explore right away.

## Onboarding Flow with Initial Sync

### Step-by-Step Flow

```
1. User completes OAuth → Gmail connected ✓
2. User adds clients (optional) ✓
3. User clicks "Finish Setup" ✓
4. → IMMEDIATELY trigger initial sync
5. Show loading screen: "Analyzing your recent emails..."
6. Fetch last 50 emails from Gmail
7. Run AI analysis on all 50 emails
8. Redirect to inbox with results ready
```

### Loading Screen Design

```tsx
// app/onboarding/components/InitialSync.tsx
export function InitialSyncScreen() {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Connecting to Gmail...');
  
  return (
    <div className="initial-sync">
      <Sparkles className="animate-pulse" size={64} />
      
      <h2>Setting up your inbox...</h2>
      <p className="status">{status}</p>
      
      <Progress value={progress} max={100} />
      
      <div className="steps">
        <SyncStep 
          completed={progress > 25}
          label="Fetching recent emails"
        />
        <SyncStep 
          completed={progress > 50}
          label="Analyzing with AI"
        />
        <SyncStep 
          completed={progress > 75}
          label="Creating action items"
        />
        <SyncStep 
          completed={progress > 95}
          label="Ready!"
        />
      </div>
      
      <p className="note">This usually takes 30-60 seconds</p>
    </div>
  );
}
```

## Initial Sync Implementation

### API Route

```typescript
// app/api/onboarding/initial-sync/route.ts
import { emailSyncService } from '@/services/email-sync-service';
import { emailProcessor } from '@/services/processors/email-processor';

export async function POST(request: Request) {
  const logger = createLogger('InitialSync');
  
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  logger.info('Starting initial sync for new user', { userId: user.id });
  
  try {
    // Get user's Gmail accounts
    const { data: gmailAccounts } = await supabase
      .from('gmail_accounts')
      .select('*')
      .eq('user_id', user.id);
    
    if (!gmailAccounts || gmailAccounts.length === 0) {
      throw new Error('No Gmail accounts connected');
    }
    
    let totalEmailsFetched = 0;
    let totalEmailsAnalyzed = 0;
    
    // For each connected Gmail account
    for (const account of gmailAccounts) {
      logger.info('Fetching initial emails', { 
        accountId: account.id,
        email: account.email,
      });
      
      // Fetch last 50 emails (or configurable amount)
      const emails = await emailSyncService.fetchInitialEmails(account, {
        maxResults: 50,
        includeRead: true,  // Include read emails for initial setup
      });
      
      totalEmailsFetched += emails.length;
      
      logger.info('Processing initial emails', {
        accountId: account.id,
        emailCount: emails.length,
      });
      
      // Process in batches with progress updates
      const batchSize = 10;
      for (let i = 0; i < emails.length; i += batchSize) {
        const batch = emails.slice(i, i + batchSize);
        
        // Process batch
        await emailProcessor.processBatch(batch, user.id);
        
        totalEmailsAnalyzed += batch.length;
        
        // Calculate progress
        const progress = Math.round(
          (totalEmailsAnalyzed / totalEmailsFetched) * 100
        );
        
        // Send progress update (could use SSE or polling)
        await updateSyncProgress(user.id, {
          progress,
          status: `Analyzed ${totalEmailsAnalyzed} of ${totalEmailsFetched} emails`,
        });
        
        logger.debug('Batch processed', {
          progress,
          analyzed: totalEmailsAnalyzed,
          total: totalEmailsFetched,
        });
      }
    }
    
    // Mark onboarding as complete
    await supabase
      .from('user_profiles')
      .update({ 
        onboarding_completed: true,
        initial_sync_completed_at: new Date().toISOString(),
      })
      .eq('id', user.id);
    
    logger.info('Initial sync complete', {
      userId: user.id,
      emailsFetched: totalEmailsFetched,
      emailsAnalyzed: totalEmailsAnalyzed,
    });
    
    return NextResponse.json({
      success: true,
      emailsFetched: totalEmailsFetched,
      emailsAnalyzed: totalEmailsAnalyzed,
    });
    
  } catch (error) {
    logger.error('Initial sync failed', {
      userId: user.id,
      error: error.message,
    });
    
    return NextResponse.json(
      { error: 'Initial sync failed', details: error.message },
      { status: 500 }
    );
  }
}
```

### Service Layer Updates

```typescript
// services/email-sync-service.ts
export class EmailSyncService {
  private gmailSync: GmailSync;
  private logger = createLogger('EmailSyncService');
  
  /**
   * Fetch initial emails for new user onboarding
   * Different from regular sync - fetches recent emails regardless of history ID
   */
  async fetchInitialEmails(
    account: GmailAccount,
    options: {
      maxResults?: number;
      includeRead?: boolean;
    } = {}
  ): Promise<Email[]> {
    const maxResults = options.maxResults || 50;
    const includeRead = options.includeRead ?? false;
    
    this.logger.info('Fetching initial emails for onboarding', {
      accountId: account.id,
      maxResults,
      includeRead,
    });
    
    try {
      // Fetch recent emails from inbox
      const query: string[] = ['in:inbox'];
      
      if (!includeRead) {
        query.push('is:unread');
      }
      
      const response = await this.gmailSync.fetchMessages({
        userId: 'me',
        maxResults,
        q: query.join(' '),
        labelIds: ['INBOX'],
      });
      
      const messageIds = response.messages?.map(m => m.id!) || [];
      
      this.logger.info('Found messages for initial sync', {
        accountId: account.id,
        count: messageIds.length,
      });
      
      // Fetch full message details
      const emails = await this.gmailSync.fetchMessageDetails(
        messageIds,
        account
      );
      
      // Save to database
      const savedEmails = await this.saveEmails(emails, account.user_id);
      
      // Update account's last_history_id so future syncs are incremental
      if (response.historyId) {
        await supabase
          .from('gmail_accounts')
          .update({ 
            last_history_id: response.historyId,
            last_sync_at: new Date().toISOString(),
          })
          .eq('id', account.id);
      }
      
      return savedEmails;
      
    } catch (error) {
      this.logger.error('Failed to fetch initial emails', {
        accountId: account.id,
        error: error.message,
      });
      throw error;
    }
  }
}
```

## Progress Tracking Options

### Option 1: Server-Sent Events (SSE)

Best for real-time updates:

```typescript
// app/api/onboarding/sync-progress/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();
  
  // Poll for progress updates
  const interval = setInterval(async () => {
    const progress = await getSyncProgress(userId);
    
    if (progress) {
      const data = `data: ${JSON.stringify(progress)}\n\n`;
      await writer.write(encoder.encode(data));
      
      // Stop when complete
      if (progress.progress >= 100) {
        clearInterval(interval);
        await writer.close();
      }
    }
  }, 500);
  
  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

### Option 2: Polling (Simpler)

```typescript
// Client-side polling
const [progress, setProgress] = useState(0);

useEffect(() => {
  const pollProgress = async () => {
    const response = await fetch('/api/onboarding/sync-status');
    const data = await response.json();
    
    setProgress(data.progress);
    setStatus(data.status);
    
    if (data.progress >= 100) {
      // Redirect to inbox
      router.push('/inbox');
    }
  };
  
  const interval = setInterval(pollProgress, 1000);
  
  return () => clearInterval(interval);
}, []);
```

### Option 3: Database + Client Polling

Store progress in database, client polls periodically:

```sql
-- Add to user_profiles table
ALTER TABLE user_profiles ADD COLUMN sync_progress INTEGER DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN sync_status TEXT;
```

## Configuration

### How Many Emails to Fetch?

```typescript
// config/sync.ts
export const INITIAL_SYNC_CONFIG = {
  // Number of emails to fetch on first sync
  maxResults: 50,  // Recommended: 50-100
  
  // Include read emails (true = better demo, false = focus on unread)
  includeRead: true,
  
  // Time limit for initial sync (prevent timeout)
  timeoutMs: 60_000,  // 1 minute max
  
  // Batch size for processing
  batchSize: 10,
  
  // Labels to include (empty = all from inbox)
  includeLabels: ['INBOX'],
  
  // Labels to exclude
  excludeLabels: ['SPAM', 'TRASH'],
};
```

### Adjustable by User (Advanced)

```tsx
// Optional: Let power users choose
<OnboardingStep step={2}>
  <h2>How many recent emails should we analyze?</h2>
  
  <RadioGroup value={emailCount} onChange={setEmailCount}>
    <Radio value={25}>
      Just the last 25 (quick preview)
    </Radio>
    <Radio value={50}>
      Last 50 emails (recommended)
    </Radio>
    <Radio value={100}>
      Last 100 emails (comprehensive)
    </Radio>
  </RadioGroup>
  
  <Checkbox checked={includeRead} onChange={setIncludeRead}>
    Include emails I've already read
  </Checkbox>
</OnboardingStep>
```

## Error Handling

### Graceful Degradation

```typescript
try {
  await performInitialSync(account);
} catch (error) {
  logger.error('Initial sync failed', { error });
  
  // Show partial results if any
  if (partialEmails.length > 0) {
    await savePartialResults(partialEmails);
    
    return {
      success: false,
      partial: true,
      emailsAnalyzed: partialEmails.length,
      error: 'Sync incomplete - showing partial results',
    };
  }
  
  // Complete failure - offer retry
  return {
    success: false,
    error: error.message,
    retry: true,
  };
}
```

### Retry UI

```tsx
{syncFailed && (
  <div className="sync-failed">
    <AlertCircle size={48} className="text-red-500" />
    <h3>Initial sync failed</h3>
    <p>{error.message}</p>
    
    {error.retry && (
      <Button onClick={retrySync}>
        Try Again
      </Button>
    )}
    
    <Button variant="ghost" onClick={skipToInbox}>
      Skip for now (sync in background)
    </Button>
  </div>
)}
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

## Updated Onboarding Flow Diagram

```
┌─────────────────────────────────────────┐
│ 1. User connects Gmail                  │
│    ↓                                     │
│ 2. User adds clients (optional)         │
│    ↓                                     │
│ 3. User clicks "Finish Setup"           │
│    ↓                                     │
│ 4. Loading screen appears                │
│    ↓                                     │
│ 5. Backend: Fetch last 50 emails        │  ← NEW!
│    ↓                                     │
│ 6. Backend: AI analyzes all emails      │  ← NEW!
│    ↓  (shows progress: 0%→100%)         │
│ 7. Redirect to inbox                    │
│    ↓                                     │
│ 8. User sees categorized emails!        │  🎉
│    ↓                                     │
│ 9. Background: Schedule hourly sync     │
└─────────────────────────────────────────┘
```

## Key Takeaway

**Don't make users wait!** Fetch and analyze a reasonable number of recent emails (50-100) during onboarding so they can:
- See the system in action immediately
- Test categorization accuracy
- Find action items from real emails
- Understand the value before committing

This dramatically improves conversion and user satisfaction compared to "check back in an hour."
