# IdeaBox - Intelligent Email Intelligence System

## Vision
IdeaBox transforms email overwhelm into organized intelligence. It's an AI-powered email triage system that automatically categorizes emails, extracts actions, saves content opportunities, and provides business intelligence for busy professionals managing 200-300 emails daily across multiple accounts.

## Core Problem
- Multiple Gmail accounts generating 200-300 emails/day
- Client correspondence mixed with newsletters, events, promotions, and noise
- Valuable content (URLs, ideas, networking opportunities) buried in inbox
- Action items scattered across email threads
- Event invitations requiring manual calendar entry
- No unified view of client communications and project status
- Important context lost in email chaos

## Solution
AI-powered email processing system with specialized analyzers that:
- **Categorize by life-bucket** (REFACTORED Jan 2026): 12 categories representing what part of life the email touches:
  - **Work & Business**: `client_pipeline` (active client work), `business_work_general` (professional/work)
  - **Family & Personal**: `family_kids_school`, `family_health_appointments`, `personal_friends_family`
  - **Life Admin**: `finance`, `travel`, `shopping`, `local` (community/events)
  - **Information**: `newsletters_general`, `news_politics`, `product_updates`
- **Track client relationships**: Link emails to clients separately from categorization
- **Extract actions**: Build dedicated to-do list from email content
- **Save content**: URLs, tweet ideas, networking opportunities (Phase 2)
- **Detect events**: Auto-extract event details for calendar (Phase 2)
- **Sync to Gmail**: Create IdeaBox labels in Gmail for visibility
- **Learn continuously**: User preferences, client names, communication patterns
- **Provide intelligence**: Client health metrics, content trends, priority signals

## Target User: Hazel
**Profile:**
- Developer/entrepreneur with multiple clients and active projects
- Builds AI-powered applications (podcast pipelines, event discovery, content tools)
- Recently moved to Shorewood, WI with family
- Active in local community (zines, school events, Filipino culture)
- Strong focus on relationship-building and community connection

**Email Patterns:**
- 200-300 emails/day across multiple Gmail accounts
- Mix of: client work, project updates, local events, newsletters, family/school, networking
- Needs to extract: client tasks, content ideas, event listings, networking opportunities

**Success Looks Like:**
- Check actual Gmail once/day (or less)
- All client work organized in one place
- Content library grows automatically
- Never miss important events or deadlines
- Action items clear and prioritized
- Networking opportunities surfaced proactively

## Three-Phase Build Plan

### Phase 1: Core Email Intelligence (2-3 weeks)
**Goal:** Emails in, smart categorization out, basic actions

**Features:**
- Gmail OAuth + API integration
- Automatic email categorization
- Action item extraction
- Basic to-do list
- Client name association

**Pages:** Setup, Inbox View, Email Detail, Action List

**Success Metric:** Process a day's emails with intelligent sorting and 3-5 action items surfaced

### Phase 2: Client Hub + Content Intelligence (2-3 weeks)
**Goal:** Useful for actual workflow - clients and content curation

**Features:**
- Client dashboard per client
- Content library (URLs, tweet ideas)
- Events calendar with Google Calendar export
- Networking opportunity detection
- Enhanced email grouping by client/project

**Pages:** Client Dashboard, Content Library, Events Calendar

**Success Metric:** Manage client work through IdeaBox, content library grows automatically

### Phase 3: Intelligence & Polish (2 weeks)
**Goal:** Magical experience - learning, summaries, proactive insights

**Features:**
- Morning briefing/daily summaries
- Pattern detection (communication trends)
- Smart bundling of related emails
- Unsubscribe intelligence
- Batch operations
- Learning from user corrections

**Pages:** Dashboard/Home, Settings/Preferences

**Success Metric:** Trust IdeaBox enough to only check Gmail once/day

## Key User Stories

### Phase 1 Stories
1. "As a user, I connect my Gmail accounts and see my emails categorized automatically"
2. "As a user, I can see which emails need responses vs. which are FYI"
3. "As a user, I can mark an email as related to a specific client"
4. "As a user, I see a list of action items extracted from my emails"
5. "As a user, the system learns client names I add during onboarding"

### Phase 2 Stories
1. "As a user, I see all correspondence and tasks for Client X in one place"
2. "As a user, interesting URLs from emails are auto-saved and categorized"
3. "As a user, I see tweet ideas drafted from newsletter insights"
4. "As a user, I can review all upcoming events and send them to Google Calendar"
5. "As a user, newsletters good for networking are flagged with response angles"
6. "As a user, I can group emails by project (e.g., 'PodcastPipeline', 'HappenlistScraper')"

### Phase 3 Stories
1. "As a user, I get a morning briefing of priority items without opening the app"
2. "As a user, the system learns from my corrections and gets smarter"
3. "As a user, I see bundled emails about the same topic/project"
4. "As a user, I'm alerted when a client pattern changes (going quiet, increased frequency)"
5. "As a user, I can bulk-process similar emails (archive promos, save all URLs)"
6. "As a user, I see which newsletters I never read and get unsubscribe suggestions"

## Success Metrics

### Quantitative
- **Processing Speed**: 200-300 emails analyzed within 1 hour of receipt
- **Accuracy**: 85%+ correct categorization (measured by user corrections)
- **Action Extraction**: 90%+ of actionable emails generate to-do items
- **Event Detection**: 95%+ of calendar-worthy events caught
- **Cost Efficiency**: <$50/month in API costs

### Qualitative
- User checks actual Gmail ≤1x/day
- All client work managed through IdeaBox
- No missed important deadlines or events
- Content library actively referenced for work
- User feels "in control" of email rather than overwhelmed

## Non-Goals (For Now)
- Not replacing Gmail (it's an intelligence layer)
- Not doing AI-generated responses
- Not processing attachments in Phase 1
- Not supporting email providers other than Gmail
- Not a CRM (though has CRM-like features)

> **Note (Jan 2026):** Email composition/sending via Gmail API has been added.
> Features include: send, schedule, tracking, mail merge, follow-up automation.
> See `docs/GMAIL_SENDING_IMPLEMENTATION.md` for details.

## Design Principles
1. **Modular First**: Every component standalone and replaceable
2. **AI as Specialist**: Many focused analyzers > one general analyzer
3. **Learn Don't Dictate**: System adapts to user behavior
4. **Surface Don't Bury**: Intelligence visible, not hidden in algorithms
5. **Privacy Conscious**: User owns their data, clear about what's stored
6. **Cost Aware**: Efficient API usage, batch processing, smart caching

## Key Architectural Decisions (January 2026)

These decisions were made after careful analysis and should guide all implementation:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **AI Model** | GPT-4.1-mini only | Best value (~$3-5/month), optimized for function calling, 1M context |
| **No AI Fallback** | Single model | Fallback adds complexity without proportional benefit |
| **Categories** | Life-bucket system (12 categories) | Categories represent what part of life the email touches (work, family, admin, info) - REFACTORED Jan 2026 |
| **Client Tracking** | Via `client_id` + filtering | Cleaner than category; allows `client_pipeline` emails linked to specific clients |
| **Events** | Label-based (`has_event`) | Events are no longer a category - detected via labels, can appear in any life-bucket |
| **Urgency** | Score-based (1-10) | No separate "action_required" category; urgency tracked via score across all categories |
| **Background Jobs** | Supabase pg_cron + Edge Functions | Already using Supabase; avoids Vercel Cron limitations |
| **Gmail Labels** | Sync IdeaBox categories to Gmail | Users see categories in Gmail itself |
| **Failed Analysis** | Mark unanalyzable with reason | No retry; clear audit trail |
| **Body Truncation** | 16K characters | Balances comprehensiveness with cost |
| **Timezone** | Auto-detect from browser | Better UX than manual selection |
| **Log Retention** | 30-day cleanup | Prevents unbounded storage growth |
| **OAuth** | External app (testing mode) | Allows non-Workspace users during development |
