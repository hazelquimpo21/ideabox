/**
 * Saved Links Card Component
 *
 * Displays recent AI-analyzed links on the Home page. Links are analyzed
 * by the LinkAnalyzer from email content + user context.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * NEW (FEB 2026): Deep URL Intelligence from Email Content
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Each email with links gets them enriched with priority scoring, topic tagging,
 * save-worthiness, and expiration detection based on the user's role, interests,
 * and active projects.
 *
 * LINK PRIORITIES:
 * - must_read:      Directly relevant — shown with highlight styling
 * - worth_reading:  Interesting — standard styling
 * - reference:      Useful to have — muted styling
 * - skip:           Hidden by default (tracking pixels, generic footers)
 *
 * Users can:
 * - Save links they want to revisit (promotes to saved_links table)
 * - Dismiss links they're not interested in
 * - Click through to the URL directly
 * - See which email the link came from
 *
 * DESIGN:
 * - Shows top 5 links by priority, then confidence, most recent first
 * - Each link shows its priority badge, title, topics, and source email
 * - Compact card format matching IdeaSparksCard pattern
 *
 * @module components/home/SavedLinksCard
 * @since February 2026
 */

'use client';

import Link from 'next/link';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  Skeleton,
} from '@/components/ui';
import {
  Link2,
  ArrowRight,
  Bookmark,
  X,
  ExternalLink,
  FileText,
  Video,
  ShoppingBag,
  Wrench,
  Globe,
  Calendar,
  Clock,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';
import type { LinkItem } from '@/hooks/useLinks';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('SavedLinksCard');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface SavedLinksCardProps {
  /** Array of analyzed links to display (max 5 recommended) */
  links: LinkItem[];
  /** Whether data is still loading */
  isLoading: boolean;
  /** Callback to save a link */
  onSave: (link: LinkItem) => Promise<void>;
  /** Callback to dismiss a link */
  onDismiss: (link: LinkItem) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maps link priorities to display styling.
 * Priority determines the visual emphasis of each link.
 */
const PRIORITY_CONFIG: Record<string, {
  label: string;
  className: string;
}> = {
  must_read: {
    label: 'Must Read',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800',
  },
  worth_reading: {
    label: 'Worth Reading',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  },
  reference: {
    label: 'Reference',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400 border-gray-200 dark:border-gray-700',
  },
  skip: {
    label: 'Skip',
    className: 'bg-gray-50 text-gray-400 dark:bg-gray-900/30 dark:text-gray-500 border-gray-100 dark:border-gray-800',
  },
};

/**
 * Maps link types to icons for visual distinction.
 */
const LINK_TYPE_ICONS: Record<string, typeof Link2> = {
  article: FileText,
  registration: Calendar,
  document: FileText,
  video: Video,
  product: ShoppingBag,
  tool: Wrench,
  social: Globe,
  other: Link2,
};

/**
 * Gets the priority display config for a link.
 * Falls back to reference styling for unknown priorities.
 */
function getPriorityConfig(priority: string) {
  return PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.reference;
}

/**
 * Gets the icon for a link type.
 * Falls back to Link2 for unknown types.
 */
function getLinkTypeIcon(type: string) {
  return LINK_TYPE_ICONS[type] || Link2;
}

/**
 * Formats an expiration date for display.
 * Returns null if no expiration or already expired.
 */
function formatExpiration(expires: string | null): string | null {
  if (!expires) return null;

  const expiresDate = new Date(expires);
  const now = new Date();
  const daysUntil = Math.ceil((expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntil < 0) return 'Expired';
  if (daysUntil === 0) return 'Expires today';
  if (daysUntil === 1) return 'Expires tomorrow';
  if (daysUntil <= 7) return `Expires in ${daysUntil} days`;
  return null; // Don't show for far-future expirations
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Saved Links Card — shows recent AI-analyzed links from email content.
 *
 * Displays up to 5 links with priority badges, titles, topics, and source emails.
 * Users can save or dismiss each link.
 */
export function SavedLinksCard({
  links,
  isLoading,
  onSave,
  onDismiss,
}: SavedLinksCardProps) {
  logger.debug('Rendering SavedLinksCard', { linkCount: links.length, isLoading });

  /**
   * Handle saving a link with error handling.
   */
  const handleSave = async (link: LinkItem) => {
    logger.info('User saving link', {
      type: link.type,
      priority: link.priority,
      titlePreview: link.title.substring(0, 40),
    });
    try {
      await onSave(link);
      logger.success('Link saved by user');
    } catch (error) {
      logger.error('Failed to save link', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Link2 className="h-5 w-5 text-blue-500" />
            Links
          </CardTitle>
          <Link href="/inbox">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
              View all
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          // ─── Loading State ──────────────────────────────────────────────────
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-5 w-20 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : links.length === 0 ? (
          // ─── Empty State ────────────────────────────────────────────────────
          <p className="text-sm text-muted-foreground py-4 text-center">
            No analyzed links yet — they&apos;ll appear as emails with links are processed.
          </p>
        ) : (
          // ─── Links List ─────────────────────────────────────────────────────
          <div className="space-y-3">
            {links.slice(0, 5).map((link, index) => {
              const priorityConfig = getPriorityConfig(link.priority);
              const TypeIcon = getLinkTypeIcon(link.type);
              const expiration = formatExpiration(link.expires);

              return (
                <div
                  key={`${link.emailId}-${index}`}
                  className="group flex items-start gap-3 py-2 px-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors"
                >
                  {/* Type icon */}
                  <div className="shrink-0 mt-0.5">
                    <TypeIcon className="h-4 w-4 text-muted-foreground" />
                  </div>

                  {/* Link content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      {/* Priority badge */}
                      <Badge
                        variant="outline"
                        className={`text-xs py-0 px-1.5 shrink-0 ${priorityConfig.className}`}
                      >
                        {priorityConfig.label}
                      </Badge>

                      {/* Expiration warning */}
                      {expiration && (
                        <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />
                          {expiration}
                        </span>
                      )}
                    </div>

                    {/* Link title (clickable) */}
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm leading-snug hover:underline flex items-center gap-1"
                    >
                      {link.title}
                      <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
                    </a>

                    {/* Topics + source email */}
                    <div className="flex items-center gap-2 mt-0.5">
                      {link.topics.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {link.topics.slice(0, 2).join(', ')}
                        </span>
                      )}
                      {link.topics.length > 0 && (link.emailSubject || link.emailSender) && (
                        <span className="text-xs text-muted-foreground">·</span>
                      )}
                      <span className="text-xs text-muted-foreground truncate">
                        {link.emailSubject || link.emailSender || 'Unknown email'}
                      </span>
                    </div>
                  </div>

                  {/* Actions (visible on hover) */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => handleSave(link)}
                      title="Save link"
                    >
                      <Bookmark className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground"
                      onClick={() => onDismiss(link)}
                      title="Dismiss"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SavedLinksCard;
