/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * Category Intelligence API Route
 *
 * Provides aggregated intelligence data for a specific email category.
 * Powers the enhanced category cards with AI briefings, urgency scores,
 * needs-attention items, and relationship health indicators.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /api/categories/{category}/intelligence
 *   Returns aggregated intelligence for the specified category
 *   Returns: CategoryIntelligence object
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Get intelligence for client_pipeline category:
 *   GET /api/categories/client_pipeline/intelligence
 *
 * @module app/api/categories/[category]/intelligence/route
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { apiError, requireAuth } from '@/lib/api/utils';
import { createLogger } from '@/lib/utils/logger';
import type { EmailCategory } from '@/types/database';
import type { CategorySummary, NeedsAttentionItem } from '@/types/discovery';

const logger = createLogger('API:CategoryIntelligence');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Response shape for category intelligence endpoint
 */
interface CategoryIntelligenceResponse {
  success: boolean;
  data: CategorySummary;
  meta: {
    generatedAt: string;
    emailsAnalyzed: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALID CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════════

const VALID_CATEGORIES: EmailCategory[] = [
  'newsletters_general',
  'news_politics',
  'product_updates',
  'local',
  'shopping',
  'travel',
  'finance',
  'family_kids_school',
  'family_health_appointments',
  'client_pipeline',
  'business_work_general',
  'personal_friends_family',
];

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/categories/[category]/intelligence
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(
  request: NextRequest,
  { params }: { params: { category: string } }
) {
  const startTime = performance.now();
  const { category } = params;

  logger.start('Fetching category intelligence', { category });

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // Validation
    // ─────────────────────────────────────────────────────────────────────────

    // Validate category parameter
    if (!VALID_CATEGORIES.includes(category as EmailCategory)) {
      logger.warn('Invalid category requested', { category });
      return apiError(`Invalid category: ${category}`, 400);
    }

    // Initialize Supabase client with user context
    const supabase = await createServerClient();

    // Verify authentication
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    logger.debug('Authenticated user', { userId: user.id, category });

    // ─────────────────────────────────────────────────────────────────────────
    // Fetch emails in this category
    // ─────────────────────────────────────────────────────────────────────────

    // NOTE: urgency_score and relationship_signal have no DB columns (see database.ts:293).
    // They will be null on returned rows; downstream code handles null gracefully.
    const { data: emails, error: emailsError } = await supabase
      .from('emails')
      .select(`
        id,
        sender_name,
        sender_email,
        subject,
        summary,
        quick_action,
        is_read,
        key_points,
        date
      `)
      .eq('user_id', user.id)
      .eq('category', category)
      .eq('is_archived', false)
      .order('date', { ascending: false })
      .limit(100); // Limit for performance

    if (emailsError) {
      logger.error('Failed to fetch emails', { error: emailsError.message });
      return apiError('Failed to fetch category data', 500);
    }

    logger.debug('Fetched emails for category', {
      category,
      count: emails?.length || 0,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Fetch email analyses for deeper intelligence
    // ─────────────────────────────────────────────────────────────────────────

    const emailIds = emails?.map((e) => e.id) || [];

    let analyses: Array<{
      email_id: string;
      action_extraction: Record<string, unknown> | null;
      client_tagging: Record<string, unknown> | null;
    }> = [];

    if (emailIds.length > 0) {
      const { data: analysesData, error: analysesError } = await supabase
        .from('email_analyses')
        .select('email_id, action_extraction, client_tagging')
        .in('email_id', emailIds);

      if (analysesError) {
        logger.warn('Failed to fetch analyses', { error: analysesError.message });
        // Continue without analyses - not critical
      } else {
        analyses = analysesData || [];
      }
    }

    // Create a map for quick lookup
    const analysisMap = new Map(analyses.map((a) => [a.email_id, a]));

    // ─────────────────────────────────────────────────────────────────────────
    // Aggregate intelligence
    // ─────────────────────────────────────────────────────────────────────────

    const emailList = emails || [];

    // Basic counts
    const count = emailList.length;
    const unreadCount = emailList.filter((e) => !e.is_read).length;

    // Urgency scores — not available as DB columns yet (see database.ts:293),
    // so this will always be empty until a migration adds them.
    const urgencyScores: number[] = [];

    // Health summary — relationship_signal has no DB column yet,
    // so all emails count as neutral until a migration adds it.
    const healthSummary = {
      positive: 0,
      neutral: emailList.length,
      negative: 0,
    };

    // Top senders
    const senderCounts = new Map<string, { name: string; email: string; count: number }>();
    emailList.forEach((email) => {
      const key = email.sender_email;
      const existing = senderCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        senderCounts.set(key, {
          name: email.sender_name || email.sender_email.split('@')[0],
          email: email.sender_email,
          count: 1,
        });
      }
    });

    const topSenders = Array.from(senderCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    // Sample subjects
    const sampleSubjects = emailList
      .filter((e) => e.subject)
      .slice(0, 3)
      .map((e) => e.subject as string);

    // Needs attention items (quick_action that requires response)
    // NOTE: urgency_score filter removed — column doesn't exist yet (see database.ts:293)
    const needsAttention: NeedsAttentionItem[] = emailList
      .filter((email) => {
        const needsAction = ['respond', 'review', 'follow_up'].includes(email.quick_action || '');
        return needsAction;
      })
      .slice(0, 5)
      .map((email) => {
        const analysis = analysisMap.get(email.id);
        const actionExtraction = analysis?.action_extraction as {
          actions?: Array<{ title?: string; type?: string; deadline?: string }>;
          deadline?: string;
        } | null;
        const clientTagging = analysis?.client_tagging as {
          client_name?: string;
        } | null;

        // Get action title from analysis or generate from quick_action
        const actionTitle = actionExtraction?.actions?.[0]?.title ||
          getActionTitle(email.quick_action, email.subject);

        // Get deadline from action extraction
        const deadline = actionExtraction?.actions?.[0]?.deadline ||
          actionExtraction?.deadline;

        return {
          emailId: email.id,
          title: actionTitle,
          actionType: mapQuickActionToType(email.quick_action),
          senderName: email.sender_name || email.sender_email.split('@')[0],
          company: clientTagging?.client_name,
          deadline: deadline,
          urgency: 5, // Default — urgency_score column doesn't exist yet
        };
      })
      .sort((a, b) => b.urgency - a.urgency);

    // Generate AI briefing
    const briefing = generateBriefing({
      category: category as EmailCategory,
      count,
      unreadCount,
      urgencyScores,
      healthSummary,
      needsAttention,
      topSenders,
    });

    // Urgent count (legacy field)
    const urgentCount = urgencyScores.filter((s) => s >= 7).length;

    // ─────────────────────────────────────────────────────────────────────────
    // Build response
    // ─────────────────────────────────────────────────────────────────────────

    const categorySummary: CategorySummary = {
      category: category as EmailCategory,
      count,
      unreadCount,
      topSenders,
      sampleSubjects,
      insight: briefing, // Use briefing as fallback insight
      urgentCount,
      urgencyScores,
      needsAttention,
      healthSummary,
      briefing,
    };

    const durationMs = Math.round(performance.now() - startTime);

    logger.success('Category intelligence generated', {
      category,
      count,
      unreadCount,
      urgentCount,
      needsAttentionCount: needsAttention.length,
      durationMs,
    });

    const response: CategoryIntelligenceResponse = {
      success: true,
      data: categorySummary,
      meta: {
        generatedAt: new Date().toISOString(),
        emailsAnalyzed: count,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);
    logger.error('Failed to generate category intelligence', {
      category,
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs,
    });

    return apiError('Failed to generate category intelligence', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Map quick_action to NeedsAttentionItem actionType
 */
function mapQuickActionToType(
  quickAction: string | null
): NeedsAttentionItem['actionType'] {
  switch (quickAction) {
    case 'respond':
      return 'respond';
    case 'review':
      return 'review';
    case 'follow_up':
      return 'follow_up';
    case 'calendar':
      return 'schedule';
    default:
      return 'other';
  }
}

/**
 * Generate action title from quick_action and subject
 */
function getActionTitle(quickAction: string | null, subject: string | null): string {
  const subjectSnippet = subject
    ? subject.length > 30
      ? subject.substring(0, 30) + '...'
      : subject
    : 'email';

  switch (quickAction) {
    case 'respond':
      return `Reply to: ${subjectSnippet}`;
    case 'review':
      return `Review: ${subjectSnippet}`;
    case 'follow_up':
      return `Follow up on: ${subjectSnippet}`;
    case 'calendar':
      return `Add to calendar: ${subjectSnippet}`;
    default:
      return `Action: ${subjectSnippet}`;
  }
}

/**
 * Generate a natural language briefing for the category.
 * This summarizes the key information for at-a-glance understanding.
 */
function generateBriefing(params: {
  category: EmailCategory;
  count: number;
  unreadCount: number;
  urgencyScores: number[];
  healthSummary: { positive: number; neutral: number; negative: number };
  needsAttention: NeedsAttentionItem[];
  topSenders: Array<{ name: string; count: number }>;
}): string {
  const {
    category,
    count,
    unreadCount,
    urgencyScores,
    healthSummary,
    needsAttention,
    topSenders,
  } = params;

  const parts: string[] = [];

  // Empty category
  if (count === 0) {
    return 'No emails in this category.';
  }

  // Count summary
  if (unreadCount > 0) {
    parts.push(`${unreadCount} unread email${unreadCount > 1 ? 's' : ''}`);
  } else {
    parts.push(`${count} email${count > 1 ? 's' : ''}`);
  }

  // Urgent items
  const urgentCount = urgencyScores.filter((s) => s >= 8).length;
  const importantCount = urgencyScores.filter((s) => s >= 5 && s < 8).length;

  if (urgentCount > 0) {
    parts[0] += `, ${urgentCount} urgent`;
  } else if (importantCount > 0) {
    parts[0] += `, ${importantCount} need attention`;
  }

  // Top action
  if (needsAttention.length > 0) {
    const topItem = needsAttention[0];
    if (topItem.deadline) {
      parts.push(`Priority: ${topItem.senderName} - due ${topItem.deadline}`);
    } else {
      parts.push(`Priority: ${topItem.senderName} - ${topItem.title}`);
    }
  }

  // Relationship concerns
  if (healthSummary.negative > 0) {
    const concern = healthSummary.negative === 1
      ? '1 relationship needs attention'
      : `${healthSummary.negative} relationships may need attention`;
    parts.push(concern);
  }

  // Category-specific additions
  if (category === 'client_pipeline' && topSenders.length > 0) {
    const waitingClients = topSenders.filter((s) =>
      needsAttention.some((n) => n.senderName === s.name)
    ).length;
    if (waitingClients > 0) {
      parts.push(`${waitingClients} client${waitingClients > 1 ? 's' : ''} waiting for response`);
    }
  }

  return parts.join('. ') + '.';
}
