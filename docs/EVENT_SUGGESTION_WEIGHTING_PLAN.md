# Event Suggestion Weighting & Taxonomy Refinement Plan

> **STATUS: PHASES 1-3 IMPLEMENTED (March 2026)**
> Phases 1-3 (event taxonomy, commitment tiers, composite weight) are live.
> Phases 4-5 (preference learning, UI filters) remain future work.
> See `DECISIONS.md` (#32) for the architectural decision record.

---

## Problem Statement

The events tab surfaces everything the AI detects as an event — work meetings, webinars, community gatherings, civic meetings, concerts, deadlines — all treated roughly equally. The current `relevanceScore` (0-10) from the EventDetector is a good start but has gaps:

1. **No user feedback loop.** We track dismiss/maybe/saved_to_calendar states but don't feed them back into future scoring. A user who dismisses every webinar should stop seeing webinars ranked highly.
2. **No event type taxonomy.** We distinguish `isKeyDate` vs full event and have `locationType`/`locality`, but there's no structured `eventType` field (meeting vs webinar vs concert vs deadline). This makes it impossible to let users filter by what kind of event it is, or to learn preferences by type.
3. **Flat ranking within time groups.** Events are grouped by time period (today, this week, etc.) but within each group they're sorted by date, not by relevance. High-relevance local events sit next to mass-marketed webinars.
4. **No confidence/certainty signal.** A confirmed calendar invite from your boss and a "might be interesting" webinar from a newsletter both show up the same way.
5. **Work events aren't distinguished.** A mandatory team standup and a random industry webinar both come through email but need completely different treatment.

---

## Part 1: Event Type Taxonomy

### Current State
- `isKeyDate: boolean` + `keyDateType` (registration_deadline, open_house, deadline, release_date, other)
- `locationType` (in_person, virtual, hybrid, unknown)
- `eventLocality` (local, out_of_town, virtual)
- No structured event type/kind field

### Proposed Event Type Taxonomy

Add a new `eventType` field to event detection output:

| Event Type | Description | Examples | Default Weight |
|---|---|---|---|
| `meeting` | Scheduled meeting with specific people | Team standup, 1:1, client call, board meeting | 0.9 |
| `appointment` | Scheduled personal service | Doctor, dentist, haircut, car service, parent-teacher | 0.95 |
| `social` | Social gathering with people you know | Dinner party, birthday party, game night, reunion | 0.85 |
| `community` | Local community event | Neighborhood meetup, farmers market, block party, local workshop | 0.7 |
| `class_workshop` | Educational/skill-building | Pottery class, yoga session, coding bootcamp, cooking class | 0.75 |
| `conference` | Multi-session professional event | Tech conference, industry summit, trade show | 0.6 |
| `performance` | Arts/entertainment you attend | Concert, theater, comedy show, movie screening, gallery opening | 0.7 |
| `sports_event` | Sporting event (watching or playing) | Game, match, tournament, race, rec league | 0.65 |
| `webinar` | Online presentation, usually broadcast | Marketing webinar, product demo, "free masterclass" | 0.25 |
| `civic` | Government/institutional | City council, school board, HOA meeting, town hall, public hearing | 0.4 |
| `religious` | Faith/spiritual gathering | Service, holiday observance, study group | 0.6 |
| `fundraiser` | Charity/benefit events | Gala, charity run, auction, volunteer day | 0.5 |
| `deadline` | Date by which something must happen | Registration closes, application due, early bird ends | 0.7 |
| `release` | Something launches/becomes available | Product launch, ticket on-sale, book release, season premiere | 0.4 |
| `travel` | Travel-related date | Flight, hotel check-in, trip departure | 0.95 |
| `payment` | Financial due date | Bill due, subscription renewal, tax deadline | 0.8 |
| `birthday_anniversary` | Personal milestone | Birthday, anniversary, memorial | 0.85 |
| `other` | Doesn't fit above categories | Miscellaneous | 0.5 |

### Why This Matters
- Users can filter: "Show me only social events and community events"
- The system can learn: "This user dismisses every webinar but saves every community event"
- Different event types have fundamentally different default relevance
- The AI can make better inferences when it has a structured vocabulary

---

## Part 2: Certainty/Commitment Tiers

### Current State
- `saved_to_calendar` / `maybe` / `dismissed` states exist
- No concept of "confirmed" vs "invited" vs "FYI"
- No way to express how certain the user's attendance is

### Proposed Commitment Tiers

A new `commitmentLevel` field that captures the user's relationship to this event:

| Tier | Label | Description | Visual Treatment |
|---|---|---|---|
| `confirmed` | Going | User has confirmed, RSVP'd, or has tickets | Solid green badge, top of list |
| `calendar` | On Calendar | Added to calendar but no explicit RSVP | Blue calendar icon |
| `interested` | Interested | User marked "maybe" or showed interest | Star/yellow indicator |
| `invited` | Invited | Directly/personally invited but hasn't responded | Orange "invited" badge, action prompt |
| `suggested` | Suggested | AI detected and thinks user might care | Default — no special badge |
| `fyi` | FYI | Informational — user probably won't attend | Muted/gray, smaller card |
| `dismissed` | Dismissed | User explicitly said no | Hidden unless filter enabled |

### How Commitment Gets Set
- **Auto-detected by AI:** The EventDetector infers initial tier based on email signals:
  - `confirmed`: Email contains booking confirmation, ticket, RSVP confirmation
  - `invited`: Direct personal invitation with RSVP request
  - `fyi`: Bulk newsletter, mass webinar invite, "you might be interested"
  - `suggested`: Default for everything else
- **User overrides:** User actions upgrade/downgrade:
  - Click "Add to Calendar" → upgrades to `calendar`
  - Click "Maybe" → upgrades to `interested`
  - Click "Dismiss" → downgrades to `dismissed`
  - Future: "Going" button → upgrades to `confirmed`
  - Future: "Not interested" → downgrades to `dismissed`

### Sorting Impact
Within each time group, sort by: `commitmentLevel` tier (confirmed first) → then `compositeWeight` descending.

---

## Part 3: Composite Weight Algorithm

### Current State
The EventDetector generates a `relevanceScore` (0-10) based on locality, cost, interest match, sender relationship, and event type. This is a good foundation but it's:
- Generated at detection time only (never updated)
- Not informed by user behavior patterns
- Not integrated with the inbox scoring engine

### Proposed: Dynamic Composite Weight

A `compositeWeight` (0.0–1.0) that combines multiple signals and updates over time:

```
compositeWeight = (
    baseTypeWeight       * 0.15    // From event type taxonomy
  + commitmentBoost      * 0.20    // From commitment tier
  + relevanceScore       * 0.25    // From AI detection (normalized to 0-1)
  + senderWeight         * 0.15    // VIP/known contact boost
  + behaviorWeight       * 0.15    // Learned from user patterns
  + temporalUrgency      * 0.10    // Approaching deadline/RSVP
)
```

#### Component Breakdown

**1. Base Type Weight (0.15)**
From the event type taxonomy table above. A meeting gets 0.9, a webinar gets 0.25.

**2. Commitment Boost (0.20)**
| Tier | Boost |
|---|---|
| confirmed | 1.0 |
| calendar | 0.85 |
| interested | 0.7 |
| invited | 0.8 (high because action needed) |
| suggested | 0.4 |
| fyi | 0.15 |
| dismissed | 0.0 |

**3. Relevance Score (0.25)**
The existing AI-generated `relevanceScore` from EventDetector, normalized from 0-10 to 0.0-1.0.

**4. Sender Weight (0.15)**
| Signal | Weight |
|---|---|
| VIP contact | 1.0 |
| Known contact with history | 0.7 |
| Known contact (no history) | 0.5 |
| Organization user subscribes to | 0.3 |
| Unknown/mass sender | 0.1 |

**5. Behavior Weight (0.15)** — NEW, learned over time
Based on accumulated user actions for this event type + source pattern:

```typescript
// Pseudocode for behavior weight calculation
function calculateBehaviorWeight(eventType: string, senderDomain: string): number {
  // Look at last 90 days of user_event_states
  const typeStats = getStatsForEventType(eventType);
  const domainStats = getStatsForDomain(senderDomain);

  // Event type preference (70% of behavior weight)
  // If user saves 80% of community events → typePreference = 0.8
  // If user dismisses 90% of webinars → typePreference = 0.1
  const typePreference = typeStats.positiveRate; // (saved + maybe) / total

  // Sender domain preference (30% of behavior weight)
  // If user always saves events from meetup.com → domainPreference = high
  const domainPreference = domainStats.positiveRate;

  return typePreference * 0.7 + domainPreference * 0.3;
}
```

**Positive actions:** saved_to_calendar, maybe, clicked RSVP link
**Negative actions:** dismissed
**Neutral:** no action (decays slightly toward negative over time for stale events)

**6. Temporal Urgency (0.10)**
From the existing scoring engine's date proximity curve:
| Time Until Event | Urgency |
|---|---|
| Past | 0.0 |
| Today | 1.0 |
| Tomorrow | 0.9 |
| 2-3 days | 0.7 |
| 4-7 days | 0.5 |
| 1-2 weeks | 0.3 |
| 2+ weeks | 0.1 |

Special boost: If RSVP deadline is approaching, urgency += 0.2 (capped at 1.0).

---

## Part 4: Smarter AI Detection

### Current Gaps in the EventDetector Prompt

1. **Webinar spam detection is weak.** The categorizer flags `webinar_invite` as a noise label, but the EventDetector still extracts and surfaces them. Need coordination.
2. **Work meetings aren't contextualized.** The detector doesn't know if an email is about YOUR meeting (you're invited) vs. someone else's meeting notes.
3. **Newsletter event roundups need quality filtering.** MultiEventDetector extracts up to 10 events from roundups, but most may be irrelevant. Need per-event relevance thresholds.
4. **No "is this actually for me?" check.** An email about a conference in Tokyo shouldn't rank the same as a local meetup, even if both are "events."

### Proposed Prompt Enhancements

#### A. Add `eventType` to extraction output
Update both EventDetector and MultiEventDetector prompts to output `eventType` from the taxonomy above.

#### B. Add `commitmentLevel` inference
Teach the detector to infer initial commitment:
```
COMMITMENT INFERENCE RULES:
- Email contains "your reservation is confirmed" / "your tickets" / "you're registered" → confirmed
- Email is a direct invitation with RSVP link addressed to user → invited
- Email is a newsletter with "upcoming events" section → fyi
- Email is about a meeting user is explicitly included in (To/CC) → invited
- Email is a mass webinar invite → fyi
- Everything else → suggested
```

#### C. Add relevance threshold for multi-events
In MultiEventDetector, add instruction:
```
For each event, assess relevanceScore honestly.
Events with relevanceScore < 3 should be marked as eventType="other" and commitmentLevel="fyi".
This prevents low-quality events from cluttering the calendar.
```

#### D. Better work meeting detection
Add to EventDetector prompt:
```
WORK MEETING SIGNALS:
- Calendar invite format (ICS attachment, "Join Zoom/Teams/Meet" link)
- Sent to specific recipients (not a mailing list)
- Contains agenda, dial-in info, meeting ID
- Recurring meeting language ("weekly standup", "monthly review")
- From someone in user's organization (same domain)

If this looks like a work meeting the user is part of:
  eventType = "meeting"
  commitmentLevel = "invited" (or "confirmed" if user already accepted)
  relevanceScore = 8-10
```

---

## Part 5: User Feedback Loop

### Current State
- `user_event_states` table stores dismiss/maybe/saved_to_calendar
- These states filter the UI but don't inform future scoring

### Proposed: Preference Learning System

#### A. New `user_event_preferences` table

```sql
CREATE TABLE user_event_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What this preference is about
  preference_type TEXT NOT NULL CHECK (preference_type IN (
    'event_type',      -- e.g., "I don't care about webinars"
    'sender_domain',   -- e.g., "I love events from meetup.com"
    'category',        -- e.g., "I care about local events"
    'keyword'          -- e.g., "AI/ML events interest me"
  )),

  -- The specific value
  preference_key TEXT NOT NULL,  -- e.g., "webinar", "meetup.com", "local"

  -- Accumulated score (-1.0 to 1.0)
  -- Positive = user likes these, Negative = user dislikes these
  preference_score REAL NOT NULL DEFAULT 0.0,

  -- Raw counters for transparency
  positive_count INT NOT NULL DEFAULT 0,   -- saved, maybe, calendar
  negative_count INT NOT NULL DEFAULT 0,   -- dismissed
  total_count INT NOT NULL DEFAULT 0,      -- total seen

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, preference_type, preference_key)
);
```

#### B. Preference Update Trigger

When a user takes action on an event (via `/api/events/[id]/state`):

```typescript
async function updatePreferences(userId: string, event: EventData, action: EventState) {
  const weight = ACTION_WEIGHTS[action]; // saved_to_calendar=+1.0, maybe=+0.5, dismissed=-1.0

  // Update event type preference
  if (event.event_metadata?.eventType) {
    await upsertPreference(userId, 'event_type', event.event_metadata.eventType, weight);
  }

  // Update sender domain preference
  if (event.emails?.sender_email) {
    const domain = event.emails.sender_email.split('@')[1];
    await upsertPreference(userId, 'sender_domain', domain, weight);
  }

  // Update category preference (from the source email's category)
  if (event.source_category) {
    await upsertPreference(userId, 'category', event.source_category, weight);
  }
}

function upsertPreference(userId, type, key, weight) {
  // Exponential moving average so recent actions matter more
  // new_score = old_score * 0.9 + weight * 0.1
  // This naturally decays old preferences while respecting new signals
}
```

#### C. Preference Score → Behavior Weight

```typescript
function getBehaviorWeight(userId: string, event: EventData): number {
  const typeScore = getPreferenceScore(userId, 'event_type', event.eventType) ?? 0;
  const domainScore = getPreferenceScore(userId, 'sender_domain', senderDomain) ?? 0;
  const categoryScore = getPreferenceScore(userId, 'category', sourceCategory) ?? 0;

  // Normalize from [-1, 1] to [0, 1]
  const normalize = (s: number) => (s + 1) / 2;

  return (
    normalize(typeScore) * 0.5 +
    normalize(domainScore) * 0.3 +
    normalize(categoryScore) * 0.2
  );
}
```

---

## Part 6: UI Changes

### A. Event Card Enhancements

1. **Commitment badge:** Show colored badge (Going / On Calendar / Interested / Invited / FYI)
2. **Event type icon:** Small icon indicating meeting, social, webinar, etc.
3. **"Why this event" tooltip:** Show the `whyAttend` text on hover
4. **Quick actions refined:**
   - Current: Dismiss / Maybe / Add to Calendar
   - Add: "Going" button (for confirmed attendance)
   - Add: "Not for me" (stronger than dismiss — feeds preference learning with extra weight)

### B. Event Filters

Add filter bar to events page:
- **By type:** Meeting / Social / Community / Webinar / Deadline / All
- **By commitment:** Going / Interested / Suggested / All
- **By source:** Work / Personal / Newsletter / All

### C. Relevance Indicator

Replace the current simple green dot (relevanceScore >= 7) with a more nuanced display:
- Show compositeWeight as a small relevance bar or heat indicator
- High relevance (>0.7): Prominent card, full details shown
- Medium relevance (0.4-0.7): Standard card
- Low relevance (<0.4): Compact/collapsed card, expandable

### D. "Teach Me" Interactions

After dismissing 3+ events of the same type, prompt:
> "You've dismissed several webinar invites. Want me to auto-minimize future webinars?"
> [Yes, minimize them] [No, keep showing them]

This creates an explicit preference override (sets preference_score to -0.8 for that type).

---

## Part 7: Integration with Existing Scoring Engine

### Bridge Between Event Weight and Inbox Priority

The inbox scoring engine already computes `surface_priority` for emails. Events detected from those emails should inherit and extend that score:

```
event.compositeWeight = computeCompositeWeight(event);
email.surface_priority = max(email.surface_priority, event.compositeWeight * 0.8);
```

This ensures that emails containing high-priority events (like a confirmed dinner invitation) get surfaced prominently in the inbox too.

### Timeliness Integration

The existing `timeliness` object on emails should inform event temporal urgency:
- `timeliness.relevant_date` = the event date
- `timeliness.late_after` = RSVP deadline
- `timeliness.expires` = registration close

These already exist — the composite weight should read directly from them rather than recomputing.

---

## Part 8: Implementation Order

### Phase 1: Event Taxonomy — IMPLEMENTED
1. ~~Add `eventType` field to EventDetector and MultiEventDetector output schemas~~
2. ~~Update detector prompts to classify event type~~
3. ~~Add `eventType` to EventMetadata interface and DB schema~~
4. ~~Display event type badges on EventCard~~
5. Add event type filters to events page *(deferred to Phase 5)*

### Phase 2: Commitment Tiers — IMPLEMENTED
1. ~~Add `commitmentLevel` to event detection output~~
2. ~~Update detector prompts with commitment inference rules~~
3. Add "Going" and "Not for me" buttons to EventCard *(deferred to Phase 5)*
4. ~~Sort events within time groups by commitment → weight~~
5. ~~Update EventCard visual treatment per commitment tier~~

### Phase 3: Composite Weight — IMPLEMENTED
1. ~~Create `computeCompositeWeight()` function~~
2. ~~Wire it into the event API response~~
3. ~~Sort events by compositeWeight within time groups~~
4. ~~Add whyAttend text display to EventCard~~
5. Bridge event weight → email surface_priority *(deferred)*

### Phase 4: Preference Learning — FUTURE
1. Create `user_event_preferences` table
2. Add preference update logic to event state API
3. Implement behavior weight calculation
4. Feed behavior weight into composite weight
5. Add "Teach Me" prompt after repeated dismissals

### Phase 5: UI Polish — FUTURE
1. Event type filter bar
2. Commitment filter
3. "Why this event" tooltips
4. Compact/expanded card based on relevance
5. Stats banner update (show breakdown by type/commitment)

---

## Files to Modify

### New Files
- `supabase/migrations/migration-XXX-event-taxonomy-weighting.sql`
- `src/services/events/composite-weight.ts`
- `src/services/events/preference-learning.ts`
- `src/components/events/EventTypeIcon.tsx`
- `src/components/events/CommitmentBadge.tsx`

### Modified Files
- `src/services/analyzers/event-detector.ts` — Add eventType, commitmentLevel to prompt + output
- `src/services/analyzers/multi-event-detector.ts` — Same additions
- `src/services/analyzers/types.ts` — New types for eventType, commitmentLevel
- `src/hooks/useEvents.ts` — Add sorting by compositeWeight, new filter options
- `src/components/events/EventCard.tsx` — New badges, buttons, relevance indicator
- `src/app/api/events/route.ts` — Compute and return compositeWeight
- `src/app/api/events/[id]/state/route.ts` — Trigger preference updates on state changes
- `src/types/database.ts` — New table types, updated EventMetadata

---

## Design Principles

1. **Additive, not breaking.** Every new field is optional. Existing events without the new fields still work.
2. **AI-first, user-correctable.** The AI makes the first guess. The user can override. The system learns from overrides.
3. **Transparent scoring.** The `whyAttend` field and "Why this event" tooltip let users understand why something is ranked where it is.
4. **Gradual learning.** Preferences use exponential moving average — recent actions matter more, but the system doesn't overreact to one dismissal.
5. **Event types are descriptive, not prescriptive.** The taxonomy describes what kind of event it is, not whether the user should care. That's what the composite weight does.
