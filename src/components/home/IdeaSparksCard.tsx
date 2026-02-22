/**
 * Idea Sparks Card Component
 *
 * Displays recent AI-generated ideas on the Home page. Ideas are generated
 * by the IdeaSparkAnalyzer from email content + user context.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * NEW (FEB 2026): Creative Idea Generation from Email Content
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Each email produces 3 ideas by cross-referencing its content with the user's
 * role, interests, projects, location, family, and current season. Ideas span:
 * social posts, networking, business, hobbies, date nights, family activities,
 * personal growth, and community involvement.
 *
 * Users can:
 * - Save ideas they want to pursue (promotes to email_ideas table)
 * - Dismiss ideas they're not interested in
 * - Click through to the source email for context
 *
 * DESIGN:
 * - Shows top 5 ideas by confidence, most recent first
 * - Each idea shows its type badge, the idea text, and source email
 * - Compact card format matching PendingTasksList pattern
 *
 * @module components/home/IdeaSparksCard
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
  Lightbulb,
  ArrowRight,
  Bookmark,
  X,
  Share2,
  Users,
  Briefcase,
  FileText,
  Palette,
  ShoppingBag,
  Heart,
  Home,
  TrendingUp,
  MapPin,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';
import type { IdeaItem } from '@/hooks/useIdeas';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('IdeaSparksCard');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface IdeaSparksCardProps {
  /** Array of idea sparks to display (max 5 recommended) */
  ideas: IdeaItem[];
  /** Whether data is still loading */
  isLoading: boolean;
  /** Callback to save an idea */
  onSave: (idea: IdeaItem) => Promise<void>;
  /** Callback to dismiss an idea */
  onDismiss: (idea: IdeaItem) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maps idea types to display labels, colors, and icons.
 * This determines how each idea category appears in the UI.
 */
const IDEA_TYPE_CONFIG: Record<string, {
  label: string;
  variant: 'default' | 'secondary' | 'outline' | 'destructive';
  className: string;
  icon: typeof Lightbulb;
}> = {
  social_post: {
    label: 'Social Post',
    variant: 'default',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    icon: Share2,
  },
  networking: {
    label: 'Networking',
    variant: 'default',
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    icon: Users,
  },
  business: {
    label: 'Business',
    variant: 'default',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    icon: Briefcase,
  },
  content_creation: {
    label: 'Content',
    variant: 'default',
    className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200 dark:border-orange-800',
    icon: FileText,
  },
  hobby: {
    label: 'Hobby',
    variant: 'default',
    className: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
    icon: Palette,
  },
  shopping: {
    label: 'Shopping',
    variant: 'default',
    className: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300 border-pink-200 dark:border-pink-800',
    icon: ShoppingBag,
  },
  date_night: {
    label: 'Date Night',
    variant: 'default',
    className: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    icon: Heart,
  },
  family_activity: {
    label: 'Family',
    variant: 'default',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    icon: Home,
  },
  personal_growth: {
    label: 'Growth',
    variant: 'default',
    className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    icon: TrendingUp,
  },
  community: {
    label: 'Community',
    variant: 'default',
    className: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 border-teal-200 dark:border-teal-800',
    icon: MapPin,
  },
};

/**
 * Gets the display config for an idea type.
 * Falls back to a generic style for unknown types.
 */
function getTypeConfig(type: string) {
  return IDEA_TYPE_CONFIG[type] || {
    label: type.replace(/_/g, ' '),
    variant: 'secondary' as const,
    className: '',
    icon: Lightbulb,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Idea Sparks Card — shows recent AI-generated ideas from email content.
 *
 * Displays up to 5 ideas with type badges, the idea text, and source email.
 * Users can save or dismiss each idea.
 */
export function IdeaSparksCard({
  ideas,
  isLoading,
  onSave,
  onDismiss,
}: IdeaSparksCardProps) {
  logger.debug('Rendering IdeaSparksCard', { ideaCount: ideas.length, isLoading });

  /**
   * Handle saving an idea with error handling.
   */
  const handleSave = async (idea: IdeaItem) => {
    logger.info('User saving idea', {
      type: idea.type,
      preview: idea.idea.substring(0, 40),
    });
    try {
      await onSave(idea);
      logger.success('Idea saved by user');
    } catch (error) {
      logger.error('Failed to save idea', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            Idea Sparks
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
                <Skeleton className="h-5 w-16 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : ideas.length === 0 ? (
          // ─── Empty State ────────────────────────────────────────────────────
          <p className="text-sm text-muted-foreground py-4 text-center">
            No idea sparks yet — they&apos;ll appear as emails are analyzed.
          </p>
        ) : (
          // ─── Ideas List ─────────────────────────────────────────────────────
          <div className="space-y-3">
            {ideas.slice(0, 5).map((idea, index) => {
              const config = getTypeConfig(idea.type);
              const TypeIcon = config.icon;

              return (
                <div
                  key={`${idea.emailId}-${index}`}
                  className="group flex items-start gap-3 py-2 px-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors"
                >
                  {/* Type badge */}
                  <Badge
                    variant="outline"
                    className={`text-xs py-0.5 px-2 shrink-0 mt-0.5 ${config.className}`}
                  >
                    <TypeIcon className="h-3 w-3 mr-1" />
                    {config.label}
                  </Badge>

                  {/* Idea content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug">{idea.idea}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      From: {idea.emailSubject || idea.emailSender || 'Unknown email'}
                    </p>
                  </div>

                  {/* Actions (visible on hover) */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => handleSave(idea)}
                      title="Save idea"
                    >
                      <Bookmark className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground"
                      onClick={() => onDismiss(idea)}
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

export default IdeaSparksCard;
