/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issues
/**
 * Links API Route
 *
 * GET /api/links — Fetch recent analyzed links from email analyses
 * POST /api/links — Save a link to the saved_links table
 * PATCH /api/links — Update a saved link's status (save, read, archive, dismiss)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * NEW (FEB 2026): Deep URL Intelligence from Email Content
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Links are analyzed by the LinkAnalyzer during email processing and stored
 * in email_analyses.url_extraction JSONB. This endpoint reads those analyzed
 * links and returns them for display.
 *
 * When a user saves/bookmarks a link, it's promoted to the saved_links table
 * via the POST endpoint for persistent tracking.
 *
 * LINK PRIORITIES:
 * - must_read:      Directly relevant to user's active interests/projects
 * - worth_reading:  Tangentially interesting, broadens perspective
 * - reference:      Useful documentation/tools to have on hand
 * - skip:           Tracking pixels, generic footers, unsubscribe links
 *
 * @module app/api/links/route
 * @since February 2026
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('LinksAPI');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * An analyzed link extracted from email_analyses.url_extraction JSONB.
 */
interface AnalyzedLinkItem {
  /** The URL */
  url: string;
  /** Link type: article, registration, document, video, etc. */
  type: string;
  /** Title or label */
  title: string;
  /** Brief description of why this link matters */
  description: string;
  /** Whether this is the main content link of the email */
  isMainContent: boolean;
  /** Priority: must_read, worth_reading, reference, skip */
  priority: string;
  /** Topic tags for filtering (1-3 short tags) */
  topics: string[];
  /** Whether worth bookmarking */
  saveWorthy: boolean;
  /** Expiration date if time-limited (ISO date) */
  expires: string | null;
  /** Confidence score 0-1 */
  confidence: number;
  /** Source email ID */
  emailId: string;
  /** Source email subject (for context) */
  emailSubject: string | null;
  /** Source email sender */
  emailSender: string | null;
  /** When the email was analyzed */
  analyzedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET — Fetch recent analyzed links
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/links
 *
 * Returns recent analyzed links from email analyses.
 *
 * Query params:
 * - limit: Number of emails to check for links (default: 15, max: 50)
 * - priority: Filter by priority (e.g., 'must_read', 'worth_reading')
 * - type: Filter by link type (e.g., 'article', 'registration')
 * - topic: Filter by topic tag
 * - save_worthy: If 'true', only return save-worthy links
 * - min_confidence: Minimum confidence threshold (default: 0.3)
 *
 * Response: Array of analyzed links with source email context
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // ─── Authentication ──────────────────────────────────────────────────
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      logger.warn('Unauthorized links request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ─── Parse query params ──────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const limit = Math.min(Math.max(parseInt(limitParam || '15', 10), 1), 50);
    const priorityFilter = searchParams.get('priority');
    const typeFilter = searchParams.get('type');
    const topicFilter = searchParams.get('topic');
    const saveWorthyOnly = searchParams.get('save_worthy') === 'true';
    const minConfidence = parseFloat(searchParams.get('min_confidence') || '0.3');

    logger.start('Fetching analyzed links', {
      userId: user.id.substring(0, 8),
      limit,
      priorityFilter,
      typeFilter,
      topicFilter,
      saveWorthyOnly,
      minConfidence,
    });

    // ─── Fetch recent analyses with url_extraction ───────────────────────
    // Join with emails to get subject/sender context
    const { data: analyses, error: queryError } = await supabase
      .from('email_analyses')
      .select(`
        email_id,
        url_extraction,
        created_at,
        emails!inner (
          id,
          subject,
          sender_name,
          sender_email,
          signal_strength
        )
      `)
      .eq('user_id', user.id)
      .not('url_extraction', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (queryError) {
      logger.error('Links query failed', {
        error: queryError.message,
        code: queryError.code,
      });
      return NextResponse.json(
        { error: 'Failed to fetch links', details: queryError.message },
        { status: 500 }
      );
    }

    // ─── Extract and flatten analyzed links ──────────────────────────────
    const analyzedLinks: AnalyzedLinkItem[] = [];

    for (const analysis of (analyses || [])) {
      const urlData = analysis.url_extraction as {
        has_links?: boolean;
        links?: Array<{
          url: string;
          type: string;
          title: string;
          description: string;
          is_main_content?: boolean;
          priority: string;
          topics: string[];
          save_worthy?: boolean;
          expires?: string | null;
          confidence: number;
        }>;
        summary?: string;
      } | null;

      if (!urlData?.has_links || !urlData.links) continue;

      const email = analysis.emails as {
        id: string;
        subject: string | null;
        sender_name: string | null;
        sender_email: string;
        signal_strength: string | null;
      };

      for (const link of urlData.links) {
        // Apply confidence filter
        if (link.confidence < minConfidence) continue;

        // Apply priority filter
        if (priorityFilter && link.priority !== priorityFilter) continue;

        // Apply type filter
        if (typeFilter && link.type !== typeFilter) continue;

        // Apply save_worthy filter
        if (saveWorthyOnly && !link.save_worthy) continue;

        // Apply topic filter
        if (topicFilter && !(link.topics || []).includes(topicFilter)) continue;

        // Skip 'skip' priority links by default (unless explicitly requested)
        if (!priorityFilter && link.priority === 'skip') continue;

        analyzedLinks.push({
          url: link.url,
          type: link.type,
          title: link.title,
          description: link.description,
          isMainContent: Boolean(link.is_main_content),
          priority: link.priority,
          topics: link.topics || [],
          saveWorthy: Boolean(link.save_worthy),
          expires: link.expires || null,
          confidence: link.confidence,
          emailId: email.id,
          emailSubject: email.subject,
          emailSender: email.sender_name || email.sender_email,
          analyzedAt: analysis.created_at,
        });
      }
    }

    // Sort: must_read first, then by confidence, then by recency
    const priorityOrder: Record<string, number> = {
      must_read: 0,
      worth_reading: 1,
      reference: 2,
      skip: 3,
    };

    analyzedLinks.sort((a, b) => {
      // Primary: priority rank
      const priorityDiff = (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3);
      if (priorityDiff !== 0) return priorityDiff;

      // Secondary: confidence
      if (Math.abs(b.confidence - a.confidence) > 0.1) {
        return b.confidence - a.confidence;
      }

      // Tertiary: recency
      return new Date(b.analyzedAt).getTime() - new Date(a.analyzedAt).getTime();
    });

    // ─── Fetch saved links count ─────────────────────────────────────────
    const { count: savedCount } = await supabase
      .from('saved_links')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .not('status', 'in', '("dismissed","archived")');

    // ─── Build stats ─────────────────────────────────────────────────────
    const priorityCounts: Record<string, number> = {};
    const typeCounts: Record<string, number> = {};
    const allTopics = new Set<string>();

    for (const link of analyzedLinks) {
      priorityCounts[link.priority] = (priorityCounts[link.priority] || 0) + 1;
      typeCounts[link.type] = (typeCounts[link.type] || 0) + 1;
      link.topics.forEach(t => allTopics.add(t));
    }

    const stats = {
      totalLinks: analyzedLinks.length,
      savedLinks: savedCount ?? 0,
      saveWorthyCount: analyzedLinks.filter(l => l.saveWorthy).length,
      expiringCount: analyzedLinks.filter(l => l.expires).length,
      byPriority: priorityCounts,
      byType: typeCounts,
      topTopics: Array.from(allTopics).slice(0, 10),
      avgConfidence: analyzedLinks.length > 0
        ? Math.round((analyzedLinks.reduce((sum, l) => sum + l.confidence, 0) / analyzedLinks.length) * 100) / 100
        : 0,
    };

    logger.success('Analyzed links fetched', {
      userId: user.id.substring(0, 8),
      linkCount: analyzedLinks.length,
      mustReadCount: priorityCounts['must_read'] ?? 0,
      savedCount: savedCount ?? 0,
      processingTimeMs: Date.now() - startTime,
    });

    return NextResponse.json({
      items: analyzedLinks,
      stats,
      lastUpdated: new Date().toISOString(),
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Links fetch failed', { error: errorMessage });
    return NextResponse.json(
      { error: 'Failed to fetch links', details: errorMessage },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST — Save a link to the saved_links table
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/links
 *
 * Saves a link to the saved_links table.
 * This "promotes" an analyzed link to a user-tracked bookmark.
 *
 * Body:
 * - url: string — the URL (required)
 * - title: string — link title (required)
 * - description: string — description (optional)
 * - linkType: string — type: article, registration, document, etc. (required)
 * - priority: string — must_read, worth_reading, reference, skip (optional)
 * - topics: string[] — topic tags (optional)
 * - confidence: number — confidence score (optional)
 * - expiresAt: string — expiration date ISO (optional)
 * - emailId: string — source email ID (optional)
 *
 * Response: The created saved_links record
 */
export async function POST(request: NextRequest) {
  try {
    // ─── Authentication ──────────────────────────────────────────────────
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ─── Parse body ──────────────────────────────────────────────────────
    const body = await request.json();
    const { url, title, description, linkType, priority, topics, confidence, expiresAt, emailId } = body;

    if (!url || !title || !linkType) {
      return NextResponse.json(
        { error: 'url, title, and linkType are required' },
        { status: 400 }
      );
    }

    // Validate linkType
    const validLinkTypes = ['article', 'registration', 'document', 'video', 'product', 'tool', 'social', 'unsubscribe', 'other'];
    if (!validLinkTypes.includes(linkType)) {
      return NextResponse.json(
        { error: `linkType must be one of: ${validLinkTypes.join(', ')}` },
        { status: 400 }
      );
    }

    logger.info('Saving link', {
      userId: user.id.substring(0, 8),
      linkType,
      priority: priority ?? 'reference',
      emailId: emailId?.substring(0, 8) ?? null,
      titlePreview: title.substring(0, 50),
    });

    // ─── Insert into saved_links ─────────────────────────────────────────
    const { data: savedLink, error: insertError } = await supabase
      .from('saved_links')
      .insert({
        user_id: user.id,
        email_id: emailId || null,
        url,
        title,
        description: description || null,
        link_type: linkType,
        priority: priority || 'reference',
        topics: topics || [],
        confidence: confidence || null,
        expires_at: expiresAt || null,
        status: 'saved',
      })
      .select()
      .single();

    if (insertError) {
      logger.error('Failed to save link', {
        error: insertError.message,
        code: insertError.code,
      });
      return NextResponse.json(
        { error: 'Failed to save link', details: insertError.message },
        { status: 500 }
      );
    }

    logger.success('Link saved', {
      linkId: savedLink.id.substring(0, 8),
      linkType,
      priority: priority ?? 'reference',
    });

    return NextResponse.json({ success: true, data: savedLink }, { status: 201 });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Link save failed', { error: errorMessage });
    return NextResponse.json(
      { error: 'Failed to save link', details: errorMessage },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH — Update a saved link's status
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * PATCH /api/links
 *
 * Updates a saved link's status (new → saved → read → archived, or dismissed).
 *
 * Body:
 * - id: string — the saved_links record ID
 * - status: 'new' | 'saved' | 'read' | 'archived' | 'dismissed'
 */
export async function PATCH(request: NextRequest) {
  try {
    // ─── Authentication ──────────────────────────────────────────────────
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ─── Parse body ──────────────────────────────────────────────────────
    const body = await request.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json(
        { error: 'id and status are required' },
        { status: 400 }
      );
    }

    const validStatuses = ['new', 'saved', 'read', 'archived', 'dismissed'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    logger.info('Updating link status', {
      linkId: id.substring(0, 8),
      newStatus: status,
    });

    // ─── Update ──────────────────────────────────────────────────────────
    const { error: updateError } = await supabase
      .from('saved_links')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id);

    if (updateError) {
      logger.error('Failed to update link', {
        linkId: id.substring(0, 8),
        error: updateError.message,
      });
      return NextResponse.json(
        { error: 'Failed to update link', details: updateError.message },
        { status: 500 }
      );
    }

    logger.success('Link status updated', { linkId: id.substring(0, 8), status });

    return NextResponse.json({ success: true });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Link update failed', { error: errorMessage });
    return NextResponse.json(
      { error: 'Failed to update link', details: errorMessage },
      { status: 500 }
    );
  }
}
