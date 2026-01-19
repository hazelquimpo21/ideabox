# Enhanced Email Intelligence System

## Overview

This document describes the enhanced email intelligence system for IdeaBox, including:
- **User Context**: Foundational info collected during onboarding for personalized AI analysis
- **Multi-Label Categories**: Primary category + secondary labels for flexible filtering
- **Contact Intelligence**: Auto-populated contacts with AI-enriched metadata
- **Date Extraction**: Timeline intelligence for upcoming deadlines, birthdays, and events
- **Enhanced Hub**: Unified "Next 3-5 Things" view

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EMAIL PROCESSING PIPELINE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         USER CONTEXT                                  │  │
│  │  (role, priorities, VIPs, location, interests, projects)             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐    │
│  │ Categorizer │   │   Action    │   │   Client    │   │    Date     │    │
│  │             │   │  Extractor  │   │   Tagger    │   │  Extractor  │    │
│  │ + labels    │   │             │   │             │   │   (NEW)     │    │
│  │ + summary   │   │             │   │             │   │             │    │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘    │
│         │                 │                 │                 │            │
│         └────────────┬────┴────────────────┴─────────────────┘            │
│                      │                                                     │
│           ┌─────────┴─────────┐                                           │
│           │ category='event'? │                                           │
│           └─────────┬─────────┘                                           │
│                     │                                                      │
│          ┌──────────┴──────────┐                                          │
│          │ YES                 │ NO                                        │
│          ▼                     ▼                                           │
│   ┌─────────────┐       ┌───────────┐                                     │
│   │    Event    │       │   Skip    │                                     │
│   │  Detector   │       │           │                                     │
│   └──────┬──────┘       └─────┬─────┘                                     │
│          │                    │                                            │
│          └────────┬───────────┘                                           │
│                   │                                                        │
│                   ▼                                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                    CONTACT ENRICHMENT (Selective)                     │ │
│  │     Runs when: new contact OR low confidence OR 30+ days stale       │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                   │                                                        │
│                   ▼                                                        │
│           ┌───────────────┐                                               │
│           │  Save to DB   │                                               │
│           │  - emails     │                                               │
│           │  - analyses   │                                               │
│           │  - contacts   │                                               │
│           │  - dates      │                                               │
│           └───────────────┘                                               │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

## Database Schema

### New Tables

#### 1. `user_context` - Foundational User Information

Stores user preferences and context collected during onboarding. This data is injected
into AI prompts to provide personalized analysis.

```sql
CREATE TABLE user_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Professional identity
  role TEXT,                    -- "Developer", "Entrepreneur", "Manager"
  company TEXT,                 -- "Self-employed", "Acme Corp"
  industry TEXT,                -- "Tech", "Healthcare", "Education"

  -- Location (for event relevance)
  location_city TEXT,           -- "Shorewood, WI"
  location_metro TEXT,          -- "Milwaukee metro"

  -- Priorities (ordered by importance)
  priorities TEXT[],            -- ['Client work', 'Family', 'Learning']

  -- Projects (for client/project tagging)
  projects TEXT[],              -- ['PodcastPipeline', 'IdeaBox']

  -- VIPs (for priority scoring)
  vip_emails TEXT[],            -- ['boss@company.com']
  vip_domains TEXT[],           -- ['@importantclient.com']

  -- Interests (for content relevance)
  interests TEXT[],             -- ['AI', 'TypeScript', 'local events']

  -- Family context (for personal categorization)
  family_context JSONB,         -- {"spouse": "Kim", "kids_count": 2}

  -- Work schedule
  work_hours_start TIME DEFAULT '09:00',
  work_hours_end TIME DEFAULT '17:00',
  work_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5],

  -- Onboarding state
  onboarding_completed BOOLEAN DEFAULT FALSE,
  onboarding_step INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);
```

#### 2. `contacts` - Auto-Populated Contact Intelligence

Automatically populated from email metadata, enriched by AI analysis.

```sql
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,

  -- Basic info (auto-populated)
  name TEXT,

  -- Communication stats (auto-calculated)
  email_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  received_count INTEGER DEFAULT 0,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  last_user_reply_at TIMESTAMPTZ,
  avg_response_hours DECIMAL(10,2),

  -- AI-extracted info
  company TEXT,
  job_title TEXT,
  relationship_type TEXT,       -- 'client', 'colleague', 'vendor', 'friend', 'family'

  -- Personal dates
  birthday DATE,
  work_anniversary DATE,

  -- Flags
  is_vip BOOLEAN DEFAULT FALSE,
  is_muted BOOLEAN DEFAULT FALSE,

  -- Extraction metadata
  extraction_confidence DECIMAL(3,2),
  last_extracted_at TIMESTAMPTZ,
  extraction_source TEXT,       -- 'signature', 'email_body', 'manual'

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, email)
);
```

#### 3. `extracted_dates` - Timeline Intelligence

Stores dates extracted from emails for the Hub timeline view.

```sql
CREATE TABLE extracted_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_id UUID REFERENCES emails(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,

  -- Date information
  date_type TEXT NOT NULL,      -- 'deadline', 'birthday', 'payment_due', etc.
  date DATE NOT NULL,
  time TIME,
  end_date DATE,
  end_time TIME,

  -- Context
  title TEXT NOT NULL,
  description TEXT,

  -- Recurrence
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_pattern TEXT,      -- 'daily', 'weekly', 'monthly', 'yearly'

  -- Metadata
  confidence DECIMAL(3,2),
  source_snippet TEXT,          -- Original text that contained the date

  -- Hub display
  priority_score INTEGER DEFAULT 5,
  is_acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Modified Tables

#### `email_analyses` - Add Labels Array

```sql
-- The categorization JSONB column now includes a 'labels' array:
{
  "category": "action_required",
  "labels": ["needs_reply", "has_deadline", "from_vip"],
  "summary": "...",
  "quick_action": "respond",
  "confidence": 0.92,
  "reasoning": "...",
  "topics": ["billing", "q1"]
}
```

## Analyzer Updates

### 1. Enhanced Categorizer (Multi-Label)

**New Labels Taxonomy:**

| Category | Label | Description |
|----------|-------|-------------|
| Action | `needs_reply` | Someone is waiting for a response |
| Action | `needs_decision` | User must choose between options |
| Action | `needs_review` | Content requires user's review |
| Action | `needs_approval` | Approval/sign-off requested |
| Urgency | `urgent` | Marked urgent or ASAP |
| Urgency | `has_deadline` | Specific deadline mentioned |
| Urgency | `time_sensitive` | Time-limited offer/opportunity |
| Relationship | `from_vip` | Sender is on VIP list |
| Relationship | `new_contact` | First email from this sender |
| Relationship | `networking_opportunity` | Potential valuable connection |
| Content | `has_attachment` | Email has attachments |
| Content | `has_link` | Contains important links |
| Content | `has_question` | Direct question asked |
| Location | `local_event` | Event in user's metro area |
| Personal | `family_related` | Involves family members |
| Personal | `community` | Local community related |
| Financial | `invoice` | Invoice or bill |
| Financial | `receipt` | Purchase confirmation |
| Financial | `payment_due` | Payment deadline |
| Calendar | `meeting_request` | Meeting invitation |
| Calendar | `rsvp_needed` | RSVP required |
| Calendar | `appointment` | Scheduled appointment |
| Learning | `educational` | Learning content |
| Learning | `industry_news` | Industry updates |
| Learning | `job_opportunity` | Job/career related |

### 2. DateExtractor Analyzer (NEW)

Extracts timeline-relevant dates from email content.

**Date Types:**
- `deadline` - Task/response deadlines
- `event` - Events (also handled by EventDetector)
- `appointment` - Scheduled appointments
- `payment_due` - Invoice/bill due dates
- `expiration` - Subscription/offer expirations
- `follow_up` - Suggested follow-up times
- `birthday` - Birthday mentions
- `anniversary` - Work/personal anniversaries
- `recurring` - Recurring events/meetings

### 3. ContactEnricher Analyzer (NEW)

Extracts contact metadata from email signatures and content.

**Extraction Fields:**
- Company name
- Job title/role
- Relationship type inference
- Birthday (if mentioned)
- Phone numbers (stored but not displayed)

**Selective Execution:**
Only runs when:
- Contact has `extraction_confidence` IS NULL
- OR `extraction_confidence` < 0.5
- OR `last_extracted_at` > 30 days ago
- AND contact has 3+ emails (worth the token cost)

## User Context Integration

### Onboarding Flow

**Step 1: Role & Company**
```
What's your primary role?
[ ] Developer/Engineer
[ ] Entrepreneur/Founder
[ ] Manager/Lead
[ ] Creative/Designer
[ ] Sales/Marketing
[ ] Other: _______

Company name (optional): _______
```

**Step 2: Priorities**
```
What are your top priorities? (Select up to 5, drag to reorder)
[ ] Client work
[ ] Business development
[ ] Team management
[ ] Learning & growth
[ ] Family & personal
[ ] Community involvement
[ ] Side projects
[ ] Networking
```

**Step 3: Projects**
```
What projects are you currently working on?
(These help us link emails to the right context)

Project 1: _______
Project 2: _______
Project 3: _______
[+ Add more]
```

**Step 4: VIP Contacts**
```
Who are your most important contacts?
(These get priority in your inbox)

Email or domain: _______
[+ Add more]

Examples: boss@company.com, @importantclient.com
```

**Step 5: Location**
```
Where are you based?
City: _______
Metro area: _______

This helps us surface relevant local events.
```

**Step 6: Interests**
```
What topics interest you? (Select all that apply)
[ ] AI/ML
[ ] Web Development
[ ] Business/Startups
[ ] Design
[ ] Local Events
[ ] Tech News
[ ] Open Source
[ ] Career/Jobs
```

**Step 7: Work Schedule**
```
When do you typically work?

Start time: [09:00 ▼]
End time:   [17:00 ▼]

Work days:
[x] Mon [x] Tue [x] Wed [x] Thu [x] Fri [ ] Sat [ ] Sun
```

### Prompt Enhancement

User context is injected into analyzer prompts:

```typescript
function buildCategorizerPrompt(userContext: UserContext): string {
  const parts = [
    `You are categorizing emails for ${userContext.role || 'a professional'}.`,
  ];

  if (userContext.location_city) {
    parts.push(`They are based in ${userContext.location_city}.`);
  }

  if (userContext.priorities?.length) {
    parts.push(`Their priorities are: ${userContext.priorities.join(', ')}.`);
  }

  if (userContext.vip_emails?.length || userContext.vip_domains?.length) {
    const vips = [...(userContext.vip_emails || []), ...(userContext.vip_domains || [])];
    parts.push(`VIP contacts (apply 'from_vip' label): ${vips.join(', ')}`);
  }

  if (userContext.projects?.length) {
    parts.push(`Active projects: ${userContext.projects.join(', ')}`);
  }

  if (userContext.location_metro) {
    parts.push(`Apply 'local_event' label for events in/near ${userContext.location_metro}.`);
  }

  return parts.join('\n');
}
```

## Hub Enhancement

### Data Sources

The Hub "Next 3-5 Things" aggregates from:

1. **Actions** - Pending actions with deadlines
2. **Events** - Upcoming events (7-day window)
3. **Extracted Dates** - Deadlines, payments due, expirations
4. **Contact Alerts** - Birthdays, unanswered emails from VIPs

### Scoring Algorithm

```typescript
interface HubItem {
  id: string;
  type: 'action' | 'event' | 'deadline' | 'birthday' | 'follow_up';
  title: string;
  description: string;
  date: Date;
  score: number;
  timeRemaining: string;
  source: 'action' | 'event' | 'extracted_date' | 'contact';
}

function scoreHubItem(item: HubItem, userContext: UserContext): number {
  let score = 10; // Base score

  const hoursUntil = (item.date.getTime() - Date.now()) / (1000 * 60 * 60);

  // Time urgency (exponential)
  if (hoursUntil < 0) score *= 3.0;      // Overdue
  else if (hoursUntil < 4) score *= 2.5;  // Critical
  else if (hoursUntil < 24) score *= 2.0; // Today
  else if (hoursUntil < 48) score *= 1.5; // Tomorrow

  // Type importance
  const typeMultipliers = {
    'action': 1.5,
    'deadline': 1.4,
    'event': 1.2,
    'birthday': 1.1,
    'follow_up': 1.0,
  };
  score *= typeMultipliers[item.type];

  // VIP boost
  if (item.isFromVip) score *= 1.5;

  return Math.min(100, score);
}
```

## Implementation Order

### Phase 1: Foundation (This PR)
1. Database migrations for new tables
2. User context service
3. Updated categorizer with labels
4. Date extractor analyzer

### Phase 2: Contact Intelligence
1. Contact auto-population from emails
2. Contact enricher analyzer
3. Contact frequency queries

### Phase 3: Hub Enhancement
1. Aggregate data sources
2. Enhanced scoring with extracted dates
3. Birthday/anniversary surfacing

### Phase 4: Onboarding UI
1. Multi-step onboarding wizard
2. Settings page for context editing
3. VIP management UI

## API Endpoints

### User Context

```
GET    /api/user/context          - Get user context
PUT    /api/user/context          - Update user context
POST   /api/user/context/onboarding - Complete onboarding step
```

### Contacts

```
GET    /api/contacts              - List contacts (with stats)
GET    /api/contacts/:id          - Get contact details
PUT    /api/contacts/:id          - Update contact (VIP, mute)
POST   /api/contacts/:id/enrich   - Trigger AI enrichment
```

### Hub

```
GET    /api/hub/items             - Get top 3-5 priority items
GET    /api/hub/timeline          - Get date-based timeline view
POST   /api/hub/items/:id/acknowledge - Mark item as acknowledged
```

## Cost Considerations

### Token Usage

| Analyzer | Runs | Est. Tokens | Cost/Email |
|----------|------|-------------|------------|
| Categorizer (enhanced) | Always | ~600 | $0.00018 |
| Action Extractor | Always | ~500 | $0.00015 |
| Client Tagger | Always | ~400 | $0.00012 |
| Date Extractor | Always | ~400 | $0.00012 |
| Event Detector | ~10% | ~600 | $0.00002 avg |
| Contact Enricher | ~5% | ~500 | $0.00001 avg |

**Total estimated cost: ~$0.0006/email** (vs current ~$0.0005/email)

### Optimization Strategies

1. **Batch date extraction** - Extract dates in categorizer response (saves a call)
2. **Selective contact enrichment** - Only enrich high-value contacts
3. **Cache user context** - Load once per session, not per email

## Migration Path

### For Existing Users

1. Run migration to create new tables
2. Backfill contacts from existing emails
3. Prompt existing users to complete onboarding
4. Gradually enrich contacts based on email count

### Data Backfill Script

```sql
-- Backfill contacts from existing emails
INSERT INTO contacts (user_id, email, name, email_count, first_seen_at, last_seen_at)
SELECT
  user_id,
  sender_email,
  MAX(sender_name),
  COUNT(*),
  MIN(date),
  MAX(date)
FROM emails
GROUP BY user_id, sender_email
ON CONFLICT (user_id, email) DO UPDATE SET
  email_count = EXCLUDED.email_count,
  last_seen_at = EXCLUDED.last_seen_at;
```

## Testing

### Unit Tests

- Categorizer label extraction
- Date parser accuracy
- Contact enrichment extraction
- Hub scoring algorithm

### Integration Tests

- Full email processing pipeline with new analyzers
- User context injection into prompts
- Hub aggregation from multiple sources

### Manual Testing Scenarios

1. Email with deadline → appears in Hub
2. Email from VIP → gets `from_vip` label
3. Event in user's city → gets `local_event` label
4. New contact → triggers enrichment after 3 emails
5. Birthday mention → creates extracted_date + updates contact
