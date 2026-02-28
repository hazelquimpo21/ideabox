/**
 * StyleInspirationCard Component
 *
 * Home page card showing email style/design ideas extracted by ContentDigest.
 * Observations about layout, tone, CTA, subject lines, and storytelling
 * from incoming emails — gold for solopreneurs crafting marketing emails.
 *
 * Follows the same card pattern as IdeaSparksCard.
 *
 * @module components/home/StyleInspirationCard
 * @since February 2026 — Phase 2
 */

'use client';

import * as React from 'react';
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
import { Palette, ArrowRight, Mail } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';
import { useEmailStyleIdeas } from '@/hooks/useEmailStyleIdeas';
import type { StyleIdea } from '@/hooks/useEmailStyleIdeas';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('StyleInspirationCard');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE BADGE CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

/** Style type display config — color-coded by type */
const TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  layout: {
    label: 'Layout',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  },
  tone: {
    label: 'Tone',
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
  },
  subject_line: {
    label: 'Subject',
    className: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  },
  cta: {
    label: 'CTA',
    className: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
  },
  visual: {
    label: 'Visual',
    className: 'bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300',
  },
  visual_hierarchy: {
    label: 'Visual',
    className: 'bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300',
  },
  storytelling: {
    label: 'Story',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  },
};

/** Fallback config for unknown types */
const DEFAULT_TYPE_CONFIG = {
  label: 'Style',
  className: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * StyleInspirationCard — shows email style ideas on the Home page.
 *
 * Fetches data via useEmailStyleIdeas hook. Shows up to 5 items
 * with type badges, idea text, and "why it works" explanations.
 */
export function StyleInspirationCard() {
  const { ideas, isLoading, error } = useEmailStyleIdeas();

  logger.debug('Rendering StyleInspirationCard', { ideaCount: ideas.length, isLoading });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Palette className="h-5 w-5 text-pink-500" />
            Style Inspiration
          </CardTitle>
          <Link href="/inbox">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
              See all
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingSkeleton />
        ) : error ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Failed to load style ideas.
          </p>
        ) : ideas.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No style ideas yet &mdash; they&apos;ll appear as marketing emails are analyzed.
          </p>
        ) : (
          <div className="space-y-3">
            {ideas.slice(0, 5).map((idea, index) => (
              <StyleIdeaItem key={`${idea.sourceEmail.id}-${index}`} idea={idea} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/** A single style idea item in the card */
const StyleIdeaItem = React.memo(function StyleIdeaItem({ idea }: { idea: StyleIdea }) {
  const typeConfig = TYPE_CONFIG[idea.type] || DEFAULT_TYPE_CONFIG;

  return (
    <div className="group py-2 px-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors">
      <div className="flex items-start gap-2">
        {/* Type badge */}
        <Badge
          variant="outline"
          className={cn('text-[10px] py-0 px-1.5 shrink-0 mt-0.5 border-0', typeConfig.className)}
        >
          {typeConfig.label}
        </Badge>

        <div className="flex-1 min-w-0">
          {/* Idea text */}
          <p className="text-sm leading-snug">{idea.idea}</p>

          {/* Why it works — secondary muted text */}
          {idea.whyItWorks && (
            <p className="text-xs text-muted-foreground/70 mt-0.5 line-clamp-2">
              {idea.whyItWorks}
            </p>
          )}

          {/* Source email reference */}
          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground/50">
            <Mail className="h-2.5 w-2.5" />
            <span className="truncate">
              {idea.sourceEmail.senderName || idea.sourceEmail.subject || 'Email'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

/** Loading skeleton */
function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-start gap-2">
          <Skeleton className="h-4 w-14 rounded-full" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default StyleInspirationCard;
