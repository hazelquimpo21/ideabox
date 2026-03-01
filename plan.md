# Fix: Email Analysis Delivery Failures

## Problem
Analyses silently fail or degrade due to tight output token limits. When an analyzer hits `max_tokens`, OpenAI returns `finish_reason: "length"`, the code throws a non-retryable `TokenLimitError`, and the analysis is permanently lost. Emails marked with `analysis_error` are never retried automatically.

## Solution: 3 changes (A + C + E)

---

### Change A: Increase token limits for high-risk analyzers

**File:** `src/config/analyzers.ts`

| Analyzer | Current | New | Rationale |
|---|---|---|---|
| summaryGenerator | 800 | 1500 | Nested JSON (headline + 5 sections × 5 items × 4 fields + stats) easily exceeds 800 on a busy day |
| categorizer | 750 | 1000 | 9 output fields (category, reasoning, topics, summary, quickAction, signalStrength, replyWorthiness, emailType, aiBrief) |
| contentDigest | 2000 | 2500 | Long newsletters with many links + golden_nuggets + email_style_ideas |

**Cost impact:** ~$1-2/month more at current volume.

---

### Change C: Cap summary input to prevent output blowup

**File:** `src/services/summary/summary-generator.ts` — `gatherInputData()`

Currently feeds up to **200 threads** into the summary prompt. Even with 1500 output tokens, 200 threads could still overflow. Cap at **50 highest-signal threads** and sort by signal strength so the most important threads are always included.

Changes:
1. In `gatherInputData()`, reduce the email query `.limit(200)` → `.limit(100)` (fetched from DB)
2. After `clusterByThread()`, sort threads by signal strength (high → medium → low → noise) and cap at 50
3. This keeps the AI input focused and makes it much less likely to exceed the output token budget

---

### Change E: Auto-retry failed analyses periodically

**New file:** `src/services/jobs/retry-failed-analyses.ts`

Add a scheduled job that:
1. Queries emails where `analysis_error IS NOT NULL` and `analyzed_at IS NULL`
2. Caps at 25 per run to control costs/time
3. Only retries emails with `analysis_retry_count < 3` (need to add this column — OR just use a simpler approach: only retry emails whose `analysis_error` was set within the last 7 days, avoiding infinite retries of truly broken emails)
4. Clears `analysis_error` and re-runs the processor (same pattern as `retry-analysis/route.ts`)
5. Logs results

**Simpler alternative (no schema change):** Instead of adding a retry_count column, filter to emails where `analysis_error` was set in the last 7 days and `updated_at` is > 24 hours ago (so we don't retry the same email more than once per day). This gives effectively 7 retry attempts with no DB migration.

**Integration:**
- Export from `src/services/jobs/index.ts`
- Can be triggered by the same cron infrastructure as summary-generation
- Add an API route at `src/app/api/jobs/retry-failed-analyses/route.ts` for HTTP trigger

---

## Files to modify

1. `src/config/analyzers.ts` — bump maxTokens for 3 analyzers
2. `src/services/summary/summary-generator.ts` — cap thread input at 50 after clustering
3. `src/services/jobs/retry-failed-analyses.ts` — **new file**, auto-retry job
4. `src/services/jobs/index.ts` — export the new job
5. `src/app/api/jobs/retry-failed-analyses/route.ts` — **new file**, HTTP trigger endpoint

## Not changing
- No model swap (GPT-4.1-mini stays)
- No schema migrations needed (using time-based retry gating)
- No changes to the OpenAI client or error handling logic
