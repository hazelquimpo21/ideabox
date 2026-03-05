/**
 * NowCard — displays the single highest-priority item across all types.
 * Implements §4b "The Trifecta Layout" from VIEW_REDESIGN_PLAN.md.
 *
 * Uses elevated card style with timeliness-driven accent border.
 * Falls back to a "clean desk" empty state when no urgent items exist.
 *
 * @module components/home/NowCard
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Skeleton,
} from '@/components/ui';
import { Tooltip } from '@/components/ui/tooltip';
import { EmptyState } from '@/components/shared';
import {
  Zap,
  Mail,
  CheckSquare,
  Calendar,
  CalendarClock,
  MessageSquare,
  Eye,
  Archive,
  CalendarPlus,
  Brain,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';
import { ShortcutHint } from '@/components/shared/ShortcutHint';
import type { HubPriorityItem } from '@/services/hub';

const logger = createLogger('NowCard');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface NowCardProps {
  item: HubPriorityItem | null;
  isLoading: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const TYPE_ICONS: Record<HubPriorityItem['type'], React.ElementType> = {
  email: Mail,
  action: CheckSquare,
  event: Calendar,
  extracted_date: CalendarClock,
};

const ACTION_CONFIG: Record<string, { icon: React.ElementType; label: string }> = {
  respond: { icon: MessageSquare, label: 'Reply' },
  review: { icon: Eye, label: 'Review' },
  decide: { icon: Brain, label: 'Decide' },
  schedule: { icon: CalendarPlus, label: 'Schedule' },
  archive: { icon: Archive, label: 'Archive' },
  attend: { icon: Calendar, label: 'RSVP' },
};

/**
 * Maps priority score to a timeliness-like accent color.
 * WHY: Hub items don't always have timeliness nature — we approximate from score.
 */
function getAccentFromScore(score: number): string {
  if (score >= 80) return 'red-500';
  if (score >= 60) return 'orange-400';
  if (score >= 40) return 'blue-500';
  return 'slate-400';
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function NowCard({ item, isLoading }: NowCardProps) {
  if (isLoading) {
    return (
      <Card elevation="elevated">
        <CardHeader>
          <Skeleton className="h-5 w-24" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-5 w-full mb-2" />
          <Skeleton className="h-4 w-2/3 mb-4" />
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!item) {
    logger.debug('No priority items — showing clean desk state');
    return (
      <Card elevation="elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            Now
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            variant="clean-desk"
            title="Nothing urgent. Your desk is clear."
            className="py-4"
          />
        </CardContent>
      </Card>
    );
  }

  logger.debug('Rendering top priority item', {
    itemType: item.type,
    itemId: item.id,
    score: item.priorityScore,
  });

  const TypeIcon = TYPE_ICONS[item.type];
  const accent = getAccentFromScore(item.priorityScore);
  const primaryAction = item.suggestedAction ? ACTION_CONFIG[item.suggestedAction] : null;

  // Build tooltip content showing priority reasoning
  const reasoningTooltip = (
    <div className="space-y-1.5">
      <p className="font-medium text-sm">{item.whyImportant}</p>
      <div className="grid grid-cols-5 gap-1 text-xs text-muted-foreground pt-1 border-t">
        <div className="text-center"><div className="font-medium">{item.scoreFactors.base.toFixed(1)}</div><div>Base</div></div>
        <div className="text-center"><div className="font-medium">{item.scoreFactors.deadline.toFixed(1)}x</div><div>Deadline</div></div>
        <div className="text-center"><div className="font-medium">{item.scoreFactors.client.toFixed(1)}x</div><div>Client</div></div>
        <div className="text-center"><div className="font-medium">{item.scoreFactors.staleness.toFixed(1)}x</div><div>Staleness</div></div>
        <div className="text-center"><div className="font-medium">{item.scoreFactors.momentum.toFixed(1)}x</div><div>Momentum</div></div>
      </div>
    </div>
  );

  return (
    <Tooltip variant="rich" content={reasoningTooltip}>
      <Card elevation="elevated" accent={accent}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            Now
            <ShortcutHint keys={['N']} className="ml-auto" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Item info */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <TypeIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              <p className="text-sm font-medium truncate">{item.title}</p>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {item.senderName || item.clientName || item.description}
            </p>
            {item.timeRemaining && (
              <p className="text-xs text-muted-foreground mt-1">{item.timeRemaining}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Link href={item.href} className="flex-1">
              <Button size="sm" className="w-full gap-1.5">
                {primaryAction ? (
                  <>
                    <primaryAction.icon className="h-3.5 w-3.5" />
                    {primaryAction.label}
                  </>
                ) : (
                  'View & Act'
                )}
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </Tooltip>
  );
}

export default NowCard;
