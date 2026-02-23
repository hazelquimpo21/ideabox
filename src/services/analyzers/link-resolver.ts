/**
 * Link Resolver Utility
 *
 * Fetches linked pages from emails to extract additional event details.
 * Used by the MultiEventDetector to enrich event extraction when emails
 * contain links to event pages, registration forms, or calendars.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DESIGN PHILOSOPHY (Feb 2026)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Many event emails contain minimal info in the email body but link to
 * full event pages with dates, times, locations, and registration details.
 * This utility fetches those pages and extracts text content for AI analysis.
 *
 * Safety-first approach:
 * - Only fetch HTTPS URLs
 * - 5-second timeout per request
 * - Skip known non-event domains (unsubscribe, social profiles)
 * - Max 2 links per email to control latency
 * - Graceful failure — returns null if fetch fails
 * - Content truncated to 8KB for AI processing
 *
 * @module services/analyzers/link-resolver
 * @version 1.0.0
 * @since February 2026
 */

import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('LinkResolver');

/** Maximum time to wait for a page fetch (ms) */
const FETCH_TIMEOUT_MS = 5000;

/** Maximum text content to return per page (chars) */
const MAX_CONTENT_CHARS = 8000;

/** Maximum number of links to resolve per email */
const MAX_LINKS_PER_EMAIL = 2;

/** User agent for fetch requests */
const USER_AGENT = 'IdeaBox/1.0 (Event Resolver)';

/**
 * Domains to skip — these never contain event details.
 * Lowercase for comparison.
 */
const SKIP_DOMAINS = new Set([
  // Unsubscribe / email management
  'unsubscribe',
  'manage.kmail-lists.com',
  'list-manage.com',
  'mailchimp.com',

  // Social media profiles (not event pages)
  'twitter.com',
  'x.com',
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'tiktok.com',
  'youtube.com',

  // Tracking / analytics
  'click.convertkit-mail.com',
  'click.convertkit-mail2.com',
  'email.mg.substack.com',
  'open.substack.com',
  'trk.klclick.com',

  // Generic utility
  'gravatar.com',
  'googleapis.com',
]);

/**
 * URL path patterns to skip.
 */
const SKIP_PATH_PATTERNS = [
  /\/unsubscribe/i,
  /\/opt-?out/i,
  /\/manage.*preferences/i,
  /\/email-preferences/i,
  /\/privacy/i,
  /\/terms/i,
];

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result of resolving a single link.
 */
export interface ResolvedLink {
  /** The original URL */
  url: string;

  /** Extracted text content from the page */
  textContent: string;

  /** Page title if available */
  pageTitle?: string;

  /** Whether the fetch was successful */
  success: boolean;

  /** Error message if fetch failed */
  error?: string;
}

/**
 * Input link format (matches ExtractedLink from ContentDigest).
 */
export interface LinkInput {
  url: string;
  type?: string;
  title?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LINK RESOLVER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Checks if a URL should be skipped (non-event content).
 */
function shouldSkipUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Only HTTPS
    if (parsed.protocol !== 'https:') {
      return true;
    }

    // Check domain against skip list
    const hostname = parsed.hostname.toLowerCase();
    for (const skipDomain of SKIP_DOMAINS) {
      if (hostname === skipDomain || hostname.endsWith('.' + skipDomain)) {
        return true;
      }
    }

    // Check path patterns
    const fullUrl = parsed.pathname + parsed.search;
    for (const pattern of SKIP_PATH_PATTERNS) {
      if (pattern.test(fullUrl)) {
        return true;
      }
    }

    return false;
  } catch {
    return true; // Invalid URL
  }
}

/**
 * Prioritizes links most likely to contain event details.
 * Prefers: registration, article, document links over others.
 */
function prioritizeLinks(links: LinkInput[]): LinkInput[] {
  const eventLinkTypes = new Set(['registration', 'article', 'document', 'video']);
  const eventKeywords = /event|register|sign.?up|calendar|schedule|class|course|rsvp|ticket|meetup|conference/i;

  return [...links].sort((a, b) => {
    // Prefer event-relevant link types
    const aTypeScore = eventLinkTypes.has(a.type || '') ? 1 : 0;
    const bTypeScore = eventLinkTypes.has(b.type || '') ? 1 : 0;
    if (aTypeScore !== bTypeScore) return bTypeScore - aTypeScore;

    // Prefer URLs/titles with event keywords
    const aKeywordScore = (eventKeywords.test(a.url) || eventKeywords.test(a.title || '')) ? 1 : 0;
    const bKeywordScore = (eventKeywords.test(b.url) || eventKeywords.test(b.title || '')) ? 1 : 0;
    return bKeywordScore - aKeywordScore;
  });
}

/**
 * Extracts readable text content from an HTML string.
 * Uses regex-based approach to avoid dependency on jsdom or similar libraries.
 * Strips scripts, styles, and HTML tags, then cleans up whitespace.
 */
function extractTextFromHtml(html: string): { text: string; title?: string } {
  // Extract page title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1] ? titleMatch[1].replace(/\s+/g, ' ').trim() : undefined;

  // Remove non-content elements
  let cleaned = html;

  // Remove script, style, nav, header, footer, noscript, svg blocks
  const removePatterns = [
    /<script[\s\S]*?<\/script>/gi,
    /<style[\s\S]*?<\/style>/gi,
    /<nav[\s\S]*?<\/nav>/gi,
    /<header[\s\S]*?<\/header>/gi,
    /<footer[\s\S]*?<\/footer>/gi,
    /<noscript[\s\S]*?<\/noscript>/gi,
    /<svg[\s\S]*?<\/svg>/gi,
    /<iframe[\s\S]*?<\/iframe>/gi,
  ];

  for (const pattern of removePatterns) {
    cleaned = cleaned.replace(pattern, ' ');
  }

  // Replace block-level elements with newlines for readability
  cleaned = cleaned.replace(/<\/(p|div|h[1-6]|li|tr|br\s*\/?)>/gi, '\n');
  cleaned = cleaned.replace(/<br\s*\/?>/gi, '\n');

  // Strip remaining HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');

  // Decode common HTML entities
  cleaned = cleaned
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, ' ');

  // Clean up whitespace
  let text = cleaned
    .replace(/[ \t]+/g, ' ')           // Collapse horizontal whitespace
    .replace(/\n\s*\n\s*\n/g, '\n\n')  // Max 2 consecutive newlines
    .replace(/^\s+$/gm, '')            // Remove whitespace-only lines
    .trim();

  // Truncate
  if (text.length > MAX_CONTENT_CHARS) {
    text = text.substring(0, MAX_CONTENT_CHARS) + '\n[Content truncated...]';
  }

  return { text, title };
}

/**
 * Fetches a single URL and extracts text content.
 *
 * @param url - The URL to fetch
 * @returns Resolved link with text content, or failure result
 */
async function fetchAndExtract(url: string): Promise<ResolvedLink> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        url,
        textContent: '',
        success: false,
        error: `HTTP ${response.status}`,
      };
    }

    // Only process HTML responses
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return {
        url,
        textContent: '',
        success: false,
        error: `Non-HTML content: ${contentType}`,
      };
    }

    const html = await response.text();
    const { text, title } = extractTextFromHtml(html);

    if (!text || text.length < 50) {
      return {
        url,
        textContent: '',
        success: false,
        error: 'Insufficient text content extracted',
      };
    }

    return {
      url,
      textContent: text,
      pageTitle: title,
      success: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      url,
      textContent: '',
      success: false,
      error: message.includes('abort') ? 'Timeout' : message,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Resolves links from an email to extract additional event content.
 *
 * Takes a list of links (from ContentDigest), filters for event-relevant
 * ones, fetches up to MAX_LINKS_PER_EMAIL pages, and returns their text
 * content for use as supplementary AI context.
 *
 * @param links - Links extracted from the email by ContentDigest
 * @returns Array of successfully resolved links with text content
 *
 * @example
 * ```typescript
 * import { resolveEventLinks } from '@/services/analyzers/link-resolver';
 *
 * const links = contentDigest.data.links;
 * const resolved = await resolveEventLinks(links);
 *
 * // Use resolved content as additional context for AI
 * for (const link of resolved) {
 *   console.log(`${link.pageTitle}: ${link.textContent.substring(0, 100)}...`);
 * }
 * ```
 */
export async function resolveEventLinks(links: LinkInput[]): Promise<ResolvedLink[]> {
  if (!links || links.length === 0) {
    return [];
  }

  // Filter out non-event links
  const candidateLinks = links.filter(link => !shouldSkipUrl(link.url));

  if (candidateLinks.length === 0) {
    logger.debug('No event-relevant links to resolve', {
      totalLinks: links.length,
      filteredOut: links.length,
    });
    return [];
  }

  // Prioritize and limit
  const prioritized = prioritizeLinks(candidateLinks).slice(0, MAX_LINKS_PER_EMAIL);

  logger.debug('Resolving event links', {
    totalLinks: links.length,
    candidates: candidateLinks.length,
    resolving: prioritized.length,
    urls: prioritized.map(l => l.url.substring(0, 60)),
  });

  // Fetch in parallel
  const results = await Promise.all(
    prioritized.map(link => fetchAndExtract(link.url))
  );

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  if (failed.length > 0) {
    logger.debug('Some links failed to resolve', {
      failed: failed.map(f => ({ url: f.url.substring(0, 60), error: f.error })),
    });
  }

  if (successful.length > 0) {
    logger.info('Resolved event links', {
      resolved: successful.length,
      totalChars: successful.reduce((sum, r) => sum + r.textContent.length, 0),
    });
  }

  return successful;
}

/**
 * Formats resolved link content for inclusion in an AI prompt.
 *
 * @param resolvedLinks - Successfully resolved links
 * @returns Formatted string to append to the AI prompt, or empty string
 */
export function formatResolvedLinksForPrompt(resolvedLinks: ResolvedLink[]): string {
  if (resolvedLinks.length === 0) {
    return '';
  }

  const parts: string[] = [
    '',
    '═══════════════════════════════════════════════════════════════════════════════',
    'ADDITIONAL CONTENT FROM LINKED PAGES',
    '═══════════════════════════════════════════════════════════════════════════════',
    '',
    'The following content was fetched from links in the email.',
    'Use it to find additional event details (dates, times, locations, registration info).',
    '',
  ];

  for (const link of resolvedLinks) {
    parts.push(`--- Page: ${link.pageTitle || link.url} ---`);
    parts.push(`URL: ${link.url}`);
    parts.push(link.textContent);
    parts.push('');
  }

  return parts.join('\n');
}
