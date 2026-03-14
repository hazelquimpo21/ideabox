# Task Triage UX Audit & Improvement Plan

## Executive Summary

After deep study of the codebase, I've identified **9 UX issues** across the task lifecycle — from how items enter triage, how they're processed, and what happens when they're overdue or neglected. These are the same class of problems that ClickUp/Notion/Linear have wrestled with: the tension between a frictionless inbox and ensuring nothing important falls through the cracks.

---

## UX Issues Found

### 1. CRITICAL — Overdue deadlines disappear from triage

**File:** `src/hooks/useTriageItems.ts:261-263`

The `useExtractedDates` hook is called with `from: today`, which **excludes all past-due deadlines** from the triage stream. If a user doesn't triage a deadline before it passes, it silently vanishes — no warning, no escalation, no "you missed this."

```typescript
// Current: only fetches today → 7 days out
const { dates } = useExtractedDates({ from: today, to: sevenDaysFromNow, isAcknowledged: false });
```

**Fix:** Fetch overdue deadlines too (from 30 days ago) and surface them with an "Overdue" urgency boost. Add an overdue section at the top of triage.

### 2. CRITICAL — Source email archival orphans pending tasks

**File:** `src/services/jobs/timeliness-actions.ts:113-135`

The timeliness job auto-archives emails past their `expires` date, but **never checks if there are still pending actions or project_items linked** to that email. This can make the source context disappear while the task is still active.

**Fix:** Before archiving, check for linked pending actions/project_items. If found, skip archival and optionally boost the urgency of the linked task.

### 3. HIGH — No concept of task "firmness" or obligation level

All tasks are equally dismissable. A "pay rent by March 15" task has the same dismiss friction as "try this new restaurant." Real task managers distinguish:

- **Hard commitments** — contractual, financial, legal (rent, taxes, deadlines with penalties)
- **Soft commitments** — social, personal (RSVP, follow up with friend)
- **Aspirational** — nice-to-have (try restaurant, read article, learn skill)

**Fix:** Add a `firmness` field to `project_items` (`hard | soft | flexible`) that:
- Prevents one-click dismiss for `hard` items (requires confirmation)
- Auto-escalates `hard` overdue items back to triage top
- Is inferred from the analyzer's action_type and timeliness data (pay/submit/register → hard, follow_up/review → soft, ideas → flexible)

### 4. HIGH — Dismiss behavior is inconsistent and lossy

**Files:** `src/hooks/useTriageItems.ts:378-391`

| Item Type | Dismiss Behavior | Persistent? |
|-----------|-----------------|-------------|
| Actions   | Local state `Set` | NO — reappears on refresh |
| Ideas     | API call `dismissIdea` | YES |
| Deadlines | Local state `Set` | NO — reappears on refresh |
| Events    | Local state `Set` | NO — reappears on refresh |

Users think they've dealt with an item but it comes back on page refresh. Or worse, they dismiss something important and can't get it back.

**Fix:**
- Persist all dismissals to the database (add `is_triaged` or `triage_status` field to actions and extracted_dates tables)
- Add an "Undo dismiss" toast with 8-second window
- Add a "Recently dismissed" section accessible from triage (like email trash)

### 5. HIGH — No escalation path for overdue items

When a task passes its due date, the only signal is a red "Overdue" badge on the board. There's no:
- Re-surfacing to triage
- Push notification or email reminder
- Urgency score increase
- Dashboard alert

**Fix:**
- Add overdue items back to the triage stream with maximum urgency (10)
- Add an "Overdue" section at the top of triage with distinct red styling
- Run the timeliness-actions job to boost urgency scores for overdue project_items
- Show overdue count badge on the Tasks tab in navigation

### 6. MEDIUM — Snooze is inflexible (4 hours only)

**File:** `src/components/projects/TriageContent.tsx:203-206`

Users can only snooze for 4 hours — no "tomorrow morning", "next week", or custom date. This forces users to either deal with something now or dismiss it entirely.

**Fix:** Add snooze duration picker: "4 hours", "Tomorrow 9am", "Next Monday", "Pick date". Render as a small dropdown from the snooze button.

### 7. MEDIUM — Ideas in backlog rot silently

Ideas saved to the board enter as `pending` and may sit there forever. Unlike tasks with deadlines, there's no mechanism to resurface stale ideas for re-evaluation.

**Fix:**
- Add a "Stale ideas" nudge in triage: ideas older than 14 days that haven't been touched
- Add an optional "revisit date" when saving ideas
- Show idea age on board cards

### 8. LOW — Triage provides no batch operations

Users with 20+ triage items must process them one-by-one. No "dismiss all ideas", "accept all high-priority", or multi-select.

**Fix:** Add select-all per type filter, bulk dismiss, bulk accept to default project.

### 9. LOW — No triage completion feedback loop

After triaging all items, users see a generic empty state. There's no:
- Summary of what was triaged ("You processed 12 items")
- Next review time suggestion
- Streak/consistency tracking

**Fix:** Enhance empty state with session summary and next-triage nudge.

---

## Implementation Plan (Prioritized)

### Phase 1: Fix overdue visibility & dismiss consistency (Critical)
1. **Expand triage date range** — fetch overdue deadlines (past 30 days) in `useTriageItems`
2. **Add overdue project_items to triage** — query project_items where `due_date < today AND status NOT IN (completed, cancelled)` and merge into triage stream
3. **Persist dismiss state** — add `dismissed_at` column to `actions` and `extracted_dates` tables; update dismiss handlers to write to DB
4. **Add undo-dismiss toast** — 8-second undo window after dismiss
5. **Protect source emails** — check for linked pending items before archiving in timeliness-actions

### Phase 2: Task firmness & escalation (High)
6. **Add `firmness` field** — migration to add `firmness` enum (`hard`, `soft`, `flexible`) to `project_items` with default `flexible`
7. **Auto-infer firmness** — when promoting from triage, infer firmness from action_type (pay/submit → hard) and deadline type (payment_due/expiration → hard)
8. **Dismiss protection for hard tasks** — confirmation dialog for hard-firmness items
9. **Overdue escalation** — re-inject overdue hard/soft tasks into triage with boosted urgency

### Phase 3: Snooze & idea lifecycle (Medium)
10. **Snooze duration picker** — dropdown with preset durations + custom date
11. **Stale idea nudge** — surface untouched ideas older than 14 days back in triage
12. **Idea age display** — show "saved 12 days ago" on idea board cards

### Phase 4: Batch operations & feedback (Low)
13. **Multi-select in triage** — checkbox per item, bulk actions bar
14. **Triage session summary** — enhanced empty state with stats
