/**
 * Shared Priority Card Component
 *
 * Displays a single Hub priority item with score, type indicator,
 * action buttons, and AI reasoning. Used on the Home page.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```tsx
 * import { PriorityCard, PriorityCardSkeleton } from '@/components/shared';
 * ```
 *
 * @module components/shared/PriorityCard
 * @since February 2026 — Phase 4 Navigation Redesign (extracted from Home page)
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
import type { HubPriorityItem } from '@/services/hub';
import {
  Mail,
  CheckSquare,
  Calendar,
  CalendarClock,
  Clock,
  ArrowRight,
  Sparkles,
  AlertTriangle,
  Building2,
  TrendingUp,
  Brain,
  Zap,
  MessageSquare,
  Eye,
  Archive,
  CalendarPlus,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Type configuration for Hub priority items.
 * Maps each item type to its display properties.
 */
const TYPE_CONFIG: Record<
  HubPriorityItem['type'],
  { icon: React.ElementType; color: string; bgColor: string; label: string }
> = {
  email: {
    icon: Mail,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    label: 'Email',
  },
  action: {
    icon: CheckSquare,
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    label: 'Action',
  },
  event: {
    icon: Calendar,
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    label: 'Event',
  },
  extracted_date: {
    icon: CalendarClock,
    color: 'text-rose-600 dark:text-rose-400',
    bgColor: 'bg-rose-100 dark:bg-rose-900/30',
    label: 'Date',
  },
};

/**
 * Action button configuration for priority cards.
 */
const ACTION_CONFIG: Record<
  NonNullable<HubPriorityItem['suggestedAction']>,
  { icon: React.ElementType; label: string; variant: 'default' | 'secondary' | 'outline' }
> = {
  respond: { icon: MessageSquare, label: 'Respond', variant: 'default' },
  review: { icon: Eye, label: 'Review', variant: 'secondary' },
  decide: { icon: Brain, label: 'Decide', variant: 'default' },
  schedule: { icon: CalendarPlus, label: 'Schedule', variant: 'secondary' },
  archive: { icon: Archive, label: 'Archive', variant: 'outline' },
  attend: { icon: Calendar, label: 'RSVP', variant: 'default' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface PriorityCardProps {
  item: HubPriorityItem;
  rank: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Priority card for a single Hub item.
 * Displays type icon, score, AI summary, and action buttons.
 */
export function PriorityCard({ item, rank }: PriorityCardProps) {
  const typeConfig = TYPE_CONFIG[item.type];
  const TypeIcon = typeConfig.icon;
  const actionConfig = item.suggestedAction ? ACTION_CONFIG[item.suggestedAction] : null;
  const ActionIcon = actionConfig?.icon;

  const getPriorityColor = (score: number) => {
    if (score >= 80) return 'text-red-600 dark:text-red-400';
    if (score >= 60) return 'text-orange-600 dark:text-orange-400';
    if (score >= 40) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-green-600 dark:text-green-400';
  };

  return (
    <Card className="group relative overflow-hidden transition-all hover:shadow-lg hover:border-primary/20">
      {/* Rank indicator */}
      <div className="absolute top-0 left-0 w-10 h-10 flex items-center justify-center">
        <span className="text-4xl font-bold text-muted-foreground/20">{rank}</span>
      </div>

      {/* Priority score indicator */}
      <div className="absolute top-3 right-3">
        <div className={`flex items-center gap-1.5 ${getPriorityColor(item.priorityScore)}`}>
          <TrendingUp className="h-4 w-4" />
          <span className="text-sm font-semibold">{item.priorityScore}</span>
        </div>
      </div>

      <CardHeader className="pb-2 pt-8">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${typeConfig.bgColor}`}>
            <TypeIcon className={`h-5 w-5 ${typeConfig.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs">{typeConfig.label}</Badge>
              {item.clientName && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <Building2 className="h-3 w-3" />{item.clientName}
                </Badge>
              )}
              {item.timeRemaining && (
                <Badge
                  variant={item.timeRemaining === 'Overdue!' ? 'destructive' : 'outline'}
                  className="text-xs gap-1"
                >
                  <Clock className="h-3 w-3" />{item.timeRemaining}
                </Badge>
              )}
            </div>
            <CardTitle className="text-lg line-clamp-2">{item.title}</CardTitle>
            {item.senderName && (
              <p className="text-sm text-muted-foreground mt-1">From: {item.senderName}</p>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-4">
        {item.aiSummary ? (
          <div className="flex items-start gap-2 mb-3 p-2 rounded-md bg-muted/50">
            <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-sm text-foreground">{item.aiSummary}</p>
          </div>
        ) : item.description ? (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{item.description}</p>
        ) : null}

        <div className="flex items-start gap-2 mb-4">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm text-muted-foreground">{item.whyImportant}</p>
        </div>

        <div className="flex items-center gap-2">
          <Link href={item.href} className="flex-1">
            <Button className="w-full gap-2" variant="default">
              <Zap className="h-4 w-4" /> View & Act <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          {actionConfig && ActionIcon && (
            <Button variant={actionConfig.variant} size="icon" title={actionConfig.label}>
              <ActionIcon className="h-4 w-4" />
            </Button>
          )}
        </div>

        <details className="mt-3">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            Score breakdown
          </summary>
          <div className="mt-2 grid grid-cols-5 gap-1 text-xs text-muted-foreground">
            <div className="text-center"><div className="font-medium">{item.scoreFactors.base.toFixed(1)}</div><div>Base</div></div>
            <div className="text-center"><div className="font-medium">{item.scoreFactors.deadline.toFixed(1)}x</div><div>Deadline</div></div>
            <div className="text-center"><div className="font-medium">{item.scoreFactors.client.toFixed(1)}x</div><div>Client</div></div>
            <div className="text-center"><div className="font-medium">{item.scoreFactors.staleness.toFixed(1)}x</div><div>Staleness</div></div>
            <div className="text-center"><div className="font-medium">{item.scoreFactors.momentum.toFixed(1)}x</div><div>Momentum</div></div>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

/**
 * Loading skeleton for priority cards.
 */
export function PriorityCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-20" />
            </div>
            <Skeleton className="h-6 w-3/4" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        <Skeleton className="h-16 w-full mb-3" />
        <Skeleton className="h-4 w-full mb-4" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}
