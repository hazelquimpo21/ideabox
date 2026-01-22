# IdeaBox - AI Analyzer System

## Core Philosophy

**Many Specialists > One Generalist**

Instead of one large prompt that tries to do everything, IdeaBox uses multiple focused analyzers, each expert in one specific task. This approach:
- Produces more accurate results
- Is easier to test and debug
- Allows independent improvement of each analyzer
- Enables cost optimization (use cheaper models for simple tasks)
- Makes the system more transparent (see what each analyzer determined)

## Model Selection: GPT-4.1-mini Only

After cost analysis, we chose **GPT-4.1-mini** as the sole model for all analyzers:

| Factor | Decision |
|--------|----------|
| Cost | ~$3-5/month for 250 emails/day |
| Capability | Optimized for function calling (our primary use case) |
| Context | 1M tokens (future-proof for long threads) |
| Fallback | None - single model reduces complexity |

See PROJECT_OVERVIEW.md "Key Architectural Decisions" for full rationale.

## Analyzer Architecture

### Base Analyzer Interface

All analyzers implement this interface:

```typescript
// types/analyzer.ts
interface AnalyzerConfig {
  enabled: boolean;
  model: 'gpt-4.1-mini'; // Single model - no fallback complexity
  temperature: number;
  maxTokens: number;
  maxBodyChars: number; // Truncate email body for cost efficiency (default: 16000)
}

interface AnalyzerResult {
  success: boolean;
  data: Record<string, any>; // Flexible result structure
  confidence: number; // 0-1 scale
  reasoning?: string; // Why the analyzer made this decision
  tokensUsed: number;
  processingTimeMs: number;
  error?: string;
}

abstract class BaseAnalyzer {
  abstract name: string;
  abstract description: string;
  protected config: AnalyzerConfig;
  
  constructor(config: AnalyzerConfig) {
    this.config = config;
  }
  
  // Main analysis method - must be implemented
  abstract analyze(email: Email): Promise<AnalyzerResult>;
  
  // OpenAI function schema - must be implemented
  abstract getFunctionSchema(): FunctionSchema;
  
  // Logging helper
  protected log(level: 'info' | 'debug' | 'error', message: string, meta?: any) {
    logger[level](`[${this.name}] ${message}`, meta);
  }
}
```

### Function Calling Pattern

Each analyzer uses OpenAI's function calling to get structured output:

```typescript
// Example: Action Extractor
async analyze(email: Email): Promise<AnalyzerResult> {
  const startTime = Date.now();
  
  try {
    this.log('debug', 'Starting analysis', { emailId: email.id });
    
    const response = await openai.chat.completions.create({
      model: this.config.model,
      temperature: this.config.temperature,
      messages: [
        {
          role: 'system',
          content: this.getSystemPrompt(),
        },
        {
          role: 'user',
          content: this.formatEmailForAnalysis(email),
        },
      ],
      functions: [this.getFunctionSchema()],
      function_call: { name: this.getFunctionSchema().name },
    });
    
    const functionCall = response.choices[0].message.function_call;
    const result = JSON.parse(functionCall.arguments);
    
    this.log('info', 'Analysis complete', {
      emailId: email.id,
      hasAction: result.has_action,
      tokensUsed: response.usage.total_tokens,
    });
    
    return {
      success: true,
      data: result,
      confidence: result.confidence || 0.8,
      tokensUsed: response.usage.total_tokens,
      processingTimeMs: Date.now() - startTime,
    };
    
  } catch (error) {
    this.log('error', 'Analysis failed', { emailId: email.id, error });
    return {
      success: false,
      data: {},
      confidence: 0,
      tokensUsed: 0,
      processingTimeMs: Date.now() - startTime,
      error: error.message,
    };
  }
}
```

## Phase 1 Analyzers

### 1. Categorizer Analyzer (ENHANCED Jan 2026)

**Purpose:** Classify email + generate assistant-style summary + suggest quick action

> **IMPORTANT:** "client" is NOT a category. Client relationship is tracked via `client_id` in the database.
> This design allows a client email to be categorized as "action_required" rather than hidden in a "client" bucket.

**ENHANCED (Jan 2026):** Now also generates:
- `summary`: One-sentence assistant-style overview (e.g., "Sarah from Acme wants you to review the proposal by Friday")
- `quick_action`: Suggested quick action for ALL emails (respond, review, archive, save, calendar, unsubscribe, follow_up, none)

**Function Schema:**
```typescript
{
  name: 'categorize_email',
  description: 'Categorizes an email by what action (if any) is needed from the user',
  parameters: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: [
          'action_required',  // Needs response, decision, or action from user
          'event',            // Calendar-worthy: invitation, announcement with date/time
          'newsletter',       // Informational content, digest, regular publication
          'promo',            // Marketing, promotional, sales content
          'admin',            // Receipts, confirmations, notifications, automated
          'personal',         // Personal correspondence (friends, family)
          'noise',            // Low-value, safe to ignore or bulk archive
        ],
        description: 'Primary category based on action needed (NOT who sent it)',
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Confidence in this categorization (0-1)',
      },
      reasoning: {
        type: 'string',
        description: 'Brief explanation of why this category was chosen',
      },
      topics: {
        type: 'array',
        items: { type: 'string' },
        description: 'Key topics extracted from email: billing, meeting, feedback, etc.',
      },
      // NEW FIELDS (Jan 2026)
      summary: {
        type: 'string',
        description: 'One-sentence assistant-style summary. Example: "Sarah from Acme wants you to review the proposal by Friday"',
      },
      quick_action: {
        type: 'string',
        enum: ['respond', 'review', 'archive', 'save', 'calendar', 'unsubscribe', 'follow_up', 'none'],
        description: 'Suggested quick action for inbox triage',
      },
    },
    required: ['category', 'confidence', 'reasoning', 'summary', 'quick_action'],
  },
}
```

**Output Examples:**

| Email Type | Summary | Quick Action |
|------------|---------|--------------|
| Client request | "Sarah from Acme wants you to review the Q1 proposal by Friday" | respond |
| AWS bill | "Your AWS bill for January is $142.67 - payment processed" | archive |
| LinkedIn digest | "LinkedIn: 5 people viewed your profile this week" | review |
| Event invite | "Milwaukee Tech Meetup on Jan 25 at 6pm - RSVP requested" | calendar |
| Spam-ish newsletter | "Marketing email from SaaS tool you signed up for once" | unsubscribe |

**Cost:** ~$0.00015 per email (GPT-4.1-mini, increased tokens for summary)

---

### 2. Action Extractor Analyzer (ENHANCED Jan 2026: Multi-Action Support)

**Purpose:** Determine if email requires action and extract details

> **ENHANCED (Jan 2026):** Now extracts MULTIPLE action items per email. Many emails contain more than one request:
> "Can you review the proposal by Friday? Also send headshot. And book travel."
> This email has THREE actions. The enhanced extractor finds ALL of them.

**Function Schema (Multi-Action):**
```typescript
{
  name: 'extract_actions',
  description: 'Extracts ALL action items from an email with priority and deadline information',
  parameters: {
    type: 'object',
    properties: {
      has_action: {
        type: 'boolean',
        description: 'Whether this email requires ANY action from the user',
      },
      actions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['respond', 'review', 'create', 'schedule', 'decide'] },
            title: { type: 'string', description: 'Short title. E.g., "Review Q1 proposal"' },
            description: { type: 'string' },
            deadline: { type: 'string', description: 'ISO 8601 or relative like "Friday"' },
            priority: { type: 'integer', description: 'Priority within email (1 = most important)' },
            estimated_minutes: { type: 'integer' },
            source_line: { type: 'string', description: 'Text that triggered this action' },
            confidence: { type: 'number' },
          },
          required: ['type', 'title', 'priority', 'confidence'],
        },
        maxItems: 10,
      },
      primary_action_index: {
        type: 'integer',
        description: 'Index of most important action (usually 0)',
      },
      urgency_score: {
        type: 'integer',
        minimum: 1,
        maximum: 10,
        description: 'HIGHEST urgency across all actions',
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
      },
    },
    required: ['has_action', 'actions', 'urgency_score', 'confidence'],
  },
}
```

**Output Example (Multi-Action):**
```json
{
  "has_action": true,
  "actions": [
    { "type": "review", "title": "Review Q1 proposal", "deadline": "Friday", "priority": 1, "confidence": 0.95 },
    { "type": "respond", "title": "Send headshot for conference", "priority": 2, "confidence": 0.90 },
    { "type": "create", "title": "Book travel", "priority": 3, "confidence": 0.85 }
  ],
  "primary_action_index": 0,
  "urgency_score": 7,
  "confidence": 0.92
}
```

**Backwards Compatibility:**
Legacy fields (`actionType`, `actionTitle`, etc.) are still populated from the primary action.
Existing code continues to work without changes.

**System Prompt:**
```
You are an action extraction specialist. Find ALL action items in an email.

Look for:
- Direct requests: "Can you...", "Please...", "Would you..."
- Questions that need answers: "What do you think?", "Which option?"
- Review requests: "Take a look at...", "Check out...", "Review..."
- Soft requests: "Don't forget to...", "Remember to..."

"Review" IS an action - if someone asks you to look at something, extract it.

Be conservative: not every email requires action. FYI emails, newsletters,
automated notifications typically don't require action.

For urgency scoring:
- 1-3: Can wait a week or more
- 4-6: Should be done this week
- 7-8: Should be done in next 1-2 days
- 9-10: Urgent, needs immediate attention
```

**Cost:** ~$0.0002 per email (GPT-4.1-mini)

---

### 2b. Content Digest Analyzer (NEW Jan 2026)

**Purpose:** Extract the SUBSTANCE of an email - what it's actually about, key points, and notable links

> Think of this as having an eager assistant read every email and brief you on what you need to know - without reading it yourself.

**Runs:** Always (PHASE 1, parallel with core analyzers)

**What It Extracts:**
- **Gist**: 1-2 sentence conversational briefing (like an assistant telling you what the email is about)
- **Key Points**: 2-5 specific, scannable bullet points with real details (names, dates, numbers)
- **Links**: Notable URLs with type and context (filtered for value, not tracking pixels)
- **Content Type**: single_topic, multi_topic_digest, curated_links, personal_update, transactional

**Function Schema:**
```typescript
{
  name: 'extract_content_digest',
  description: 'Extracts gist, key points, and notable links for quick email scanning',
  parameters: {
    type: 'object',
    properties: {
      gist: {
        type: 'string',
        description: 'One-two sentence conversational briefing. Include specifics.',
      },
      key_points: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            point: { type: 'string', description: 'Specific, scannable key point' },
            relevance: { type: 'string', description: 'Why this matters to user (optional)' },
          },
          required: ['point'],
        },
        minItems: 2,
        maxItems: 5,
      },
      links: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            type: { type: 'string', enum: ['article', 'registration', 'document', 'video', 'product', 'tool', 'social', 'unsubscribe', 'other'] },
            title: { type: 'string' },
            description: { type: 'string' },
            is_main_content: { type: 'boolean' },
          },
          required: ['url', 'type', 'title', 'description', 'is_main_content'],
        },
        maxItems: 10,
      },
      content_type: {
        type: 'string',
        enum: ['single_topic', 'multi_topic_digest', 'curated_links', 'personal_update', 'transactional'],
      },
      topics_highlighted: {
        type: 'array',
        items: { type: 'string' },
        description: 'For newsletters: which topics match user interests',
      },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: ['gist', 'key_points', 'links', 'content_type', 'confidence'],
  },
}
```

**Output Examples:**

| Email Type | Gist | Key Points |
|------------|------|------------|
| Product Update | "Figma shipped auto-layout 5.0 - text wrapping finally works, plus min/max widths. Rolling out this week." | ["Text wrapping in auto-layout frames", "New min/max width properties", "Rolling out Monday Jan 27"] |
| Newsletter | "Today's Morning Brew covers the Fed rate decision, Apple's AI features, and Costco's hot dog strategy." | [{"point": "Fed held rates at 5.25%"}, {"point": "Apple Intelligence in iOS 18.4", "relevance": "Matches your AI interest"}] |
| Client Email | "Sarah from Acme is checking in about Q1 proposal - needs review by Friday and wants to schedule a call." | ["Review proposal by Friday", "Schedule call next week"] |

**Relationship with EventDetector:**
For event emails, BOTH run:
- ContentDigest: "Speaker is Jane from Google, topic is AI in Production" (content substance)
- EventDetector: "Sat Jan 25 at 6pm, local, free, RSVP required" (event logistics)

**Database Storage:**
- `email_analyses.content_digest` JSONB: Full extraction results
- `emails.gist` TEXT: Denormalized for fast list display
- `emails.key_points` TEXT[]: Denormalized for fast list display

**Cost:** ~$0.00018 per email (GPT-4.1-mini)

---

### 3. Client Tagger Analyzer

**Purpose:** Link email to a client from user's roster

**Function Schema:**
```typescript
{
  name: 'tag_client',
  description: 'Links email to a client and extracts project information',
  parameters: {
    type: 'object',
    properties: {
      client_match: {
        type: 'boolean',
        description: 'Whether this email relates to a known client',
      },
      client_name: {
        type: 'string',
        description: 'Name of the client from the provided roster, or null if no match',
      },
      match_confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Confidence in the client match',
      },
      project_name: {
        type: 'string',
        description: 'Specific project mentioned (e.g., "PodcastPipeline", "HappenlistScraper")',
      },
      new_client_suggestion: {
        type: 'string',
        description: 'If no match, suggest if this could be a new client to add',
      },
      relationship_signal: {
        type: 'string',
        enum: ['positive', 'neutral', 'negative', 'unknown'],
        description: 'Sentiment/health of the relationship based on email tone',
      },
    },
    required: ['client_match', 'match_confidence'],
  },
}
```

**System Prompt (dynamically includes user's client list):**
```
You are a client relationship specialist. Your job is to determine if this email 
relates to any of the user's known clients.

Known clients:
${clientList.map(c => `- ${c.name} (${c.company}) - ${c.email_domains.join(', ')}`).join('\n')}

Match criteria:
- Sender email matches client's domain
- Email mentions client name or company
- Email discusses known project with this client
- Context suggests this is client-related correspondence

If no match, consider:
- Could this be a new potential client?
- Is this someone the user is networking with?

For relationship signals:
- Positive: Praise, satisfaction, moving forward
- Neutral: Routine communication
- Negative: Complaints, delays, concerns
- Unknown: Can't determine from content
```

**Special Logic:**
- This analyzer gets access to user's current client roster
- Learns from user corrections (if user manually assigns different client)
- Suggests adding new clients when it detects potential new business

**Cost:** ~$0.0002 per email (GPT-4.1-mini)

---

## Analyzer Orchestration

### EmailProcessor Service

Coordinates all analyzers:

```typescript
// services/processors/email-processor.ts
export class EmailProcessor {
  private analyzers: BaseAnalyzer[];
  
  constructor() {
    // Initialize enabled analyzers from config
    this.analyzers = [
      new CategorizerAnalyzer(ANALYZER_CONFIG.categorizer),
      new ActionExtractorAnalyzer(ANALYZER_CONFIG.actionExtractor),
      new ClientTaggerAnalyzer(ANALYZER_CONFIG.clientTagger),
    ].filter(a => a.config.enabled);
  }
  
  async process(email: Email, userContext: UserContext): Promise<ProcessingResult> {
    logger.info('Processing email', { 
      emailId: email.id, 
      analyzers: this.analyzers.length 
    });
    
    const startTime = Date.now();
    
    // Run all analyzers in parallel for speed
    const results = await Promise.allSettled(
      this.analyzers.map(analyzer => 
        this.runAnalyzer(analyzer, email, userContext)
      )
    );
    
    // Aggregate results
    const analysisData = this.aggregateResults(results);
    
    // Save to database
    await this.saveAnalysis(email.id, analysisData);
    
    // Extract actions if needed
    if (analysisData.action_extraction?.has_action) {
      await this.createAction(email, analysisData.action_extraction);
    }
    
    // Update email categorization
    await this.updateEmailCategory(email.id, analysisData.categorization);
    
    logger.info('Email processing complete', {
      emailId: email.id,
      totalTime: Date.now() - startTime,
      tokensUsed: analysisData.total_tokens,
    });
    
    return {
      success: true,
      analysisData,
      processingTimeMs: Date.now() - startTime,
    };
  }
  
  private async runAnalyzer(
    analyzer: BaseAnalyzer, 
    email: Email,
    userContext: UserContext
  ): Promise<AnalyzerResult> {
    try {
      // Add user context (clients, preferences) to analysis
      const enrichedEmail = { ...email, userContext };
      return await analyzer.analyze(enrichedEmail);
    } catch (error) {
      logger.error(`Analyzer ${analyzer.name} failed`, { error });
      return {
        success: false,
        data: {},
        confidence: 0,
        tokensUsed: 0,
        processingTimeMs: 0,
        error: error.message,
      };
    }
  }
}
```

### Batch Processing

For efficiency with 200-300 emails/day:

```typescript
// services/processors/batch-processor.ts
export class BatchProcessor {
  async processBatch(emails: Email[], batchSize = 10): Promise<void> {
    logger.info('Starting batch processing', { 
      totalEmails: emails.length,
      batchSize,
    });
    
    // Process in chunks to avoid overwhelming API
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      
      logger.debug('Processing batch', {
        batchNumber: Math.floor(i / batchSize) + 1,
        batchSize: batch.length,
      });
      
      // Process batch in parallel
      await Promise.all(
        batch.map(email => emailProcessor.process(email, userContext))
      );
      
      // Small delay to avoid rate limits
      await this.delay(100);
    }
    
    logger.info('Batch processing complete', {
      totalProcessed: emails.length,
    });
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

## Cost Optimization Strategies

### 1. Skip Re-Analysis
```typescript
// Don't analyze if already analyzed
if (email.analyzed_at) {
  logger.debug('Skipping already-analyzed email', { emailId: email.id });
  return;
}
```

### 2. Tiered Processing
```typescript
// Use cheaper models for obvious cases
const getModel = (email: Email) => {
  // Obvious spam/promo → fastest/cheapest model
  if (email.gmail_labels.includes('SPAM') || email.gmail_labels.includes('PROMOTIONS')) {
    return 'gpt-4o-mini';
  }
  
  // Client emails → might need more sophisticated analysis
  if (knownClientDomains.includes(extractDomain(email.sender_email))) {
    return 'gpt-4o'; // More expensive but more accurate
  }
  
  return 'gpt-4o-mini'; // Default
};
```

### 3. Caching Common Patterns
```typescript
// Cache sender patterns
const senderCache = new Map<string, CategoryResult>();

if (senderCache.has(email.sender_email)) {
  logger.debug('Using cached category', { sender: email.sender_email });
  return senderCache.get(email.sender_email);
}
```

### 4. Batch API Calls
```typescript
// Instead of one email at a time, send multiple in single request
// (when the model/provider supports it)
```

## Error Handling & Resilience

### Failure Strategy: Mark as Unanalyzable (No Retry on Next Sync)

When AI analysis fails, we **do not retry on subsequent syncs**. Instead, we mark the email
with the error reason. This provides a clear audit trail and prevents wasted API costs on
emails that consistently fail.

```typescript
// If analysis fails after retries within the same sync, mark as unanalyzable
async function handleAnalysisFailure(emailId: string, error: Error): Promise<void> {
  logger.error('Analysis failed permanently', {
    emailId,
    error: error.message,
    // This email will NOT be retried on next sync
  });

  await supabase
    .from('emails')
    .update({
      analysis_error: error.message,
      analyzed_at: new Date().toISOString(), // Mark as "processed" even though failed
    })
    .eq('id', emailId);
}
```

### Retry Logic (Within Same Sync Only)

We retry API calls within the same sync operation, but once marked as failed, we don't
retry on subsequent hourly syncs:

```typescript
async analyzeWithRetry(email: Email, maxRetries = 3): Promise<AnalyzerResult> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await this.analyze(email);
    } catch (error) {
      logger.warn('Analysis attempt failed', {
        attempt,
        maxRetries,
        error: error.message
      });

      if (attempt === maxRetries) {
        // Don't throw - mark as unanalyzable instead
        await handleAnalysisFailure(email.id, error);
        return { success: false, error: error.message };
      }

      // Exponential backoff between retries
      await this.delay(1000 * Math.pow(2, attempt - 1));
    }
  }
}
```

### Graceful Degradation
```typescript
// If an analyzer fails, continue with others
const results = await Promise.allSettled(analyzerPromises);

results.forEach((result, index) => {
  if (result.status === 'rejected') {
    logger.error('Analyzer failed', {
      analyzer: analyzers[index].name,
      error: result.reason,
    });
    // Still save partial results from successful analyzers
  }
});
```

## Testing Analyzers

### Unit Test Example
```typescript
// __tests__/analyzers/action-extractor.test.ts
describe('ActionExtractorAnalyzer', () => {
  const analyzer = new ActionExtractorAnalyzer(testConfig);
  
  it('should detect action in request email', async () => {
    const email = {
      subject: 'Can you review this proposal?',
      body_text: 'Hi, please review the attached proposal by Friday.',
      sender_email: 'client@example.com',
    };
    
    const result = await analyzer.analyze(email);
    
    expect(result.success).toBe(true);
    expect(result.data.has_action).toBe(true);
    expect(result.data.action_type).toBe('review');
    expect(result.data.urgency_score).toBeGreaterThan(5);
  });
  
  it('should not detect action in FYI email', async () => {
    const email = {
      subject: 'FYI: Project update',
      body_text: 'Just wanted to keep you in the loop on project status.',
      sender_email: 'teammate@example.com',
    };
    
    const result = await analyzer.analyze(email);
    
    expect(result.success).toBe(true);
    expect(result.data.has_action).toBe(false);
  });
});
```

### Integration Test
```typescript
// __tests__/processors/email-processor.test.ts
describe('EmailProcessor', () => {
  it('should process email through all analyzers', async () => {
    const processor = new EmailProcessor();
    const result = await processor.process(testEmail, testUserContext);
    
    expect(result.success).toBe(true);
    expect(result.analysisData).toHaveProperty('categorization');
    expect(result.analysisData).toHaveProperty('action_extraction');
    expect(result.analysisData).toHaveProperty('client_tagging');
  });
});
```

## Logging Best Practices

Every analyzer logs:
```typescript
// Start of analysis
this.log('debug', 'Starting analysis', { emailId, sender });

// Key decisions
this.log('info', 'Categorized as action_required', { 
  emailId, 
  confidence: 0.95 
});

// Token usage for cost tracking
this.log('info', 'Analysis complete', {
  emailId,
  tokensUsed: 150,
  cost: 0.0002,
});

// Errors with context
this.log('error', 'API call failed', {
  emailId,
  error: error.message,
  attempt: 2,
});
```

### 4. Event Detector Analyzer (NEW Jan 2026)

**Purpose:** Extract rich event details for calendar integration

**When It Runs:** ONLY when Categorizer returns `category === 'event'` (conditional execution saves tokens)

**Function Schema:**
```typescript
{
  name: 'detect_event',
  description: 'Extracts detailed event information from an email for calendar integration',
  parameters: {
    type: 'object',
    properties: {
      has_event: { type: 'boolean' },
      event_title: { type: 'string', description: 'Name of the event' },
      event_date: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
      event_time: { type: 'string', description: '24-hour time (HH:MM)' },
      event_end_time: { type: 'string', description: 'End time if known' },
      location_type: {
        type: 'string',
        enum: ['in_person', 'virtual', 'hybrid', 'unknown'],
      },
      location: { type: 'string', description: 'Physical address or video link' },
      registration_deadline: { type: 'string', description: 'RSVP deadline (ISO date)' },
      rsvp_required: { type: 'boolean' },
      rsvp_url: { type: 'string', description: 'Registration URL' },
      organizer: { type: 'string', description: 'Who is hosting' },
      cost: { type: 'string', description: 'Price info (e.g., "Free", "$25")' },
      additional_details: { type: 'string', description: 'Parking, dress code, etc.' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: ['has_event', 'event_title', 'event_date', 'location_type', 'rsvp_required', 'confidence'],
  },
}
```

**Output Example:**
```json
{
  "has_event": true,
  "event_title": "Milwaukee Tech Meetup: AI in Production",
  "event_date": "2026-01-25",
  "event_time": "18:00",
  "event_end_time": "20:00",
  "location_type": "in_person",
  "location": "123 Main St, Milwaukee, WI 53211",
  "registration_deadline": "2026-01-23",
  "rsvp_required": true,
  "rsvp_url": "https://mketech.org/rsvp",
  "organizer": "MKE Tech Community",
  "cost": "Free",
  "confidence": 0.95
}
```

**Cost:** ~$0.0002 per event email (only runs on ~5-10% of emails)

---

## Background Jobs

### Priority Reassessment Job (NEW Jan 2026)

**Purpose:** Periodically recalculate priorities based on evolving factors

**Schedule:** Runs 2-3 times daily (recommended: 6 AM, 12 PM, 5 PM)

**Factors Applied:**

| Factor | Description | Multiplier Range |
|--------|-------------|------------------|
| Deadline Proximity | Items with approaching deadlines get boosted | 1.0x - 2.0x |
| Client Importance | VIP clients get higher baseline priority | 1.0x - 1.5x |
| Staleness | Old unactioned items surface for attention | 1.0x - 1.3x |

**Formula:** `final_priority = base_urgency * deadline_factor * client_factor * staleness_factor`

**Usage:**
```typescript
import { reassessPrioritiesForAllUsers } from '@/services/jobs';

// In cron job
await reassessPrioritiesForAllUsers();
```

---

### 5. Contact Enricher Analyzer (ENHANCED Jan 2026)

**Purpose:** Extract contact metadata from signatures AND classify sender type

> **NEW (Jan 2026):** Now also classifies sender_type to distinguish real contacts from newsletters/broadcasts.

**When It Runs:** Selectively - only for contacts that need enrichment:
- Contact has extraction_confidence IS NULL (never enriched)
- OR extraction_confidence < 0.5 (low quality)
- OR last_extracted_at > 30 days ago (stale)
- AND contact has 3+ emails (worth the token cost)

**Sender Type Classification:**

The key insight: `relationship_type` (client, friend) and `sender_type` (direct, broadcast) are orthogonal:
- `sender_type`: HOW does this sender communicate? (one-to-one vs one-to-many)
- `relationship_type`: WHO is this person? (only meaningful for direct contacts)

| Sender Type | Description | Examples |
|-------------|-------------|----------|
| `direct` | Real person who knows you | Colleague, client, friend |
| `broadcast` | Newsletter/marketing (one-to-many) | Substack, company updates |
| `cold_outreach` | Targeted but no relationship | Sales, recruiter, PR |
| `opportunity` | Mailing list with optional response | HARO, job boards |
| `unknown` | Cannot determine | Needs more data |

**Detection Priority:**
1. **Headers** (highest confidence): List-Unsubscribe, ESP detection
2. **Email pattern**: noreply@, @substack.com, newsletter@
3. **Content analysis**: "View in browser", unsubscribe links
4. **AI analysis**: When signals are ambiguous

**Function Schema:**
```typescript
{
  name: 'enrich_contact',
  parameters: {
    type: 'object',
    properties: {
      has_enrichment: { type: 'boolean' },
      company: { type: 'string' },
      job_title: { type: 'string' },
      phone: { type: 'string' },
      linkedin_url: { type: 'string' },
      relationship_type: { type: 'string', enum: ['client', 'colleague', 'vendor', ...] },
      source: { type: 'string', enum: ['signature', 'email_body', 'both'] },
      confidence: { type: 'number' },
      // NEW FIELDS (Jan 2026)
      sender_type: { type: 'string', enum: ['direct', 'broadcast', 'cold_outreach', 'opportunity', 'unknown'] },
      broadcast_subtype: { type: 'string', enum: ['newsletter_author', 'company_newsletter', 'digest_service', 'transactional'] },
      sender_type_confidence: { type: 'number' },
      sender_type_reasoning: { type: 'string' },
    },
    required: ['has_enrichment', 'source', 'confidence', 'sender_type', 'sender_type_confidence'],
  },
}
```

**Key Prompt Guidance for Sender Type:**
```
BE SKEPTICAL of personal-looking sender names. Many marketing emails use
"Sarah from Acme" to feel personal, but Sarah doesn't know the recipient.
If newsletter signals are present (unsubscribe link, view in browser, etc.),
classify as 'broadcast' even if the sender name looks like a person.
```

**Impact on UI:**
- Contacts page defaults to `sender_type = 'direct'` (real contacts)
- "Subscriptions" tab shows `sender_type = 'broadcast'`
- Stats API returns counts by sender_type for tab badges

**Cost:** ~$0.0003 per email (runs selectively, maybe 5-10% of contacts)

---

### 6. Sender Type Detector (Pre-AI Utility)

**Purpose:** Fast pattern-based sender type detection before AI analysis

**Location:** `src/services/sync/sender-type-detector.ts`

This utility provides:
1. **Header-based detection**: Checks List-Unsubscribe, ESP patterns
2. **Email pattern detection**: Known domains (@substack.com) and prefixes (noreply@)
3. **Content pattern detection**: "View in browser", unsubscribe links

**Usage:**
```typescript
import { senderTypeDetector } from '@/services/sync/sender-type-detector';

const result = senderTypeDetector.detect({
  senderEmail: 'newsletter@substack.com',
  subject: 'Weekly Update',
  bodyText: 'Click here to unsubscribe...',
});

// result.senderType = 'broadcast'
// result.broadcastSubtype = 'newsletter_author'
// result.confidence = 0.95
// result.source = 'email_pattern'
```

**Why Pre-AI Detection?**
- Saves tokens by catching obvious cases
- Header-based detection is more reliable than AI
- Provides initial classification that AI can refine

---

## Phase 2+ Analyzer Additions

Future analyzers to add (same pattern):
- **URLExtractorAnalyzer**: Find and categorize URLs in email
- **ContentOpportunityAnalyzer**: Detect tweet ideas, networking chances
- **UnsubscribeAnalyzer**: Suggest newsletters to unsubscribe from
- **SentimentAnalyzer**: Detect client relationship health

All follow the same BaseAnalyzer pattern, making them easy to add/remove/modify independently.

---

## Analyzer Execution Flow (ENHANCED Jan 2026)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        EMAIL PROCESSING PIPELINE (ENHANCED Jan 2026)                      │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  PHASE 1: Core Analyzers (run in parallel)                                               │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│  │ Categorizer │ │  Content    │ │   Action    │ │   Client    │ │    Date     │       │
│  │             │ │   Digest    │ │  Extractor  │ │   Tagger    │ │  Extractor  │       │
│  │ + category  │ │  (NEW)      │ │ (ENHANCED)  │ │             │ │             │       │
│  │ + labels    │ │ + gist      │ │ + MULTIPLE  │ │             │ │ deadlines,  │       │
│  │ + summary   │ │ + keyPoints │ │   actions!  │ │             │ │ payments    │       │
│  │   has_event │ │ + links     │ │ + priority  │ │             │ │             │       │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘       │
│         │               │               │               │               │               │
│         └───────────────┴───────────────┴───────────────┴───────────────┘               │
│                                         │                                                │
│                                         ▼                                                │
│  PHASE 2: Conditional Analyzers                                                          │
│              ┌───────────────┐                                                           │
│              │ labels include│                                                           │
│              │  'has_event'? │                                                           │
│              └───────┬───────┘                                                           │
│                      │                                                                   │
│           ┌─────────┴─────────┐                                                         │
│           │ YES               │ NO                                                       │
│           ▼                   ▼                                                          │
│    ┌─────────────┐     ┌───────────┐                                                    │
│    │    Event    │     │   Skip    │                                                    │
│    │  Detector   │     │  (save $) │                                                    │
│    │             │     └───────────┘                                                    │
│    │ + locality  │                                                                       │
│    │ + location  │     Note: ContentDigest extracts CONTENT substance                   │
│    │ + RSVP info │           EventDetector extracts EVENT logistics                     │
│    └──────┬──────┘           Both run for event emails - complementary!                 │
│           │                                                                              │
│           ▼                                                                              │
│  PHASE 3: Save Results                                                                   │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │                                                                                   │  │
│  │  ┌─────────────────────────┐              ┌─────────────────────────┐            │  │
│  │  │ email_analyses (JSONB)  │              │    extracted_dates      │            │  │
│  │  │                         │              │                         │            │  │
│  │  │ - categorization        │              │ DateExtractor results:  │            │  │
│  │  │ - content_digest (NEW)  │              │ - deadlines, payments   │            │  │
│  │  │ - action_extraction     │              │                         │            │  │
│  │  │   (now multi-action!)   │              │ EventDetector results:  │            │  │
│  │  │ - client_tagging        │              │ - date_type: 'event'    │            │  │
│  │  │ - event_detection       │              │ - event_metadata        │            │  │
│  │  └─────────────────────────┘              └─────────────────────────┘            │  │
│  │                                                                                   │  │
│  │  ┌─────────────────────────┐                                                     │  │
│  │  │ emails table (denorm)   │                                                     │  │
│  │  │                         │                                                     │  │
│  │  │ + gist (NEW)            │   ← Fast list display without JOIN                  │  │
│  │  │ + key_points (NEW)      │                                                     │  │
│  │  │ + summary               │                                                     │  │
│  │  │ + category, labels      │                                                     │  │
│  │  └─────────────────────────┘                                                     │  │
│  └───────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Event Data Flow (Jan 2026 Update)

Events now flow through a two-part storage system:

1. **EventDetector** extracts rich event data when Categorizer labels email with `has_event`
2. **email_analyses.event_detection** stores the full JSONB for debugging/history
3. **extracted_dates** stores a simplified record with `date_type='event'` + `event_metadata`
4. **Events page** queries `extracted_dates` where `date_type='event'`
5. **EventCard** displays rich data from `event_metadata` (locality badges, location, RSVP)

**Key Design Decision**: Store rich metadata in `event_metadata` JSONB to avoid JOINs.
The Events page only queries `extracted_dates`, not `email_analyses`.

**UI/UX Routing Logic**:
- Full events (`isKeyDate=false`) → `date_type='event'` → Events page
- Open houses (`isKeyDate=true`, `keyDateType='open_house'`) → `date_type='event'` (you attend them)
- Other key dates (registration deadlines) → `date_type='deadline'` → Hub/Timeline only
