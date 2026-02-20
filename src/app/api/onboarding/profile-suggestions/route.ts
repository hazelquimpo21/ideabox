/**
 * Profile Suggestions API Route
 *
 * POST /api/onboarding/profile-suggestions
 *
 * Analyzes the user's recently synced emails + contacts to extract profile
 * data for the "Mad Libs" onboarding step. Returns AI-generated suggestions
 * for role, company, industry, projects, priorities, and statistically
 * inferred work hours.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * REQUEST FORMAT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Body (all fields optional):
 * ```json
 * {
 *   "maxEmails": 20,           // Max sent emails to analyze (default: 20)
 *   "accountId": "uuid",       // Specific gmail account to analyze (default: all)
 *   "forceRefresh": false       // Skip cache and re-analyze (default: false)
 * }
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * RESPONSE FORMAT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Success (200): { success: true, data: ProfileSuggestions }
 * No emails (200): { success: true, data: { ...nullFields, meta: { emailsAnalyzed: 0 } } }
 * Error (4xx/5xx): { success: false, error: "message" }
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CACHING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Suggestions are stored in user_context.profile_suggestions and cached for
 * 1 hour. Repeated calls within the cache window return the stored results
 * without making a new AI call (fast, zero cost).
 *
 * @module app/api/onboarding/profile-suggestions/route
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { apiResponse, apiError, requireAuth } from '@/lib/api/utils';
import { createLogger } from '@/lib/utils/logger';
import {
  analyzeProfileFromEmails,
  type SentEmailSummary,
  type ContactSummaryForProfile,
} from '@/services/onboarding/profile-analyzer';
import { inferWorkHours } from '@/services/onboarding/work-hours-analyzer';
import { saveProfileSuggestions } from '@/services/user-context/user-context-service';
import type { ProfileSuggestions } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('API:ProfileSuggestions');

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Maximum sent emails to analyze (keep small for speed + cost) */
const DEFAULT_MAX_EMAILS = 20;

/** Maximum contacts to include in the analysis */
const MAX_CONTACTS = 20;

/** Cache duration: 1 hour in milliseconds */
const CACHE_DURATION_MS = 60 * 60 * 1000;

/** Maximum characters from email body to use as signature area */
const SIGNATURE_AREA_LENGTH = 500;

// ═══════════════════════════════════════════════════════════════════════════════
// POST HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  const startTime = performance.now();

  logger.start('Profile suggestions request received');

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: Authenticate user
    // ─────────────────────────────────────────────────────────────────────────
    const supabase = await createServerClient();
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    logger.info('User authenticated', { userId: user.id.substring(0, 8) });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Parse optional request body
    // ─────────────────────────────────────────────────────────────────────────
    let maxEmails = DEFAULT_MAX_EMAILS;
    let accountId: string | null = null;
    let forceRefresh = false;

    try {
      const body = await request.json();
      if (body.maxEmails && typeof body.maxEmails === 'number') {
        maxEmails = Math.min(Math.max(1, body.maxEmails), 50); // Clamp 1-50
      }
      if (body.accountId && typeof body.accountId === 'string') {
        accountId = body.accountId;
      }
      if (body.forceRefresh === true) {
        forceRefresh = true;
      }
    } catch {
      // Empty body is fine — all fields are optional
    }

    logger.debug('Request parameters', {
      userId: user.id.substring(0, 8),
      maxEmails,
      accountId: accountId?.substring(0, 8) ?? 'all',
      forceRefresh,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Check cache (return early if suggestions are fresh)
    // ─────────────────────────────────────────────────────────────────────────
    if (!forceRefresh) {
      const cached = await getCachedSuggestions(supabase, user.id);
      if (cached) {
        const durationMs = Math.round(performance.now() - startTime);
        logger.success('Returning cached profile suggestions', {
          userId: user.id.substring(0, 8),
          durationMs,
          emailsAnalyzed: cached.meta.emailsAnalyzed,
        });
        return apiResponse(cached);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: Get user's gmail accounts
    // ─────────────────────────────────────────────────────────────────────────
    const accountsQuery = supabase
      .from('gmail_accounts')
      .select('id, email')
      .eq('user_id', user.id)
      .eq('sync_enabled', true);

    if (accountId) {
      accountsQuery.eq('id', accountId);
    }

    const { data: accounts, error: accountsError } = await accountsQuery;

    if (accountsError) {
      logger.error('Failed to fetch gmail accounts', {
        userId: user.id.substring(0, 8),
        error: accountsError.message,
      });
      return apiError('Failed to fetch accounts', 500);
    }

    if (!accounts || accounts.length === 0) {
      logger.info('No gmail accounts found', { userId: user.id.substring(0, 8) });
      return apiResponse(buildEmptySuggestions([]));
    }

    const accountEmails = accounts.map((a: { id: string; email: string }) => a.email);
    logger.info('Found gmail accounts', {
      userId: user.id.substring(0, 8),
      accountCount: accounts.length,
      accounts: accountEmails.join(', '),
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 5: Query recent sent emails from local database
    // ─────────────────────────────────────────────────────────────────────────
    // IMPORTANT: We query the local emails table, NOT the Gmail API.
    // Emails should already be synced from the initial sync step.
    const { data: sentEmails, error: emailsError } = await supabase
      .from('emails')
      .select('id, subject, sender_email, sender_name, recipient_email, date, snippet, body_text')
      .eq('user_id', user.id)
      .contains('gmail_labels', ['SENT'])
      .order('date', { ascending: false })
      .limit(maxEmails);

    if (emailsError) {
      logger.error('Failed to query sent emails', {
        userId: user.id.substring(0, 8),
        error: emailsError.message,
      });
      return apiError('Failed to query emails', 500);
    }

    logger.info('Queried sent emails from database', {
      userId: user.id.substring(0, 8),
      emailCount: sentEmails?.length ?? 0,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 6: Handle "no sent emails" edge case
    // ─────────────────────────────────────────────────────────────────────────
    if (!sentEmails || sentEmails.length === 0) {
      logger.info('No sent emails found — returning empty suggestions', {
        userId: user.id.substring(0, 8),
        hint: 'User may not have completed initial sync yet',
      });

      const emptySuggestions = buildEmptySuggestions(accountEmails);
      // Save the empty result so we don't keep re-checking
      await saveProfileSuggestions(user.id, emptySuggestions);
      return apiResponse(emptySuggestions);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 7: Format email summaries for the AI
    // ─────────────────────────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emailSummaries: SentEmailSummary[] = sentEmails.map((email: any) => ({
      subject: email.subject ?? '(no subject)',
      recipientEmail: email.recipient_email ?? '',
      recipientName: null, // recipient_name isn't in the emails table
      date: email.date,
      snippet: email.snippet ?? '',
      // Extract signature area: last SIGNATURE_AREA_LENGTH chars of body
      bodySignature: extractSignatureArea(email.body_text),
    }));

    // ─────────────────────────────────────────────────────────────────────────
    // Step 8: Get top contacts from database
    // ─────────────────────────────────────────────────────────────────────────
    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('email, name, email_count, is_vip, is_google_starred, company, relationship_type')
      .eq('user_id', user.id)
      .eq('is_archived', false)
      .order('email_count', { ascending: false })
      .limit(MAX_CONTACTS);

    if (contactsError) {
      logger.warn('Failed to fetch contacts (continuing without)', {
        userId: user.id.substring(0, 8),
        error: contactsError.message,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contactSummaries: ContactSummaryForProfile[] = (contacts ?? []).map((c: any) => ({
      email: c.email,
      name: c.name,
      emailCount: c.email_count,
      isVip: c.is_vip,
      isGoogleStarred: c.is_google_starred,
      company: c.company,
      relationshipType: c.relationship_type,
    }));

    logger.info('Prepared data for analysis', {
      userId: user.id.substring(0, 8),
      emailSummaries: emailSummaries.length,
      contactSummaries: contactSummaries.length,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 9: Call AI profile analyzer (ONE call with all data)
    // ─────────────────────────────────────────────────────────────────────────
    const aiResult = await analyzeProfileFromEmails({
      userId: user.id,
      sentEmails: emailSummaries,
      contacts: contactSummaries,
      accountEmails,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 10: Infer work hours statistically (no AI)
    // ─────────────────────────────────────────────────────────────────────────
    // Get user timezone from user_profiles for accurate hour bucketing
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('timezone')
      .eq('id', user.id)
      .single();

    const userTimezone = profile?.timezone ?? undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sentDates = sentEmails.map((e: any) => new Date(e.date));
    const workHoursResult = inferWorkHours(sentDates, userTimezone);

    // ─────────────────────────────────────────────────────────────────────────
    // Step 11: Assemble the ProfileSuggestions response
    // ─────────────────────────────────────────────────────────────────────────
    const processingTimeMs = Math.round(performance.now() - startTime);

    const suggestions: ProfileSuggestions = {
      role: aiResult.data.role,
      company: aiResult.data.company,
      industry: aiResult.data.industry,
      workHours: workHoursResult
        ? {
            start: workHoursResult.start,
            end: workHoursResult.end,
            days: workHoursResult.days,
            confidence: workHoursResult.confidence,
            source: 'email_send_times',
          }
        : null,
      projects: aiResult.data.projects,
      priorities: aiResult.data.priorities,
      meta: {
        emailsAnalyzed: sentEmails.length,
        accountsUsed: accountEmails,
        processingTimeMs,
        totalTokensUsed: aiResult.tokensTotal,
        estimatedCost: aiResult.estimatedCost,
      },
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Step 12: Save suggestions to user_context for caching + Phase 3 use
    // ─────────────────────────────────────────────────────────────────────────
    await saveProfileSuggestions(user.id, suggestions);

    // ─────────────────────────────────────────────────────────────────────────
    // Step 13: Log cost and return
    // ─────────────────────────────────────────────────────────────────────────
    logger.success('Profile suggestions generated', {
      userId: user.id.substring(0, 8),
      emailsAnalyzed: sentEmails.length,
      hasRole: !!suggestions.role,
      hasCompany: !!suggestions.company,
      hasIndustry: !!suggestions.industry,
      hasWorkHours: !!suggestions.workHours,
      projectCount: suggestions.projects.length,
      priorityCount: suggestions.priorities.length,
      tokensUsed: aiResult.tokensTotal,
      estimatedCost: aiResult.estimatedCost,
      processingTimeMs,
    });

    return apiResponse(suggestions);
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);
    const message = error instanceof Error ? error.message : 'Unknown error';

    logger.error('Profile suggestions request failed', {
      error: message,
      durationMs,
    });

    return apiError(`Profile analysis failed: ${message}`, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Checks if cached suggestions exist and are still fresh (< 1 hour old).
 *
 * Reads from user_context.profile_suggestions and profile_suggestions_generated_at.
 * Returns the cached data if valid, or null if stale/missing.
 */
async function getCachedSuggestions(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string
): Promise<ProfileSuggestions | null> {
  logger.debug('Checking for cached profile suggestions', {
    userId: userId.substring(0, 8),
  });

  try {
    const { data, error } = await supabase
      .from('user_context')
      .select('profile_suggestions, profile_suggestions_generated_at')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      logger.debug('No cached suggestions found', {
        userId: userId.substring(0, 8),
        error: error?.message,
      });
      return null;
    }

    const suggestions = data.profile_suggestions as ProfileSuggestions | null;
    const generatedAt = data.profile_suggestions_generated_at as string | null;

    if (!suggestions || !generatedAt) {
      logger.debug('No suggestions or timestamp in cache', {
        userId: userId.substring(0, 8),
      });
      return null;
    }

    // Check if cache is still fresh
    const ageMs = Date.now() - new Date(generatedAt).getTime();
    if (ageMs > CACHE_DURATION_MS) {
      logger.debug('Cached suggestions are stale', {
        userId: userId.substring(0, 8),
        ageMs,
        maxAgeMs: CACHE_DURATION_MS,
      });
      return null;
    }

    logger.info('Found fresh cached suggestions', {
      userId: userId.substring(0, 8),
      ageMs,
      emailsAnalyzed: suggestions.meta?.emailsAnalyzed ?? 0,
    });

    return suggestions;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.warn('Error checking suggestion cache', {
      userId: userId.substring(0, 8),
      error: message,
    });
    return null;
  }
}

/**
 * Extracts the signature area from an email body (last N characters).
 *
 * Email signatures are typically at the end of the body and contain
 * the sender's role, company, phone, and other profile-relevant info.
 *
 * @param bodyText - Full email body text
 * @returns Last 500 characters of the body, or undefined if no body
 */
function extractSignatureArea(bodyText: string | null): string | undefined {
  if (!bodyText || bodyText.length === 0) return undefined;

  if (bodyText.length <= SIGNATURE_AREA_LENGTH) {
    return bodyText;
  }

  return bodyText.slice(-SIGNATURE_AREA_LENGTH);
}

/**
 * Builds an empty ProfileSuggestions response for when no emails are available.
 *
 * Returns all null fields with meta.emailsAnalyzed = 0 so the frontend knows
 * the user should complete their sync first.
 */
function buildEmptySuggestions(accountEmails: string[]): ProfileSuggestions {
  return {
    role: null,
    company: null,
    industry: null,
    workHours: null,
    projects: [],
    priorities: [],
    meta: {
      emailsAnalyzed: 0,
      accountsUsed: accountEmails,
      processingTimeMs: 0,
      totalTokensUsed: 0,
      estimatedCost: 0,
    },
  };
}
