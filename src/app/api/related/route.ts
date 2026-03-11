/**
 * Related Items API — cross-entity navigation endpoint.
 *
 * Given an anchor entity (email, contact, or project), returns all
 * related items across tables: actions, tasks, events, deadlines,
 * contacts, and saved links.
 *
 * Queries run in parallel via Promise.all with individual try/catch
 * so partial results are returned if one query fails.
 *
 * @module api/related
 * @since March 2026 — Phase 2 Cross-Entity Navigation
 */

// @ts-nocheck — Supabase generated types are incomplete for JSONB columns

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth, apiResponse, apiError } from '@/lib/api/utils';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('API:Related');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Unified related item shape returned to the client */
export interface RelatedItem {
  type: 'email' | 'task' | 'event' | 'deadline' | 'contact' | 'link' | 'idea';
  id: string;
  title: string;
  subtitle?: string;
  url: string;
  status?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY HELPERS — each returns RelatedItem[] and catches its own errors
// ═══════════════════════════════════════════════════════════════════════════════

/** Fetch actions related to an email */
async function fetchRelatedActions(
  supabase: ReturnType<Awaited<ReturnType<typeof createServerClient>>>,
  userId: string,
  emailId: string
): Promise<RelatedItem[]> {
  try {
    const { data } = await supabase
      .from('actions')
      .select('id, title, status, action_type')
      .eq('user_id', userId)
      .eq('email_id', emailId)
      .limit(10);

    if (!data) return [];
    return data.map((a) => ({
      type: 'task' as const,
      id: a.id,
      title: a.title,
      subtitle: a.action_type || undefined,
      url: `/tasks?item=${a.id}`,
      status: a.status,
    }));
  } catch (err) {
    logger.error('Failed to fetch related actions', { emailId, error: String(err) });
    return [];
  }
}

/** Fetch project items linked to an email or action */
async function fetchRelatedProjectItems(
  supabase: ReturnType<Awaited<ReturnType<typeof createServerClient>>>,
  userId: string,
  emailId: string
): Promise<RelatedItem[]> {
  try {
    const { data } = await supabase
      .from('project_items')
      .select('id, title, status, item_type, source_email_id, source_action_id')
      .eq('user_id', userId)
      .eq('source_email_id', emailId)
      .limit(10);

    if (!data) return [];
    return data.map((pi) => ({
      type: pi.item_type === 'idea' ? ('idea' as const) : ('task' as const),
      id: pi.id,
      title: pi.title,
      subtitle: pi.item_type,
      url: `/tasks?item=${pi.id}`,
      status: pi.status,
    }));
  } catch (err) {
    logger.error('Failed to fetch related project items', { emailId, error: String(err) });
    return [];
  }
}

/** Fetch extracted dates (non-event) linked to an email */
async function fetchRelatedDates(
  supabase: ReturnType<Awaited<ReturnType<typeof createServerClient>>>,
  userId: string,
  emailId: string
): Promise<RelatedItem[]> {
  try {
    const { data } = await supabase
      .from('extracted_dates')
      .select('id, title, date_type, date, is_acknowledged')
      .eq('user_id', userId)
      .eq('email_id', emailId)
      .neq('date_type', 'event')
      .limit(10);

    if (!data) return [];
    return data.map((d) => ({
      type: 'deadline' as const,
      id: d.id,
      title: d.title || `${d.date_type} — ${d.date}`,
      subtitle: d.date_type,
      url: `/calendar?highlight=${d.id}`,
      status: d.is_acknowledged ? 'acknowledged' : undefined,
    }));
  } catch (err) {
    logger.error('Failed to fetch related dates', { emailId, error: String(err) });
    return [];
  }
}

/** Fetch events detected in an email via email_analyses.event_detection */
async function fetchRelatedEvents(
  supabase: ReturnType<Awaited<ReturnType<typeof createServerClient>>>,
  userId: string,
  emailId: string
): Promise<RelatedItem[]> {
  try {
    // Events are extracted dates with date_type='event'
    const { data } = await supabase
      .from('extracted_dates')
      .select('id, title, date_type, date')
      .eq('user_id', userId)
      .eq('email_id', emailId)
      .eq('date_type', 'event')
      .limit(10);

    if (!data) return [];
    return data.map((e) => ({
      type: 'event' as const,
      id: e.id,
      title: e.title || 'Event',
      subtitle: e.date,
      url: `/calendar?highlight=${e.id}`,
    }));
  } catch (err) {
    logger.error('Failed to fetch related events', { emailId, error: String(err) });
    return [];
  }
}

/** Fetch contact linked to an email via contact_id */
async function fetchRelatedContact(
  supabase: ReturnType<Awaited<ReturnType<typeof createServerClient>>>,
  userId: string,
  emailId: string
): Promise<RelatedItem[]> {
  try {
    // Get the email's contact_id first
    const { data: email } = await supabase
      .from('emails')
      .select('contact_id')
      .eq('id', emailId)
      .eq('user_id', userId)
      .single();

    if (!email?.contact_id) return [];

    const { data: contact } = await supabase
      .from('contacts')
      .select('id, name, email, company')
      .eq('id', email.contact_id)
      .single();

    if (!contact) return [];
    return [{
      type: 'contact' as const,
      id: contact.id,
      title: contact.name || contact.email,
      subtitle: contact.company || undefined,
      url: `/contacts/${contact.id}`,
    }];
  } catch (err) {
    logger.error('Failed to fetch related contact', { emailId, error: String(err) });
    return [];
  }
}

/** Fetch saved links extracted from an email */
async function fetchRelatedLinks(
  supabase: ReturnType<Awaited<ReturnType<typeof createServerClient>>>,
  userId: string,
  emailId: string
): Promise<RelatedItem[]> {
  try {
    const { data } = await supabase
      .from('saved_links')
      .select('id, title, url')
      .eq('user_id', userId)
      .eq('email_id', emailId)
      .limit(10);

    if (!data) return [];
    return data.map((l) => ({
      type: 'link' as const,
      id: l.id,
      title: l.title || l.url,
      url: l.url,
    }));
  } catch (err) {
    logger.error('Failed to fetch related links', { emailId, error: String(err) });
    return [];
  }
}

/** Fetch items related to a contact (emails, tasks, dates) */
async function fetchContactRelatedItems(
  supabase: ReturnType<Awaited<ReturnType<typeof createServerClient>>>,
  userId: string,
  contactId: string
): Promise<RelatedItem[]> {
  try {
    const [emailsResult, datesResult, itemsResult] = await Promise.all([
      // Recent emails from this contact
      supabase
        .from('emails')
        .select('id, subject, sender_name, date')
        .eq('user_id', userId)
        .eq('contact_id', contactId)
        .order('date', { ascending: false })
        .limit(5),
      // Extracted dates for this contact
      supabase
        .from('extracted_dates')
        .select('id, title, date_type, date')
        .eq('user_id', userId)
        .eq('contact_id', contactId)
        .limit(5),
      // Project items linked to this contact
      supabase
        .from('project_items')
        .select('id, title, status, item_type')
        .eq('user_id', userId)
        .eq('contact_id', contactId)
        .limit(5),
    ]);

    const items: RelatedItem[] = [];

    if (emailsResult.data) {
      items.push(...emailsResult.data.map((e) => ({
        type: 'email' as const,
        id: e.id,
        title: e.subject || '(No subject)',
        subtitle: e.sender_name || undefined,
        url: `/inbox?email=${e.id}`,
      })));
    }

    if (datesResult.data) {
      items.push(...datesResult.data.map((d) => ({
        type: d.date_type === 'event' ? ('event' as const) : ('deadline' as const),
        id: d.id,
        title: d.title || `${d.date_type} — ${d.date}`,
        subtitle: d.date_type,
        url: `/calendar?highlight=${d.id}`,
      })));
    }

    if (itemsResult.data) {
      items.push(...itemsResult.data.map((pi) => ({
        type: pi.item_type === 'idea' ? ('idea' as const) : ('task' as const),
        id: pi.id,
        title: pi.title,
        subtitle: pi.item_type,
        url: `/tasks?item=${pi.id}`,
        status: pi.status,
      })));
    }

    return items;
  } catch (err) {
    logger.error('Failed to fetch contact related items', { contactId, error: String(err) });
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/related — fetch related items for an anchor entity.
 *
 * Query params:
 *   - emailId: UUID — anchor by email
 *   - contactId: UUID — anchor by contact
 *
 * Returns: { items: RelatedItem[] }
 */
export async function GET(request: NextRequest) {
  logger.start('Fetching related items');

  const supabase = await createServerClient();
  const userResult = await requireAuth(supabase);
  if (userResult instanceof Response) return userResult;
  const user = userResult;

  const { searchParams } = new URL(request.url);
  const emailId = searchParams.get('emailId');
  const contactId = searchParams.get('contactId');

  // Require at least one anchor
  if (!emailId && !contactId) {
    return apiError('At least one of emailId or contactId is required', 400);
  }

  let items: RelatedItem[] = [];

  if (emailId) {
    // Fetch all email-related items in parallel
    logger.info('Fetching email-related items', { emailId: emailId.substring(0, 8) });

    const results = await Promise.all([
      fetchRelatedActions(supabase, user.id, emailId),
      fetchRelatedProjectItems(supabase, user.id, emailId),
      fetchRelatedDates(supabase, user.id, emailId),
      fetchRelatedEvents(supabase, user.id, emailId),
      fetchRelatedContact(supabase, user.id, emailId),
      fetchRelatedLinks(supabase, user.id, emailId),
    ]);

    items = results.flat();
  } else if (contactId) {
    // Fetch all contact-related items
    logger.info('Fetching contact-related items', { contactId: contactId.substring(0, 8) });
    items = await fetchContactRelatedItems(supabase, user.id, contactId);
  }

  // Deduplicate by type+id
  const seen = new Set<string>();
  items = items.filter((item) => {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  logger.success('Related items fetched', { count: items.length });
  return apiResponse({ items });
}
