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
 * Idea-worthy emails produce 0-3 ideas by cross-referencing content with the
 * user's context. Ideas span: tweet drafts, networking, business, learning,
 * tools to try, places to visit, date nights, family, growth, and community.
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
  MessageCircle,
  Users,
  Briefcase,
  FileText,
  BookOpen,
  Wrench,
  Navigation,
  Heart,
  Home,
  TrendingUp,
  MapPin,
  Mail,
  Share2,
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
 * Generates consistent badge className from a Tailwind color name.
 * Reduces duplication — all 13 type entries now share one template.
 */
function ideaBadgeClass(color: string): string {
  return `bg-${color}-100 text-${color}-700 dark:bg-${color}-900/30 dark:text-${color}-300 border-${color}-200 dark:border-${color}-800`;
}

/** Slim config — label + icon + base color. className is derived. */
const IDEA_TYPE_CONFIG: Record<string, { label: string; icon: typeof Lightbulb; color: string }> = {
  tweet_draft:      { label: 'Tweet',      icon: MessageCircle, color: 'blue' },
  networking:       { label: 'Networking',  icon: Users,         color: 'purple' },
  business:         { label: 'Business',    icon: Briefcase,     color: 'emerald' },
  content_creation: { label: 'Content',     icon: FileText,      color: 'orange' },
  learning:         { label: 'Learning',    icon: BookOpen,      color: 'cyan' },
  tool_to_try:      { label: 'Tool',        icon: Wrench,        color: 'violet' },
  place_to_visit:   { label: 'Place',       icon: Navigation,    color: 'lime' },
  date_night:       { label: 'Date Night',  icon: Heart,         color: 'rose' },
  family_activity:  { label: 'Family',      icon: Home,          color: 'amber' },
  personal_growth:  { label: 'Growth',      icon: TrendingUp,    color: 'indigo' },
  community:        { label: 'Community',   icon: MapPin,        color: 'teal' },
  // Legacy types (backward compat)
  social_post:      { label: 'Tweet',       icon: Share2,        color: 'blue' },
  hobby:            { label: 'Learning',    icon: BookOpen,      color: 'cyan' },
};

function getTypeConfig(type: string) {
  const config = IDEA_TYPE_CONFIG[type];
  if (config) {
    return { ...config, className: ideaBadgeClass(config.color) };
  }
  return { label: type.replace(/_/g, ' '), icon: Lightbulb, className: '', color: 'gray' };
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
          <Link href="/inbox?tab=discoveries">
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
                  key={`${idea.emailId}-${idea.type}-${index}`}
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
                    {/* Source email — clickable link back to the email that sparked this idea */}
                    {idea.emailId ? (
                      <Link
                        href={`/inbox?email=${idea.emailId}`}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground mt-0.5 truncate hover:text-foreground transition-colors"
                        title="View source email"
                      >
                        <Mail className="h-3 w-3 shrink-0" />
                        {idea.emailSubject || idea.emailSender || 'Source email'}
                      </Link>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        From: {idea.emailSubject || idea.emailSender || 'Unknown email'}
                      </p>
                    )}
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
