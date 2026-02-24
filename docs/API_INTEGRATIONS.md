# IdeaBox - API Integrations

## Overview

IdeaBox integrates with these external services:
1. **Gmail API** - Email fetching, management, and label syncing
2. **Google People API** - Contact import for onboarding (NEW Jan 2026)
3. **OpenAI API** - AI analysis (GPT-4.1-mini only, no fallback)
4. **Google Calendar API** - Event syncing (Phase 2)

> **Model Decision:** We use GPT-4.1-mini exclusively. No Anthropic fallback.
> See PROJECT_OVERVIEW.md for cost analysis and rationale.

> **Contact Import:** See ARCHITECTURE.md for the VIP Suggestion Scoring data flow and DATABASE_SCHEMA.md for the contacts table definition.

---

## 1. Gmail API Integration

### Setup & Authentication

#### OAuth 2.0 Configuration
**Required Scopes:**
```typescript
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',    // Read emails
  'https://www.googleapis.com/auth/gmail.modify',      // Modify labels
  'https://www.googleapis.com/auth/userinfo.email',    // Get user email
  'https://www.googleapis.com/auth/userinfo.profile',  // Get user profile
];
```

**Google Cloud Console Setup:**
1. Create project at console.cloud.google.com
2. Enable Gmail API
3. Create OAuth 2.0 credentials (Web application)
4. Add authorized redirect URIs:
   - Development: `http://localhost:3000/api/auth/callback`
   - Production: `https://yourdomain.com/api/auth/callback`

#### Environment Variables
```bash
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback
```

### OAuth Flow Implementation

```typescript
// lib/gmail/auth.ts
import { google } from 'googleapis';

export class GmailAuth {
  private oauth2Client: OAuth2Client;
  
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }
  
  /**
   * Generate authorization URL for user to grant access
   */
  getAuthUrl(): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',  // Get refresh token
      scope: GMAIL_SCOPES,
      prompt: 'consent',       // Force consent screen (to get refresh token)
    });
  }
  
  /**
   * Exchange authorization code for tokens
   */
  async getTokens(code: string): Promise<Credentials> {
    const { tokens } = await this.oauth2Client.getToken(code);
    return {
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token!,
      expiry_date: tokens.expiry_date!,
    };
  }
  
  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<string> {
    this.oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });
    
    const { credentials } = await this.oauth2Client.refreshAccessToken();
    return credentials.access_token!;
  }
  
  /**
   * Create authenticated Gmail client
   */
  getGmailClient(accessToken: string) {
    this.oauth2Client.setCredentials({
      access_token: accessToken,
    });
    
    return google.gmail({ version: 'v1', auth: this.oauth2Client });
  }
}
```

### Email Fetching

#### Incremental Sync (Preferred)
Use history ID for efficient incremental syncing:

```typescript
// lib/gmail/sync.ts
export class GmailSync {
  private gmail: gmail_v1.Gmail;
  private logger = createLogger('GmailSync');
  
  /**
   * Fetch new emails since last sync using history ID
   */
  async fetchNewEmails(account: GmailAccount): Promise<Email[]> {
    this.logger.info('Starting incremental sync', {
      accountId: account.id,
      lastHistoryId: account.last_history_id,
    });
    
    try {
      // If we have a history ID, use incremental sync
      if (account.last_history_id) {
        return await this.incrementalSync(account);
      } else {
        // First sync - fetch recent emails
        return await this.initialSync(account);
      }
    } catch (error) {
      this.logger.error('Sync failed', {
        accountId: account.id,
        error: error.message,
      });
      throw error;
    }
  }
  
  private async incrementalSync(account: GmailAccount): Promise<Email[]> {
    const response = await this.gmail.users.history.list({
      userId: 'me',
      startHistoryId: account.last_history_id,
      historyTypes: ['messageAdded'],
      maxResults: 500,
    });
    
    if (!response.data.history) {
      this.logger.debug('No new emails', { accountId: account.id });
      return [];
    }
    
    // Extract message IDs from history
    const messageIds = response.data.history
      .flatMap(h => h.messagesAdded || [])
      .map(m => m.message!.id!);
    
    this.logger.info('Found new messages', {
      accountId: account.id,
      count: messageIds.length,
    });
    
    // Fetch full message details
    const emails = await this.fetchMessageDetails(messageIds);
    
    // Update last history ID
    await this.updateLastHistoryId(
      account.id, 
      response.data.historyId!
    );
    
    return emails;
  }
  
  private async initialSync(account: GmailAccount): Promise<Email[]> {
    this.logger.info('Performing initial sync', { accountId: account.id });

    // Fetch last 500 emails from All Mail (not just inbox)
    // By not specifying labelIds, we get all mail
    // We use query to exclude spam, trash, and drafts
    const response = await this.gmail.users.messages.list({
      userId: 'me',
      maxResults: 500,
      q: '-in:spam -in:trash -in:draft', // Exclude unwanted mail
      // Note: No labelIds = All Mail (includes sent, archived, etc.)
    });

    const messageIds = response.data.messages?.map(m => m.id!) || [];

    this.logger.info('Found messages for initial sync', {
      accountId: account.id,
      count: messageIds.length,
    });

    const emails = await this.fetchMessageDetails(messageIds);

    // Save current history ID for future incremental syncs
    await this.updateLastHistoryId(account.id, response.data.historyId!);

    return emails;
  }
  
  /**
   * Fetch full details for a batch of message IDs
   */
  private async fetchMessageDetails(messageIds: string[]): Promise<Email[]> {
    const emails: Email[] = [];
    
    // Batch fetch to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < messageIds.length; i += batchSize) {
      const batch = messageIds.slice(i, i + batchSize);
      
      const batchEmails = await Promise.all(
        batch.map(id => this.fetchSingleMessage(id))
      );
      
      emails.push(...batchEmails);
      
      // Small delay to respect rate limits
      if (i + batchSize < messageIds.length) {
        await this.delay(100);
      }
    }
    
    return emails;
  }
  
  /**
   * Fetch a single email message with full details
   */
  private async fetchSingleMessage(messageId: string): Promise<Email> {
    const response = await this.gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });
    
    const message = response.data;
    
    // Parse message into our Email format
    return this.parseGmailMessage(message);
  }
  
  /**
   * Parse Gmail API message into our Email format
   */
  private parseGmailMessage(message: gmail_v1.Schema$Message): Email {
    const headers = message.payload?.headers || [];
    
    const getHeader = (name: string) => 
      headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
    
    // Extract body text
    const bodyText = this.extractBodyText(message.payload);
    const bodyHtml = this.extractBodyHtml(message.payload);
    
    return {
      gmail_id: message.id!,
      thread_id: message.threadId!,
      subject: getHeader('Subject'),
      sender_email: this.extractEmail(getHeader('From')),
      sender_name: this.extractName(getHeader('From')),
      recipient_email: this.extractEmail(getHeader('To')),
      date: new Date(parseInt(message.internalDate!)),
      snippet: message.snippet || '',
      body_text: bodyText,
      body_html: bodyHtml,
      gmail_labels: message.labelIds || [],
    };
  }
  
  /**
   * Extract plain text body from message payload
   */
  private extractBodyText(payload?: gmail_v1.Schema$MessagePart): string {
    if (!payload) return '';
    
    // Single part message
    if (payload.body?.data && payload.mimeType === 'text/plain') {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }
    
    // Multipart message - find text/plain part
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
        // Recursive search in nested parts
        const nested = this.extractBodyText(part);
        if (nested) return nested;
      }
    }
    
    return '';
  }
  
  /**
   * Extract HTML body from message payload
   */
  private extractBodyHtml(payload?: gmail_v1.Schema$MessagePart): string {
    if (!payload) return '';
    
    if (payload.body?.data && payload.mimeType === 'text/html') {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }
    
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html' && part.body?.data) {
          return Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
        const nested = this.extractBodyHtml(part);
        if (nested) return nested;
      }
    }
    
    return '';
  }
  
  private extractEmail(fromHeader: string): string {
    const match = fromHeader.match(/<(.+?)>/);
    return match ? match[1] : fromHeader;
  }
  
  private extractName(fromHeader: string): string {
    const match = fromHeader.match(/^(.+?)\s*</);
    return match ? match[1].replace(/"/g, '').trim() : '';
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Label Management (Phase 2)

```typescript
// Create labels for IdeaBox categories
async createLabels(categories: string[]): Promise<void> {
  for (const category of categories) {
    await this.gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name: `IdeaBox/${category}`,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      },
    });
  }
}

// Apply label to email
async applyLabel(messageId: string, labelId: string): Promise<void> {
  await this.gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      addLabelIds: [labelId],
    },
  });
}
```

### Rate Limits
- **Quota:** 1 billion quota units per day
- **Per-user limit:** 250 quota units per second
- **Batch requests:** Recommended for bulk operations

**Cost per operation:**
- users.messages.list: 5 units
- users.messages.get: 5 units
- users.history.list: 2 units
- users.messages.modify: 5 units

**Strategy:**
- Use history API for incremental sync (cheaper)
- Batch message fetching (10 at a time)
- Add small delays between batches (100ms)
- Monitor quota usage in Google Cloud Console

---

## 2. Google People API Integration (NEW Jan 2026)

The Google People API enables importing contacts for a better onboarding experience.

### Why People API?

- **Better VIP suggestions**: Use starred contacts as VIP candidates
- **Contact photos**: Display avatars in the UI
- **Contact groups**: Use labels (Work, Family) for relationship categorization
- **Reduced friction**: Users don't have to manually type VIP email addresses

### Required OAuth Scope

```typescript
const PEOPLE_SCOPES = [
  'https://www.googleapis.com/auth/contacts.readonly',  // Read-only contacts access
];

// Combined with existing Gmail scopes:
const ALL_SCOPES = [
  ...GMAIL_SCOPES,
  ...PEOPLE_SCOPES,
];
```

### Google Cloud Console Setup

1. Enable "People API" in your Google Cloud project
2. Update OAuth consent screen to include the contacts.readonly scope
3. No additional credentials needed (uses same OAuth client as Gmail)

### Implementation

```typescript
// lib/google/people-service.ts
import { google, people_v1 } from 'googleapis';

export class GooglePeopleService {
  private people: people_v1.People;

  constructor(accessToken: string) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    this.people = google.people({ version: 'v1', auth });
  }

  /**
   * List contacts with names, emails, photos, and group memberships
   */
  async listContacts(options: { maxResults?: number }): Promise<GoogleContact[]> {
    const response = await this.people.people.connections.list({
      resourceName: 'people/me',
      pageSize: options.maxResults || 100,
      personFields: 'names,emailAddresses,photos,memberships,organizations',
    });

    return this.transformContacts(response.data.connections || []);
  }

  /**
   * Get only starred contacts (excellent VIP candidates)
   */
  async getStarredContacts(): Promise<GoogleContact[]> {
    const contacts = await this.listContacts({ maxResults: 500 });
    return contacts.filter(c => c.isStarred);
  }
}
```

### Data Flow

```
User grants contacts scope
        ↓
Fetch contacts via People API
        ↓
Transform to GoogleContact format
        ↓
Upsert to contacts table (merge with email-derived contacts)
        ↓
Display VIP suggestions during onboarding
        ↓
User selects VIPs → saved to contacts.is_vip and user_context.vip_emails
```

### Rate Limits

- **Quota:** 90,000 queries per day per project
- **Per-user limit:** 180 queries per minute
- **Strategy:** Fetch contacts once during onboarding, cache in database

### Contact Service Usage

```typescript
import { contactService } from '@/services/contacts';

// During onboarding, import from Google (batched upserts, 50 contacts per batch)
const result = await contactService.importFromGoogle({
  userId: user.id,
  accessToken: accessToken,
  accountId: gmailAccount.id,
  maxContacts: 100,
});

// Get VIP suggestions (uses 12-signal weighted scoring)
// Returns contacts ranked by: Google starred/labels, family name match,
// same email domain, sent count, bidirectional communication, frequency,
// recency, longevity, relationship type, sender type, avatar presence
const suggestions = await contactService.getVipSuggestions(userId, 15);
```

---

## 3. OpenAI API Integration

### Setup

```bash
OPENAI_API_KEY=sk-proj-xxx
OPENAI_ORG_ID=org-xxx  # Optional
```

### Client Configuration

```typescript
// lib/ai/openai-client.ts
import OpenAI from 'openai';

export class OpenAIClient {
  private client: OpenAI;
  private logger = createLogger('OpenAIClient');
  
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      organization: process.env.OPENAI_ORG_ID,
    });
  }
  
  /**
   * Call OpenAI with function calling for structured output
   */
  async analyzeWithFunction<T>(
    systemPrompt: string,
    userContent: string,
    functionSchema: FunctionSchema,
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): Promise<{ data: T; tokensUsed: number }> {
    const model = options.model || 'gpt-4.1-mini';
    const temperature = options.temperature ?? 0.3;
    const maxTokens = options.maxTokens || 1000;
    
    this.logger.debug('Calling OpenAI', {
      model,
      functionName: functionSchema.name,
      promptLength: userContent.length,
    });
    
    try {
      const response = await this.client.chat.completions.create({
        model,
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        functions: [functionSchema],
        function_call: { name: functionSchema.name },
      });
      
      const functionCall = response.choices[0].message.function_call;
      
      if (!functionCall) {
        throw new Error('No function call in response');
      }
      
      const data = JSON.parse(functionCall.arguments) as T;
      const tokensUsed = response.usage?.total_tokens || 0;
      
      this.logger.info('OpenAI call successful', {
        model,
        tokensUsed,
        estimatedCost: this.calculateCost(tokensUsed, model),
      });
      
      return { data, tokensUsed };
      
    } catch (error) {
      this.logger.error('OpenAI call failed', {
        model,
        error: error.message,
      });
      throw error;
    }
  }
  
  /**
   * Calculate estimated cost based on tokens and model
   */
  private calculateCost(tokens: number, model: string): number {
    const pricing: Record<string, number> = {
      'gpt-4.1-mini': 0.15 / 1_000_000,     // $0.15 per 1M input tokens
    };

    return tokens * (pricing[model] || 0);
  }
  
  /**
   * Batch processing with rate limiting
   */
  async analyzeBatch<T>(
    requests: Array<{
      systemPrompt: string;
      userContent: string;
      functionSchema: FunctionSchema;
    }>,
    options?: { concurrency?: number }
  ): Promise<Array<{ data: T; tokensUsed: number }>> {
    const concurrency = options?.concurrency || 5;
    const results: Array<{ data: T; tokensUsed: number }> = [];
    
    for (let i = 0; i < requests.length; i += concurrency) {
      const batch = requests.slice(i, i + concurrency);
      
      const batchResults = await Promise.all(
        batch.map(req => 
          this.analyzeWithFunction<T>(
            req.systemPrompt,
            req.userContent,
            req.functionSchema
          )
        )
      );
      
      results.push(...batchResults);
      
      // Small delay between batches
      if (i + concurrency < requests.length) {
        await this.delay(200);
      }
    }
    
    return results;
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Function Schema Examples

```typescript
// types/analyzer.ts
export interface FunctionSchema {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

// Example: Email categorization (UPDATED Feb 2026 for life-bucket categories)
export const CATEGORIZE_FUNCTION: FunctionSchema = {
  name: 'categorize_email',
  description: 'Categorizes an email into one primary life-bucket category',
  parameters: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: [
          // Work & Business
          'clients',
          'work',
          // Family & Personal
          'personal_friends_family',
          'family',
          // Life Admin
          'finance',
          'travel',
          'shopping',
          'local',
          // Information
          'newsletters_creator',
          'newsletters_industry',
          'news_politics',
          'product_updates',
        ],
        description: 'Primary life-bucket category for this email',
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Confidence in categorization (0-1)',
      },
      reasoning: {
        type: 'string',
        description: 'Brief explanation of categorization',
      },
    },
    required: ['category', 'confidence'],
  },
};
```

### Cost Optimization

**Single Model Strategy (GPT-4.1-mini):**
```typescript
// We use GPT-4.1-mini for ALL analysis - no model selection complexity
const MODEL = 'gpt-4.1-mini';
const MODEL_PRICING = {
  input: 0.15 / 1_000_000,   // $0.15 per 1M input tokens
  output: 0.60 / 1_000_000,  // $0.60 per 1M output tokens
};
```

**Estimated Costs for 250 emails/day (9 analyzers each):**
```
Per email:
  Input:  ~500 tokens × 9 analyzers = 4,500 tokens
  Output: ~100 tokens × 9 analyzers = 900 tokens

Daily (250 emails):
  Input:  1,125,000 tokens × $0.15/1M = $0.169
  Output: 225,000 tokens × $0.60/1M = $0.135
  Total:  ~$0.30/day

Monthly: ~$9.00/month (well under $50 budget)
```

**Body Truncation for Cost Control:**
```typescript
// Truncate email body to 16K chars before sending to AI
const MAX_BODY_CHARS = parseInt(process.env.MAX_BODY_CHARS || '16000');

function truncateBody(body: string): string {
  if (body.length <= MAX_BODY_CHARS) return body;

  // Keep beginning and end for context
  const halfLimit = Math.floor(MAX_BODY_CHARS / 2);
  return body.slice(0, halfLimit) + '\n\n[...truncated...]\n\n' + body.slice(-halfLimit);
}
```

---

## 4. Google Calendar API (Phase 2)

### Setup

**Required Scopes:**
```typescript
const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
];
```

### Create Event

```typescript
// lib/calendar/client.ts
export class GoogleCalendar {
  private calendar: calendar_v3.Calendar;
  
  async createEvent(event: ExtractedEvent): Promise<string> {
    const response = await this.calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: event.title,
        description: event.description,
        start: {
          dateTime: event.start_datetime,
          timeZone: event.timezone,
        },
        end: {
          dateTime: event.end_datetime,
          timeZone: event.timezone,
        },
        location: event.location,
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 30 },
          ],
        },
      },
    });
    
    return response.data.id!;
  }
}
```

---

## Error Handling & Retries

### Retry Logic with Exponential Backoff

```typescript
// lib/utils/retry.ts
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
  } = {}
): Promise<T> {
  const maxRetries = options.maxRetries || 3;
  const baseDelay = options.baseDelay || 1000;
  const maxDelay = options.maxDelay || 10000;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Check if error is retryable
      if (!isRetryableError(error)) {
        throw error;
      }
      
      // Exponential backoff with jitter
      const delay = Math.min(
        baseDelay * Math.pow(2, attempt - 1),
        maxDelay
      );
      const jitter = Math.random() * 0.3 * delay;
      
      await new Promise(resolve => 
        setTimeout(resolve, delay + jitter)
      );
    }
  }
  
  throw new Error('Max retries exceeded');
}

function isRetryableError(error: any): boolean {
  // Retry on rate limits, timeouts, server errors
  const retryableStatusCodes = [429, 500, 502, 503, 504];
  return retryableStatusCodes.includes(error.status);
}
```

---

## Monitoring & Logging

### Track API Usage

```typescript
// lib/monitoring/api-usage.ts
export class APIUsageTracker {
  async trackCall(
    service: 'gmail' | 'openai',
    endpoint: string,
    tokens?: number,
    cost?: number
  ): Promise<void> {
    await supabase.from('api_usage_logs').insert({
      service,
      endpoint,
      tokens_used: tokens,
      estimated_cost: cost,
      timestamp: new Date().toISOString(),
    });
  }
  
  async getDailyCost(): Promise<number> {
    const { data } = await supabase
      .from('api_usage_logs')
      .select('estimated_cost')
      .gte('timestamp', startOfDay(new Date()))
      .lte('timestamp', endOfDay(new Date()));
    
    return data?.reduce((sum, log) => sum + (log.estimated_cost || 0), 0) || 0;
  }
}
```

### Alerts for Quota Issues

```typescript
// Check if approaching quota limits
const dailyCost = await apiUsageTracker.getDailyCost();

if (dailyCost > 5) {  // Alert at $5/day
  logger.warn('API costs high today', { dailyCost });
  await notifyAdmin('High API usage', { dailyCost });
}
```

---

## Environment Variables Summary

```bash
# Gmail API (External app in testing mode)
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback

# OpenAI (GPT-4.1-mini only)
OPENAI_API_KEY=sk-proj-xxx

# Body truncation for cost control
MAX_BODY_CHARS=16000

# Google Calendar (Phase 2)
# Uses same GOOGLE_CLIENT_ID/SECRET, just add scope
```

---

## Testing API Integrations

```typescript
// __tests__/lib/gmail/sync.test.ts
describe('GmailSync', () => {
  it('should parse Gmail message correctly', () => {
    const mockMessage = createMockGmailMessage();
    const email = gmailSync.parseGmailMessage(mockMessage);
    
    expect(email.subject).toBe('Test Subject');
    expect(email.sender_email).toBe('test@example.com');
  });
  
  it('should handle rate limits with retry', async () => {
    mockGmail.users.messages.list
      .mockRejectedValueOnce({ status: 429 })  // Rate limit
      .mockResolvedValueOnce({ data: { messages: [] } });
    
    const result = await withRetry(() => 
      gmailSync.fetchNewEmails(account)
    );
    
    expect(result).toBeDefined();
  });
});
```

**Remember: Always handle errors gracefully and log extensively for debugging external API issues.**
