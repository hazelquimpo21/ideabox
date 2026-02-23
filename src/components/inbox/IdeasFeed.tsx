/**
 * IdeasFeed Component
 *
 * Full-page ideas list for the Inbox "Ideas" tab. Shows AI-generated
 * idea sparks from email content with filtering, save/dismiss actions,
 * and source email links.
 *
 * @module components/inbox/IdeasFeed
 * @since February 2026
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  Badge,
  Button,
  Skeleton,
} from '@/components/ui';
import {
  Lightbulb,
  Bookmark,
  X,
  RefreshCw,
  ExternalLink,
  Filter,
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
  Inbox,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useIdeas } from '@/hooks';
import type { IdeaItem } from '@/hooks/useIdeas';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('IdeasFeed');

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const IDEA_TYPE_CONFIG: Record<string, {
  label: string;
  className: string;
  icon: React.ElementType;
}> = {
  social_post: {
    label: 'Social Post',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    icon: Share2,
  },
  networking: {
    label: 'Networking',
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    icon: Users,
  },
  business: {
    label: 'Business',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    icon: Briefcase,
  },
  content_creation: {
    label: 'Content',
    className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    icon: FileText,
  },
  hobby: {
    label: 'Hobby',
    className: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
    icon: Palette,
  },
  shopping: {
    label: 'Shopping',
    className: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
    icon: ShoppingBag,
  },
  date_night: {
    label: 'Date Night',
    className: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    icon: Heart,
  },
  family_activity: {
    label: 'Family',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    icon: Home,
  },
  personal_growth: {
    label: 'Growth',
    className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
    icon: TrendingUp,
  },
  community: {
    label: 'Community',
    className: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
    icon: MapPin,
  },
};

function getTypeConfig(type: string) {
  return IDEA_TYPE_CONFIG[type] || {
    label: type.replace(/_/g, ' '),
    className: '',
    icon: Lightbulb,
  };
}

/** All available type filter options */
const TYPE_FILTERS = [
  { value: '', label: 'All' },
  ...Object.entries(IDEA_TYPE_CONFIG).map(([value, config]) => ({
    value,
    label: config.label,
  })),
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function IdeasFeed() {
  const [typeFilter, setTypeFilter] = React.useState('');

  const {
    items,
    stats,
    isLoading,
    error,
    refetch,
    saveIdea,
    dismissIdea,
  } = useIdeas({ limit: 30, type: typeFilter || undefined });

  logger.debug('Rendering IdeasFeed', { itemCount: items.length, typeFilter });

  const handleSave = async (idea: IdeaItem) => {
    try {
      await saveIdea(idea);
      logger.success('Idea saved');
    } catch {
      logger.error('Failed to save idea');
    }
  };

  // ─── Loading State ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-full shrink-0" />
          ))}
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  // ─── Error State ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="py-6 text-center">
          <p className="text-sm text-destructive mb-3">{error.message}</p>
          <Button variant="outline" size="sm" onClick={refetch} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      {/* Header with stats and refresh */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {items.length > 0 ? (
            <>
              <span className="font-medium text-foreground tabular-nums">{items.length}</span>
              {' '}idea sparks from your emails
              {stats?.savedIdeas ? (
                <span className="ml-2">
                  ({stats.savedIdeas} saved)
                </span>
              ) : null}
            </>
          ) : null}
        </p>
        <Button variant="outline" size="sm" onClick={refetch} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Type filter pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-4">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        {TYPE_FILTERS.map((filter) => (
          <button
            key={filter.value}
            onClick={() => setTypeFilter(filter.value)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
              typeFilter === filter.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80 text-muted-foreground',
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Empty State */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Lightbulb className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">
            {typeFilter ? 'No ideas of this type' : 'No idea sparks yet'}
          </h3>
          <p className="text-muted-foreground max-w-sm">
            {typeFilter
              ? 'Try a different filter or wait for more emails to be analyzed.'
              : 'Ideas will appear here as your emails are analyzed by AI. Run an analysis from Settings to get started.'}
          </p>
        </div>
      ) : (
        /* Ideas List */
        <div className="space-y-3">
          {items.map((idea, index) => {
            const config = getTypeConfig(idea.type);
            const TypeIcon = config.icon;

            return (
              <Card
                key={`${idea.emailId}-${index}`}
                className="group hover:shadow-md transition-shadow"
              >
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    {/* Type badge */}
                    <Badge
                      variant="outline"
                      className={cn('text-xs py-0.5 px-2 shrink-0 mt-0.5', config.className)}
                    >
                      <TypeIcon className="h-3 w-3 mr-1" />
                      {config.label}
                    </Badge>

                    {/* Idea content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-relaxed mb-1">{idea.idea}</p>
                      <p className="text-xs text-muted-foreground mb-2">{idea.relevance}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <Link
                          href={`/inbox?email=${idea.emailId}`}
                          className="flex items-center gap-1 hover:text-foreground transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {idea.emailSubject || idea.emailSender || 'Source email'}
                        </Link>
                        {idea.confidence >= 0.7 && (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            High confidence
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1"
                        onClick={() => handleSave(idea)}
                      >
                        <Bookmark className="h-3.5 w-3.5" />
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground"
                        onClick={() => dismissIdea(idea)}
                        title="Dismiss"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default IdeasFeed;
