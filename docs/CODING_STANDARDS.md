# IdeaBox - Coding Standards

## Golden Rules

### 1. File Size Limit: 400 Lines Maximum
**Every file must be ≤400 lines of code (excluding comments/imports)**

**Why:** 
- Forces good separation of concerns
- Makes code easier to read and review
- Enables better testing and reusability
- Easier for AI assistants to understand and modify

**Enforcement:**
```json
// .eslintrc.js
{
  "rules": {
    "max-lines": ["error", {
      "max": 400,
      "skipBlankLines": true,
      "skipComments": true
    }]
  }
}
```

**What to do when a file approaches 400 lines:**
1. Extract components into separate files
2. Split services into smaller, focused modules
3. Move utility functions to `lib/utils/`
4. Create sub-modules with clear boundaries

**Example - Splitting a large component:**
```typescript
// ❌ BAD: EmailList.tsx (500 lines)
export function EmailList() {
  // 100 lines of filtering logic
  // 150 lines of email card rendering
  // 100 lines of pagination
  // 150 lines of action handlers
}

// ✅ GOOD: Split into focused components
// EmailList.tsx (150 lines)
export function EmailList() {
  const { filteredEmails } = useEmailFilters();
  return (
    <div>
      <EmailFilters />
      <EmailCards emails={filteredEmails} />
      <EmailPagination />
    </div>
  );
}

// EmailFilters.tsx (100 lines)
// EmailCards.tsx (120 lines)
// EmailPagination.tsx (80 lines)
// useEmailFilters.ts (50 lines)
```

---

## 2. Modularity First

### Single Responsibility Principle
Every file, function, and component should do ONE thing well.

```typescript
// ❌ BAD: Function doing too much
function processEmailAndCreateActionsAndNotifyUser(email: Email) {
  // Analyzes email
  // Creates action items
  // Sends notifications
  // Updates database
}

// ✅ GOOD: Separate concerns
async function analyzeEmail(email: Email): Promise<Analysis> { }
async function createActionsFromAnalysis(analysis: Analysis): Promise<Action[]> { }
async function notifyUserOfNewActions(actions: Action[]): Promise<void> { }
```

### Service Layer Pattern
Business logic lives in services, not in components or API routes.

```
Component/Page → Hook → API Route → Service → Database/External API
```

**Example:**
```typescript
// ❌ BAD: Logic in API route
// app/api/emails/sync/route.ts
export async function POST() {
  const emails = await fetch('gmail api...');
  const processed = emails.map(e => /* complex processing */);
  await supabase.from('emails').insert(processed);
  // More logic...
}

// ✅ GOOD: Logic in service
// app/api/emails/sync/route.ts
export async function POST() {
  const result = await emailSyncService.syncAll();
  return NextResponse.json(result);
}

// services/email-sync-service.ts
export class EmailSyncService {
  async syncAll() {
    // All the logic here, testable independently
  }
}
```

### Configuration Over Hardcoding
Use config files for values that might change.

```typescript
// config/analyzers.ts
export const ANALYZER_CONFIG = {
  categorizer: {
    enabled: true,
    model: 'gpt-4.1-mini',
    temperature: 0.3,
    maxTokens: 500,
  },
  actionExtractor: {
    enabled: true,
    model: 'gpt-4.1-mini',
    temperature: 0.2,
    maxTokens: 800,
  },
};

// config/app.ts
export const APP_CONFIG = {
  emailsPerPage: 50,
  syncIntervalMinutes: 60,
  maxRetries: 3,
  batchSize: 10,
};
```

---

## 3. Extensive Logging with Emojis 🪵

### Logging Requirements
**Every service, analyzer, and background job MUST log extensively with emoji prefixes.**

**Log Levels:**
- `debug` 🔍 - Detailed diagnostic info (not in production)
- `info` ℹ️ - Important events (function starts, completions, decisions)
- `warn` ⚠️ - Warning conditions (degraded mode, retries)
- `error` ❌ - Errors that need attention

### Emoji System
We use emojis as visual prefixes for quick log scanning:

| Emoji | Constant | Usage |
|-------|----------|-------|
| 🚀 | `START` | Starting operations |
| ✅ | `SUCCESS` | Successful completions |
| ❌ | `ERROR` | Errors and failures |
| ⚠️ | `WARNING` | Warnings |
| 🔍 | `DEBUG` | Debug information |
| 🌐 | `API` | API calls |
| 💾 | `DATABASE` | Database operations |
| 🤖 | `AI` | AI/ML operations |
| 🔐 | `AUTH` | Authentication |
| 📧 | `EMAIL` | Email operations |
| 🔄 | `SYNC` | Sync operations |
| ⏱️ | `PERFORMANCE` | Performance metrics |
| 💰 | `COST` | Cost tracking |

### Logger Setup (Implemented)
```typescript
// lib/utils/logger.ts - ALREADY IMPLEMENTED
import { createLogger, logEmail, logAI, logAuth, logDB } from '@/lib/utils/logger';

// Create a context-aware logger
const logger = createLogger('MyService');

// Basic logging with emojis
logger.start('Starting operation', { userId: '123' });
// Output: 🚀 [MyService] Starting operation { userId: '123' }

logger.success('Operation completed', { count: 10 });
// Output: ✅ [MyService] Operation completed { count: 10 }

logger.error('Operation failed', { error: 'Something went wrong' });
// Output: ❌ [MyService] Operation failed { error: 'Something went wrong' }

// Domain-specific logging
logEmail.fetchStart({ accountId: '123', count: 50 });
// Output: 📧🚀 Starting email fetch { accountId: '123', count: 50 }

logAI.callComplete({ model: 'gpt-4.1-mini', tokensUsed: 500, estimatedCost: 0.0015 });
// Output: 🤖✅ AI call complete { model: 'gpt-4.1-mini', tokensUsed: 500 }

// Performance timing
import { logPerformance } from '@/lib/utils/logger';
const timer = logPerformance('EmailProcessor.processBatch');
await processBatch(emails);
timer.end({ count: emails.length });
// Output: ⏱️ EmailProcessor.processBatch completed in 1234ms { count: 50 }
```

### What to Log

#### Services & Analyzers
```typescript
// services/analyzers/categorizer.ts
export class CategorizerAnalyzer extends BaseAnalyzer {
  private logger = createLogger('CategorizerAnalyzer');
  
  async analyze(email: Email): Promise<AnalyzerResult> {
    // Log start
    this.logger.info('Starting analysis', {
      emailId: email.id,
      subject: email.subject,
      sender: email.sender_email,
    });
    
    try {
      const result = await this.callOpenAI(email);
      
      // Log result
      this.logger.info('Analysis complete', {
        emailId: email.id,
        category: result.category,
        confidence: result.confidence,
        tokensUsed: result.tokensUsed,
      });
      
      return result;
      
    } catch (error) {
      // Log error with context
      this.logger.error('Analysis failed', {
        emailId: email.id,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }
}
```

#### API Routes
```typescript
// app/api/emails/sync/route.ts
export async function POST(request: Request) {
  logger.info('Email sync triggered', {
    trigger: 'manual',
    userId: user.id,
  });
  
  const startTime = Date.now();
  
  try {
    const result = await emailSyncService.syncAll(user.id);
    
    logger.info('Email sync completed', {
      userId: user.id,
      emailsFetched: result.emailsFetched,
      emailsProcessed: result.emailsProcessed,
      durationMs: Date.now() - startTime,
    });
    
    return NextResponse.json(result);
    
  } catch (error) {
    logger.error('Email sync failed', {
      userId: user.id,
      error: error.message,
      durationMs: Date.now() - startTime,
    });
    
    return NextResponse.json(
      { error: 'Sync failed' }, 
      { status: 500 }
    );
  }
}
```

#### Background Jobs
```typescript
// services/jobs/email-sync-job.ts
export async function emailSyncJob() {
  const logger = createLogger('EmailSyncJob');
  
  logger.info('Starting scheduled email sync');
  
  const accounts = await getActiveGmailAccounts();
  
  logger.info('Found accounts to sync', {
    accountCount: accounts.length,
  });
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const account of accounts) {
    try {
      await syncGmailAccount(account);
      successCount++;
      
      logger.debug('Account synced successfully', {
        accountId: account.id,
        email: account.email,
      });
      
    } catch (error) {
      errorCount++;
      
      logger.error('Account sync failed', {
        accountId: account.id,
        email: account.email,
        error: error.message,
      });
    }
  }
  
  logger.info('Email sync job complete', {
    totalAccounts: accounts.length,
    successCount,
    errorCount,
  });
}
```

### Performance Logging
Track expensive operations:

```typescript
const startTime = performance.now();

// Expensive operation
await processEmails(batch);

const duration = performance.now() - startTime;

logger.info('Batch processing complete', {
  batchSize: batch.length,
  durationMs: Math.round(duration),
  emailsPerSecond: Math.round(batch.length / (duration / 1000)),
});
```

### Cost Tracking
Log API costs for budgeting:

```typescript
logger.info('OpenAI API call complete', {
  model: 'gpt-4.1-mini',
  tokensUsed: response.usage.total_tokens,
  estimatedCost: calculateCost(response.usage.total_tokens, 'gpt-4.1-mini'),
});
```

---

## 4. TypeScript Standards

### Strict Mode Always
```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### Type Everything
```typescript
// ❌ BAD: Implicit any
function processEmail(email) {
  return email.subject;
}

// ✅ GOOD: Explicit types
function processEmail(email: Email): string {
  return email.subject;
}

// ✅ GOOD: Type parameters
async function fetchData<T>(url: string): Promise<T> {
  const response = await fetch(url);
  return response.json();
}
```

### Use Zod for Runtime Validation
```typescript
import { z } from 'zod';

// Define schema
const EmailSchema = z.object({
  subject: z.string(),
  sender_email: z.string().email(),
  body_text: z.string(),
  date: z.string().datetime(),
});

// Infer type from schema
type Email = z.infer<typeof EmailSchema>;

// Validate at runtime
function processEmail(data: unknown): Email {
  return EmailSchema.parse(data); // Throws if invalid
}
```

### Supabase Type Generation
```bash
# Generate types from database
npx supabase gen types typescript --project-id xxx > types/database.ts
```

```typescript
import { Database } from '@/types/database';

type Email = Database['public']['Tables']['emails']['Row'];
type EmailInsert = Database['public']['Tables']['emails']['Insert'];
type EmailUpdate = Database['public']['Tables']['emails']['Update'];
```

---

## 5. Naming Conventions

### Files & Folders
- **Components**: PascalCase - `EmailList.tsx`, `CategoryBadge.tsx`
- **Utilities**: kebab-case - `format-date.ts`, `validate-email.ts`
- **Services**: kebab-case - `email-sync-service.ts`, `gmail-client.ts`
- **Hooks**: camelCase with 'use' prefix - `useEmails.ts`, `useActions.ts`
- **Types**: PascalCase - `Email.ts`, `Action.ts`
- **Config**: kebab-case - `analyzer-config.ts`, `app-config.ts`

### Variables & Functions
```typescript
// Variables: camelCase
const emailCount = 42;
const isProcessing = true;
const userPreferences = { ... };

// Functions: camelCase, verb-first
function fetchEmails() { }
function analyzeEmail() { }
function createAction() { }

// Boolean functions: is/has/should prefix
function isValidEmail(email: string): boolean { }
function hasUnreadEmails(): boolean { }
function shouldSyncNow(): boolean { }

// Async functions: clear they're async
async function fetchUserData() { }
async function syncGmailAccount() { }
```

### React Components
```typescript
// Component names: PascalCase, noun-based
export function EmailList({ ... }: EmailListProps) { }
export function CategoryBadge({ ... }: CategoryBadgeProps) { }
export function ActionItem({ ... }: ActionItemProps) { }

// Props interface: ComponentName + Props
interface EmailListProps {
  emails: Email[];
  onSelect: (email: Email) => void;
}
```

### Constants
```typescript
// All caps with underscores for true constants
const MAX_EMAILS_PER_PAGE = 50;
const API_BASE_URL = 'https://api.example.com';
const DEFAULT_TIMEZONE = 'America/Chicago';

// Enums: PascalCase
// REFACTORED (Jan 2026): Life-bucket categories - what part of life the email touches
enum EmailCategory {
  // Work & Business
  Clients = 'clients',
  Work = 'work',
  // Family & Personal
  PersonalFriendsFamily = 'personal_friends_family',
  Family = 'family',
  // Life Admin
  Finance = 'finance',
  Travel = 'travel',
  Shopping = 'shopping',
  Local = 'local',
  // Information
  NewslettersCreator = 'newsletters_creator',
  NewslettersIndustry = 'newsletters_industry',
  NewsPolitics = 'news_politics',
  ProductUpdates = 'product_updates',
}
```

---

## 6. Error Handling

### Use Custom Error Classes
```typescript
// lib/errors.ts
export class AnalyzerError extends Error {
  constructor(
    message: string,
    public context: {
      emailId?: string;
      analyzer?: string;
      originalError?: Error;
    }
  ) {
    super(message);
    this.name = 'AnalyzerError';
  }
}

export class GmailAPIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public response?: any
  ) {
    super(message);
    this.name = 'GmailAPIError';
  }
}
```

### Handle Errors Gracefully
```typescript
// ❌ BAD: Silent failure
try {
  await analyzeEmail(email);
} catch (error) {
  // Nothing - error lost!
}

// ✅ GOOD: Log and handle
try {
  await analyzeEmail(email);
} catch (error) {
  logger.error('Email analysis failed', {
    emailId: email.id,
    error: error.message,
  });
  
  // Fallback behavior
  await savePartialAnalysis(email.id, { error: error.message });
  
  // Re-throw if critical
  if (error instanceof CriticalError) {
    throw error;
  }
}
```

### Validation Errors
```typescript
// Use Zod for clear validation errors
const result = EmailSchema.safeParse(data);

if (!result.success) {
  logger.warn('Invalid email data', {
    errors: result.error.errors,
    data: data,
  });
  
  throw new ValidationError('Invalid email format', result.error);
}
```

---

## 7. Testing Standards

### File Organization
```
src/
  services/
    email-processor.ts
    __tests__/
      email-processor.test.ts
  
  components/
    EmailList.tsx
    __tests__/
      EmailList.test.tsx
```

### Test Coverage Requirements
- All services: 80%+ coverage
- All analyzers: 90%+ coverage (critical business logic)
- Components: 60%+ coverage (focus on logic, not rendering)

### Test Structure
```typescript
// __tests__/analyzers/categorizer.test.ts
describe('CategorizerAnalyzer', () => {
  let analyzer: CategorizerAnalyzer;
  
  beforeEach(() => {
    analyzer = new CategorizerAnalyzer(testConfig);
  });
  
  describe('analyze()', () => {
    it('should categorize client email correctly', async () => {
      const email = createMockEmail({
        subject: 'Please review this proposal',
        body_text: 'Can you review and provide feedback?',
        sender_email: 'client@acme.com',
      });

      const result = await analyzer.analyze(email);

      expect(result.success).toBe(true);
      // Life-bucket category (Jan 2026): client work goes to clients
      expect(result.data.category).toBe('clients');
      // Urgency is now tracked via score, not category
      expect(result.data.urgency_score).toBeGreaterThanOrEqual(6);
      expect(result.confidence).toBeGreaterThan(0.8);
    });
    
    it('should handle API errors gracefully', async () => {
      // Mock OpenAI to throw error
      mockOpenAI.mockRejectedValue(new Error('API Error'));
      
      const result = await analyzer.analyze(mockEmail);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
```

---

## 8. Comments & Documentation

### When to Comment
```typescript
// ✅ GOOD: Explain WHY, not WHAT
// We batch emails to avoid rate limits (100 req/min)
const BATCH_SIZE = 10;

// ✅ GOOD: Document complex algorithms
/**
 * Calculates urgency score using weighted factors:
 * - Deadline proximity (40%)
 * - Sender relationship (30%)
 * - Keyword urgency (30%)
 */
function calculateUrgency(email: Email): number { }

// ❌ BAD: Stating the obvious
// Increment counter
counter++;

// ❌ BAD: Commenting bad code instead of fixing it
// TODO: This is hacky, fix later
const result = data.split(',')[0]?.trim() || '';
```

### JSDoc for Public APIs
```typescript
/**
 * Analyzes an email using AI to extract structured data.
 * 
 * @param email - The email to analyze
 * @param options - Configuration options for analysis
 * @returns Analysis result with confidence score
 * @throws {AnalyzerError} If analysis fails after retries
 * 
 * @example
 * const result = await analyzer.analyze(email, { 
 *   model: 'gpt-4.1-mini' 
 * });
 */
export async function analyze(
  email: Email, 
  options?: AnalyzerOptions
): Promise<AnalyzerResult> { }
```

---

## 9. Git Commit Standards

### Conventional Commits
```bash
# Format: <type>(<scope>): <subject>

feat(analyzer): add URL extraction analyzer
fix(api): handle null email body gracefully
refactor(inbox): split EmailList into smaller components
test(actions): add tests for action creation flow
docs(readme): update setup instructions
chore(deps): upgrade to Next.js 14.1
```

### Commit Message Rules
- Use present tense ("add feature" not "added feature")
- Keep subject line under 72 characters
- Reference issues: `fixes #123`
- Break related changes into separate commits

---

## 10. Code Review Checklist

Before submitting PR:
- [ ] No file exceeds 400 lines
- [ ] All new code has appropriate logging
- [ ] TypeScript strict mode passes
- [ ] Tests added for new features
- [ ] No console.log statements (use logger)
- [ ] Error handling is comprehensive
- [ ] API routes validate inputs with Zod
- [ ] Supabase RLS policies considered
- [ ] Performance implications considered
- [ ] Comments explain complex logic

---

## Quick Reference

### Import Order
```typescript
// 1. External libraries
import React from 'react';
import { z } from 'zod';

// 2. Internal modules
import { Email } from '@/types/email';
import { logger } from '@/lib/utils/logger';

// 3. Components
import { EmailCard } from '@/components/email/EmailCard';

// 4. Styles
import styles from './EmailList.module.css';
```

### Barrel Exports
```typescript
// components/email/index.ts
export { EmailList } from './EmailList';
export { EmailCard } from './EmailCard';
export { EmailDetail } from './EmailDetail';

// Usage:
import { EmailList, EmailCard } from '@/components/email';
```

### Environment Variables
```typescript
// Access via process.env, but validate:
const OPENAI_API_KEY = z.string().min(1).parse(process.env.OPENAI_API_KEY);
```

**Remember: Modularity and logging aren't optional—they're requirements. Every file, function, and operation should be small, focused, and observable.**
