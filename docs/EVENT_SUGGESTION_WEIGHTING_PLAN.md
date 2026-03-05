# Event Suggestion Weighting — Future Roadmap

> **Phases 1-4 (steps 1-4) are IMPLEMENTED** (March 2026). See `DECISIONS.md` (#32) for the architectural decision record.
>
> **What's live:** 18-type event taxonomy, 4-tier commitment inference (confirmed/invited/suggested/fyi),
> composite weight algorithm (6 signals), EventCard badges + whyAttend display, sorting by commitment → weight → date,
> **preference learning** (count-aware EMA scoring from dismiss/maybe/save actions, personalized behavior weight).
> See `src/services/events/composite-weight.ts`, `src/services/events/preference-learning.ts`, `src/services/analyzers/types.ts`.

---

## Phase 4: Preference Learning — IMPLEMENTED (March 2026)

> **Status:** Steps 1-4 implemented. Step 5 ("Teach Me" prompts) deferred to Phase 5.
>
> **Key files:**
> - `src/services/events/preference-learning.ts` — EMA scoring, preference read/write
> - `src/app/api/events/[id]/state/route.ts` — fires preference updates on state changes
> - `src/app/api/events/states/route.ts` — batch states endpoint (replaced N+1)
> - `supabase/migrations/migration-045-user-event-states.sql` — user_event_states table + event_index
> - `supabase/migrations/migration-046-user-event-preferences.sql` — user_event_preferences table

### `user_event_preferences` table

```sql
CREATE TABLE user_event_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preference_type TEXT NOT NULL CHECK (preference_type IN (
    'event_type',      -- e.g., "I don't care about webinars"
    'sender_domain',   -- e.g., "I love events from meetup.com"
    'category',        -- e.g., "I care about local events"
    'keyword'          -- e.g., "AI/ML events interest me"
  )),
  preference_key TEXT NOT NULL,
  preference_score REAL NOT NULL DEFAULT 0.0,  -- -1.0 to 1.0
  positive_count INT NOT NULL DEFAULT 0,
  negative_count INT NOT NULL DEFAULT 0,
  total_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, preference_type, preference_key)
);
```

### Preference update logic

On user action (dismiss/maybe/save) via `/api/events/[id]/state`:
- Update preferences for event_type, sender_domain, and source category
- Uses count-aware EMA: `alpha = max(0.1, 1 / (total_count + 1))` so early signals have more impact
- `new_score = old_score * (1 - alpha) + action_weight * alpha`
- Action weights: `saved_to_calendar=+1.0`, `maybe=+0.5`, `dismissed=-1.0`
- Runs as fire-and-forget side-effect (does not block the state change response)

### Behavior weight calculation

```typescript
function getBehaviorWeightFromPreferences(cache: PreferenceCache, signals: EventSignals): number {
  const typeScore = cache.get(`event_type:${signals.eventType}`) ?? 0;
  const domainScore = cache.get(`sender_domain:${signals.senderDomain}`) ?? 0;
  const categoryScore = cache.get(`category:${signals.emailCategory}`) ?? 0;
  const normalize = (s: number) => (s + 1) / 2;  // [-1,1] → [0,1]
  return normalize(typeScore) * 0.5 + normalize(domainScore) * 0.3 + normalize(categoryScore) * 0.2;
}
```

Preferences are batch-fetched once per request via `fetchUserPreferences()` (single DB query),
then passed as a `PreferenceCache` Map through the composite weight pipeline. No N+1 per-event lookups.

### "Teach Me" prompts (DEFERRED to Phase 5)

After dismissing 3+ events of the same type, prompt:
> "You've dismissed several webinar invites. Want me to auto-minimize future webinars?"

Sets `preference_score` to -0.8 for that type.

### Steps
1. ~~Create `user_event_preferences` table (migration)~~ — Done (migration 046)
2. ~~Add preference update logic to event state API~~ — Done (fire-and-forget in POST state)
3. ~~Implement behavior weight calculation in `composite-weight.ts`~~ — Done
4. ~~Feed behavior weight into composite weight (replace placeholder)~~ — Done
5. Add "Teach Me" prompt after repeated dismissals — Deferred to Phase 5

---

## Phase 5: UI Polish

### Event filters
Add filter bar to events page:
- **By type:** Meeting / Social / Community / Webinar / Deadline / All
- **By commitment:** Going / Interested / Suggested / All
- **By source:** Work / Personal / Newsletter / All

### New buttons
- "Going" button on EventCard (upgrades to `confirmed`)
- "Not for me" button (stronger than dismiss — feeds preference learning with extra weight)

### Relevance-based card sizing
- High relevance (>0.7): Prominent card, full details
- Medium (0.4-0.7): Standard card
- Low (<0.4): Compact/collapsed, expandable

### "Why this event" tooltips
Show compositeWeight breakdown on hover.

### Deferred items from Phases 1-3
- Bridge event compositeWeight → email `surface_priority`
- Event weight → inbox scoring engine integration via `timeliness` fields

### Steps
1. Event type filter bar
2. Commitment filter
3. "Going" / "Not for me" buttons
4. Compact/expanded card based on relevance
5. Stats banner (breakdown by type/commitment)
