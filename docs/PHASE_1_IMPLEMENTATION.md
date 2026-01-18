# IdeaBox - Phase 1 Implementation Guide

> **📊 Implementation Status:** See `docs/IMPLEMENTATION_STATUS.md` for current progress
> **Last Updated:** January 18, 2026

## Phase 1 Goal
Prove the concept: Emails in → Smart categorization out → Basic actions

**Success Metric:** Process a day's emails with intelligent sorting and 3-5 action items surfaced

---

## What's Already Built ✅

Before implementing the pages below, these foundational pieces are complete:

### Layout Components (`src/components/layout/`) ✨ NEW
All layout components are ready via `import { ... } from '@/components/layout'`:
- **Navbar** - Top navigation with search (⌘K), sync indicator, user dropdown
- **Sidebar** - Navigation, category filters, client quick-access
- **PageHeader** - Breadcrumbs, title, description, action buttons

### UI Component Library (`src/components/ui/`)
All components are ready to use via `import { ... } from '@/components/ui'`:
- **Button** - Variants: default, secondary, destructive, outline, ghost, link
- **Input** - Text inputs with consistent styling
- **Label** - Accessible form labels
- **Card** - Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter
- **Badge** - Standard + email category variants (actionRequired, event, newsletter, etc.)
- **Checkbox** - Accessible checkbox
- **Switch** - Toggle for boolean settings
- **Select** - Dropdown select with groups
- **Dialog** - Modal dialogs
- **Toast/Toaster** - Toast notifications with `useToast()` hook
- **Skeleton** - Loading placeholders (EmailCardSkeleton, ActionItemSkeleton)
- **Spinner** - Loading indicators (Spinner, LoadingState, FullPageLoader)

### Authentication (`src/lib/auth/`) ✨ NEW
- **AuthProvider** - React context for auth state (stub for Supabase)
- **useAuth** - Hook to access auth state and methods

### Root Layout (`src/app/layout.tsx`) ✨ UPDATED
- Wrapped with AuthProvider for global auth state
- Includes Toaster for toast notifications
- Proper metadata for SEO

### Utilities
- **Logger** (`@/lib/utils/logger`) - Enhanced logging with emoji prefixes
- **cn()** (`@/lib/utils/cn`) - Tailwind class merging utility

### Configuration
- **App Config** (`@/config/app`) - Centralized settings
- **Analyzer Config** (`@/config/analyzers`) - AI model settings
- **Database Types** (`@/types/database`) - Full type definitions

---

## Features Overview

### Core Features
1. ✅ Gmail OAuth connection (multiple accounts)
2. ✅ Automatic email sync (hourly)
3. ✅ AI-powered categorization
4. ✅ Action item extraction
5. ✅ Client association
6. ✅ Basic inbox views
7. ✅ Simple to-do list

### Non-Features (Phase 2+)
- ❌ Content library (URLs, tweets)
- ❌ Events calendar
- ❌ Client dashboard
- ❌ Daily summaries
- ❌ Advanced learning/patterns

## Pages & Routes

### 1. Landing/Login Page
**Route:** `/`

**Purpose:** Entry point for unauthenticated users

**Components:**
- Hero section explaining IdeaBox value prop
- "Connect with Gmail" button
- Feature highlights (3-4 key benefits)
- Simple, clean design

**UI Elements:**
```tsx
<main>
  <h1>Take control of your inbox with AI</h1>
  <p>IdeaBox automatically categorizes emails, extracts action items, 
     and helps you focus on what matters.</p>
  
  <Button onClick={handleGmailAuth}>
    <GoogleIcon /> Connect Gmail Account
  </Button>
  
  <FeatureGrid>
    <Feature 
      icon={<Sparkles />}
      title="Smart Categorization"
      description="AI sorts emails into meaningful categories"
    />
    <Feature 
      icon={<CheckSquare />}
      title="Auto Action Items"
      description="Never miss a to-do buried in email"
    />
    <Feature 
      icon={<Users />}
      title="Client Context"
      description="All client emails organized together"
    />
  </FeatureGrid>
</main>
```

**Implementation:**
- File: `app/page.tsx`
- Uses: Supabase Auth for OAuth flow
- Redirects to `/onboarding` after successful auth

---

### 2. Onboarding Flow
**Route:** `/onboarding`

**Purpose:** First-time setup after Gmail connection

**Steps:**

#### Step 1: Welcome
```tsx
<OnboardingStep step={1} totalSteps={3}>
  <h2>Welcome to IdeaBox!</h2>
  <p>Let's set up your account. This will take about 2 minutes.</p>
  <Button onClick={nextStep}>Get Started</Button>
</OnboardingStep>
```

#### Step 2: Connect Gmail Accounts
```tsx
<OnboardingStep step={2} totalSteps={3}>
  <h2>Connect Your Email Accounts</h2>
  <p>You've connected: {connectedEmails[0]}</p>
  
  <ConnectedAccountsList accounts={gmailAccounts} />
  
  <Button variant="outline" onClick={addAnotherAccount}>
    <Plus /> Add Another Gmail Account
  </Button>
  
  <Button onClick={nextStep}>Continue</Button>
</OnboardingStep>
```

**Logic:**
- User can connect 1-5 Gmail accounts
- Each account goes through OAuth separately
- Stored in `gmail_accounts` table

#### Step 3: Add Clients (Optional)
```tsx
<OnboardingStep step={3} totalSteps={3}>
  <h2>Who are your main clients?</h2>
  <p>Help IdeaBox recognize your important emails. You can add more later.</p>
  
  <ClientForm onAdd={handleAddClient}>
    <Input name="clientName" placeholder="Client Name" />
    <Input name="company" placeholder="Company (optional)" />
    <Input name="email" placeholder="Contact Email" />
    <Button type="submit">Add Client</Button>
  </ClientForm>
  
  <ClientList clients={addedClients} onRemove={handleRemove} />
  
  <div className="actions">
    <Button variant="ghost" onClick={skipStep}>Skip for now</Button>
    <Button onClick={finishOnboarding}>Finish Setup</Button>
  </div>
</OnboardingStep>
```

**After Onboarding:**
- Set `user_profiles.onboarding_completed = true`
- Trigger first email sync
- Redirect to `/inbox`
- Show loading state: "Syncing your emails..."

**Implementation Files:**
- `app/onboarding/page.tsx` - Main onboarding component
- `app/onboarding/components/OnboardingSteps.tsx`
- `app/onboarding/components/ClientForm.tsx`
- `app/api/onboarding/complete/route.ts` - Marks onboarding done

---

### 3. Inbox View (Main App)
**Route:** `/inbox`

**Purpose:** Primary email triage interface

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ Navbar (Logo, Search, Settings, Profile)               │
├──────────┬──────────────────────────────────────────────┤
│          │  Inbox Header                                │
│          │  [All] [Action] [Client] [Event] [Other]     │
│          ├──────────────────────────────────────────────┤
│ Sidebar  │  Email List                                  │
│          │  ┌────────────────────────────────────────┐  │
│ - Inbox  │  │ ✉️ Client A - Project Update           │  │
│ - Actions│  │ 10:30am • action_required • ⭐         │  │
│ - Clients│  │ Can you review the timeline...          │  │
│ - Sent   │  └────────────────────────────────────────┘  │
│ - Archive│  ┌────────────────────────────────────────┐  │
│          │  │ 📰 Newsletter - Weekly AI Digest        │  │
│ Clients  │  │ Yesterday • newsletter                  │  │
│ - Client A│  │ This week's top AI news...             │  │
│ - Client B│  └────────────────────────────────────────┘  │
│          │                                              │
│          │  [Load More]                                 │
└──────────┴──────────────────────────────────────────────┘
```

**Key Components:**

#### Email List
```tsx
// components/email/EmailList.tsx
interface EmailListProps {
  emails: Email[];
  selectedId?: string;
  onSelect: (email: Email) => void;
}

export function EmailList({ emails, selectedId, onSelect }: EmailListProps) {
  return (
    <div className="email-list">
      {emails.map(email => (
        <EmailCard
          key={email.id}
          email={email}
          selected={email.id === selectedId}
          onClick={() => onSelect(email)}
        />
      ))}
    </div>
  );
}
```

#### Email Card
```tsx
// components/email/EmailCard.tsx
export function EmailCard({ email, selected, onClick }: EmailCardProps) {
  return (
    <div 
      className={cn('email-card', selected && 'selected')}
      onClick={onClick}
    >
      <div className="email-header">
        <span className="sender">{email.sender_name || email.sender_email}</span>
        <span className="time">{formatRelativeTime(email.date)}</span>
      </div>
      
      <div className="email-subject">{email.subject}</div>
      
      <div className="email-snippet">{email.snippet}</div>
      
      <div className="email-meta">
        <CategoryBadge category={email.category} />
        {email.client_id && <ClientBadge clientId={email.client_id} />}
        {email.is_starred && <Star className="starred" />}
      </div>
    </div>
  );
}
```

#### Category Filters

> **Note:** "Clients" filter is based on `client_id` relationship, NOT category.
> This allows client emails to appear in both "Action" and "Clients" views.

```tsx
// app/inbox/components/CategoryFilter.tsx
const categories = [
  { value: 'all', label: 'All', count: totalCount },
  { value: 'action_required', label: 'Action', count: actionCount },
  { value: 'clients', label: 'Clients', count: clientCount, isRelationFilter: true },
  { value: 'event', label: 'Events', count: eventCount },
  { value: 'newsletter', label: 'News', count: newsletterCount },
  { value: 'other', label: 'Other', count: otherCount }, // promo, admin, personal, noise
];

export function CategoryFilter({ selected, onSelect }: CategoryFilterProps) {
  return (
    <div className="category-filter">
      {categories.map(cat => (
        <button
          key={cat.value}
          className={cn('filter-btn', selected === cat.value && 'active')}
          onClick={() => onSelect(cat.value)}
        >
          {cat.label}
          <span className="count">{cat.count}</span>
        </button>
      ))}
    </div>
  );
}
```

**Data Fetching:**
```tsx
// app/inbox/page.tsx
'use client';

export default function InboxPage() {
  const [category, setCategory] = useState('all');
  const { emails, loading, error } = useEmails({ category });
  
  return (
    <div className="inbox-page">
      <CategoryFilter selected={category} onSelect={setCategory} />
      
      {loading && <EmailListSkeleton />}
      {error && <ErrorMessage error={error} />}
      {emails && <EmailList emails={emails} onSelect={handleSelect} />}
    </div>
  );
}

// hooks/useEmails.ts
export function useEmails({ category = 'all' }) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function fetchEmails() {
      setLoading(true);
      const response = await fetch(`/api/emails?category=${category}`);
      const data = await response.json();
      setEmails(data.emails);
      setLoading(false);
    }
    
    fetchEmails();
  }, [category]);
  
  return { emails, loading };
}
```

**API Route:**
```typescript
// app/api/emails/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filter = searchParams.get('filter') || 'all';

  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  let query = supabase
    .from('emails')
    .select(`
      *,
      client:clients(id, name),
      analyses:email_analyses(*)
    `)
    .eq('user_id', user.id)
    .eq('is_archived', false)
    .order('date', { ascending: false })
    .limit(50);

  // Handle different filter types
  // "clients" filters by relationship, not category
  if (filter === 'clients') {
    query = query.not('client_id', 'is', null);
  } else if (filter === 'other') {
    // "other" groups less common categories
    query = query.in('category', ['promo', 'admin', 'personal', 'noise']);
  } else if (filter !== 'all') {
    query = query.eq('category', filter);
  }

  const { data: emails, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ emails });
}
```

---

### 4. Email Detail View
**Route:** `/inbox/[emailId]` (or modal overlay)

**Purpose:** View full email content and AI analysis

**Layout:**
```tsx
<EmailDetail>
  {/* Header */}
  <EmailDetailHeader>
    <div>
      <h2>{email.subject}</h2>
      <p>From: {email.sender_name} &lt;{email.sender_email}&gt;</p>
      <p>{formatDate(email.date)}</p>
    </div>
    
    <EmailActions>
      <Button variant="ghost" onClick={handleArchive}>Archive</Button>
      <Button variant="ghost" onClick={handleStar}>Star</Button>
      <Button onClick={handleOpenInGmail}>Open in Gmail</Button>
    </EmailActions>
  </EmailDetailHeader>
  
  {/* AI Analysis Panel */}
  <AnalysisPanel>
    <h3>AI Analysis</h3>
    
    <AnalysisSection title="Category">
      <CategoryBadge category={email.category} />
      <p className="reasoning">{analysis.categorization.reasoning}</p>
    </AnalysisSection>
    
    {analysis.action_extraction?.has_action && (
      <AnalysisSection title="Action Required">
        <ActionPreview action={analysis.action_extraction} />
        <Button onClick={createAction}>Add to Actions</Button>
      </AnalysisSection>
    )}
    
    {analysis.client_tagging?.client_match && (
      <AnalysisSection title="Client">
        <ClientLink clientId={email.client_id} />
      </AnalysisSection>
    )}
  </AnalysisPanel>
  
  {/* Email Body */}
  <EmailBody>
    {email.body_html ? (
      <SafeHTML content={email.body_html} />
    ) : (
      <pre>{email.body_text}</pre>
    )}
  </EmailBody>
</EmailDetail>
```

**Manual Actions:**
- User can manually change category
- User can assign to different client
- User can create/edit action item
- Changes trigger re-learning for future emails

---

### 5. Actions List
**Route:** `/actions`

**Purpose:** Dedicated to-do list from emails

**Layout:**
```tsx
<ActionsPage>
  <PageHeader>
    <h1>Action Items</h1>
    <ActionFilters>
      <FilterButton active={filter === 'pending'}>Pending</FilterButton>
      <FilterButton active={filter === 'today'}>Due Today</FilterButton>
      <FilterButton active={filter === 'urgent'}>Urgent</FilterButton>
    </ActionFilters>
  </PageHeader>
  
  <ActionList>
    {actions.map(action => (
      <ActionItem key={action.id} action={action}>
        <Checkbox 
          checked={action.status === 'completed'}
          onChange={() => toggleComplete(action.id)}
        />
        
        <ActionContent>
          <h3>{action.title}</h3>
          <p>{action.description}</p>
          
          <ActionMeta>
            {action.deadline && (
              <DeadlineBadge deadline={action.deadline} />
            )}
            {action.client_id && (
              <ClientBadge clientId={action.client_id} />
            )}
            <UrgencyBadge score={action.urgency_score} />
          </ActionMeta>
        </ActionContent>
        
        <ActionActions>
          <Button variant="ghost" onClick={() => viewEmail(action.email_id)}>
            View Email
          </Button>
          <Button variant="ghost" onClick={() => editAction(action.id)}>
            Edit
          </Button>
        </ActionActions>
      </ActionItem>
    ))}
  </ActionList>
</ActionsPage>
```

**Data Fetching:**
```typescript
// hooks/useActions.ts
export function useActions(filter: ActionFilter = 'pending') {
  const { data: actions, loading } = useSWR(
    `/api/actions?filter=${filter}`,
    fetcher
  );
  
  const toggleComplete = async (actionId: string) => {
    await fetch(`/api/actions/${actionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ 
        status: action.status === 'completed' ? 'pending' : 'completed' 
      }),
    });
    
    mutate(`/api/actions?filter=${filter}`); // Revalidate
  };
  
  return { actions, loading, toggleComplete };
}
```

---

### 6. Settings Page
**Route:** `/settings`

**Purpose:** Configure accounts, clients, preferences

**Sections:**

#### Gmail Accounts
```tsx
<SettingsSection title="Connected Accounts">
  {gmailAccounts.map(account => (
    <AccountCard key={account.id}>
      <p>{account.email}</p>
      <p className="last-sync">Last synced: {formatRelativeTime(account.last_sync_at)}</p>
      <Switch 
        checked={account.sync_enabled}
        onChange={() => toggleSync(account.id)}
      />
      <Button variant="destructive" onClick={() => disconnect(account.id)}>
        Disconnect
      </Button>
    </AccountCard>
  ))}
  
  <Button onClick={addAccount}>
    <Plus /> Add Another Account
  </Button>
</SettingsSection>
```

#### Clients Management
```tsx
<SettingsSection title="Clients">
  <ClientsTable>
    {clients.map(client => (
      <ClientRow key={client.id}>
        <td>{client.name}</td>
        <td>{client.company}</td>
        <td>{client.status}</td>
        <td>
          <Button size="sm" onClick={() => editClient(client.id)}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={() => deleteClient(client.id)}>
            Delete
          </Button>
        </td>
      </ClientRow>
    ))}
  </ClientsTable>
  
  <Button onClick={addClient}>Add Client</Button>
</SettingsSection>
```

#### User Preferences
```tsx
<SettingsSection title="Preferences">
  <PreferenceItem>
    <label>Default Inbox View</label>
    <Select value={preferences.default_view} onChange={updatePref}>
      <option value="inbox">All Emails</option>
      <option value="action_required">Action Required</option>
      <option value="clients">Client Emails</option>
    </Select>
  </PreferenceItem>
  
  <PreferenceItem>
    <label>Emails per page</label>
    <Input 
      type="number" 
      value={preferences.emails_per_page}
      onChange={updatePref}
    />
  </PreferenceItem>
  
  <PreferenceItem>
    <label>Timezone</label>
    <TimezoneSelect value={preferences.timezone} onChange={updatePref} />
  </PreferenceItem>
</SettingsSection>
```

---

## Background Jobs

### Email Sync Job
**Schedule:** Every hour (configurable)

```typescript
// services/jobs/email-sync-job.ts
export async function emailSyncJob() {
  logger.info('Starting scheduled email sync');
  
  // Get all users with Gmail accounts
  const { data: accounts } = await supabase
    .from('gmail_accounts')
    .select('*, user:user_profiles(*)')
    .eq('sync_enabled', true);
  
  for (const account of accounts) {
    try {
      await syncGmailAccount(account);
    } catch (error) {
      logger.error('Sync failed for account', {
        accountId: account.id,
        error: error.message,
      });
    }
  }
  
  logger.info('Email sync job complete');
}

async function syncGmailAccount(account: GmailAccount) {
  // Log sync start
  const syncLog = await createSyncLog(account.id);
  
  try {
    // Fetch new emails from Gmail
    const newEmails = await gmailService.fetchNewEmails(account);
    
    // Save to database
    const savedEmails = await saveEmails(newEmails, account.user_id);
    
    // Queue for AI analysis
    await batchProcessor.processBatch(savedEmails);
    
    // Update sync log
    await updateSyncLog(syncLog.id, {
      status: 'completed',
      emails_fetched: newEmails.length,
      emails_analyzed: savedEmails.length,
    });
    
  } catch (error) {
    await updateSyncLog(syncLog.id, {
      status: 'failed',
      error_message: error.message,
    });
    throw error;
  }
}
```

**Deployment:**
- Use Vercel Cron or Supabase Edge Functions
- Or simple setInterval in a long-running Node process
- Log all sync operations to `sync_logs` table

---

## API Routes Summary

### Auth
- `POST /api/auth/gmail` - Initiate Gmail OAuth
- `GET /api/auth/callback` - OAuth callback handler

### Emails
- `GET /api/emails` - List emails (with filters)
- `GET /api/emails/[id]` - Single email detail
- `PATCH /api/emails/[id]` - Update email (category, client, etc.)
- `POST /api/emails/sync` - Trigger manual sync

### Actions
- `GET /api/actions` - List actions (with filters)
- `POST /api/actions` - Create action manually
- `PATCH /api/actions/[id]` - Update action
- `DELETE /api/actions/[id]` - Delete action

### Clients
- `GET /api/clients` - List clients
- `POST /api/clients` - Create client
- `PATCH /api/clients/[id]` - Update client
- `DELETE /api/clients/[id]` - Delete client

### User
- `GET /api/user/profile` - Get user profile
- `PATCH /api/user/profile` - Update preferences
- `POST /api/onboarding/complete` - Mark onboarding done

---

## Implementation Order

### Week 1: Foundation
1. Set up Next.js project with TypeScript + Tailwind
2. Set up Supabase project + auth
3. Create database schema (initial migration)
4. Implement Gmail OAuth flow
5. Build basic landing page + onboarding
6. Create email sync service (no AI yet)

### Week 2: Core Features
1. Implement AI analyzers (categorizer, action extractor, client tagger)
2. Build email processor orchestration
3. Create inbox view with email list
4. Add email detail view
5. Implement actions list
6. Set up hourly sync job

### Week 3: Polish
1. Add settings page
2. Improve UI/UX (loading states, errors, empty states)
3. Add manual controls (reassign category/client)
4. Implement search/filtering
5. Write tests for critical flows
6. Deploy to Vercel + test with real emails

---

## Success Criteria

**Phase 1 is complete when:**
- ✅ User can connect multiple Gmail accounts
- ✅ Emails sync automatically every hour
- ✅ AI correctly categorizes 85%+ of emails
- ✅ Action items are extracted from emails
- ✅ User can view inbox by category
- ✅ User can manage action items
- ✅ User can add/manage clients
- ✅ System processes 200-300 emails efficiently (<$2/day in API costs)
- ✅ User checks actual Gmail less than before

**Ready for Phase 2 when:**
- User is actively using Phase 1 for 1-2 weeks
- Feedback collected on accuracy and usefulness
- No critical bugs in core workflows
- Database can handle the load
