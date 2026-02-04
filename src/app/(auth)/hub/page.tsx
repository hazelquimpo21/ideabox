/**
 * Hub Page - Your Top Priorities
 *
 * The Hub shows the 3 most important things requiring your attention,
 * determined by AI-powered priority scoring that considers:
 * - Deadline proximity
 * - Client importance (VIP, high priority)
 * - Item staleness (don't let things slip)
 * - Time context (morning briefing vs evening wrap-up)
 *
 * @module app/(auth)/hub/page
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout';
import { ProfileCompletionNudge } from '@/components/hub';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
  Button,
  Skeleton,
} from '@/components/ui';
import { useHubPriorities, useUserContext } from '@/hooks';
import type { HubPriorityItem } from '@/services/hub';
import {
  Target,
  Mail,
  CheckSquare,
  Calendar,
  CalendarClock,  // Added for extracted_date type
  Clock,
  ArrowRight,
  RefreshCw,
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

// ===============================================================================
// CONSTANTS
// ===============================================================================

/**
 * Type configuration for Hub priority items.
 *
 * Maps each item type to its display properties:
 * - icon: Lucide icon component to render
 * - color: Text color class for the icon
 * - bgColor: Background color class for the icon container
 * - label: Human-readable label for badges
 *
 * UPDATED Jan 2026: Added extracted_date type for timeline intelligence.
 * Extracted dates include deadlines, birthdays, payment dues, etc. from emails.
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
  // NEW: Extracted date type for timeline intelligence (deadlines, birthdays, payments, etc.)
  extracted_date: {
    icon: CalendarClock,
    color: 'text-rose-600 dark:text-rose-400',
    bgColor: 'bg-rose-100 dark:bg-rose-900/30',
    label: 'Date',
  },
};

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

// ===============================================================================
// SUBCOMPONENTS
// ===============================================================================

/**
 * Priority card for a single Hub item.
 */
function PriorityCard({
  item,
  rank,
}: {
  item: HubPriorityItem;
  rank: number;
}) {
  const typeConfig = TYPE_CONFIG[item.type];
  const TypeIcon = typeConfig.icon;
  const actionConfig = item.suggestedAction ? ACTION_CONFIG[item.suggestedAction] : null;
  const ActionIcon = actionConfig?.icon;

  // Priority indicator color based on score
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
        <span className="text-4xl font-bold text-muted-foreground/20">
          {rank}
        </span>
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
          {/* Type icon */}
          <div className={`p-2 rounded-lg ${typeConfig.bgColor}`}>
            <TypeIcon className={`h-5 w-5 ${typeConfig.color}`} />
          </div>

          <div className="flex-1 min-w-0">
            {/* Type and client badges */}
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs">
                {typeConfig.label}
              </Badge>
              {item.clientName && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <Building2 className="h-3 w-3" />
                  {item.clientName}
                </Badge>
              )}
              {item.timeRemaining && (
                <Badge
                  variant={item.timeRemaining === 'Overdue!' ? 'destructive' : 'outline'}
                  className="text-xs gap-1"
                >
                  <Clock className="h-3 w-3" />
                  {item.timeRemaining}
                </Badge>
              )}
            </div>

            {/* Title */}
            <CardTitle className="text-lg line-clamp-2">
              {item.title}
            </CardTitle>

            {/* Sender for emails */}
            {item.senderName && (
              <p className="text-sm text-muted-foreground mt-1">
                From: {item.senderName}
              </p>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-4">
        {/* AI Summary or description */}
        {item.aiSummary ? (
          <div className="flex items-start gap-2 mb-3 p-2 rounded-md bg-muted/50">
            <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-sm text-foreground">{item.aiSummary}</p>
          </div>
        ) : item.description ? (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
            {item.description}
          </p>
        ) : null}

        {/* Why important */}
        <div className="flex items-start gap-2 mb-4">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm text-muted-foreground">
            {item.whyImportant}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Link href={item.href} className="flex-1">
            <Button className="w-full gap-2" variant="default">
              <Zap className="h-4 w-4" />
              View & Act
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          {actionConfig && ActionIcon && (
            <Button variant={actionConfig.variant} size="icon" title={actionConfig.label}>
              <ActionIcon className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Score breakdown (collapsible detail) */}
        <details className="mt-3">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            Score breakdown
          </summary>
          <div className="mt-2 grid grid-cols-5 gap-1 text-xs text-muted-foreground">
            <div className="text-center">
              <div className="font-medium">{item.scoreFactors.base.toFixed(1)}</div>
              <div>Base</div>
            </div>
            <div className="text-center">
              <div className="font-medium">{item.scoreFactors.deadline.toFixed(1)}x</div>
              <div>Deadline</div>
            </div>
            <div className="text-center">
              <div className="font-medium">{item.scoreFactors.client.toFixed(1)}x</div>
              <div>Client</div>
            </div>
            <div className="text-center">
              <div className="font-medium">{item.scoreFactors.staleness.toFixed(1)}x</div>
              <div>Staleness</div>
            </div>
            <div className="text-center">
              <div className="font-medium">{item.scoreFactors.momentum.toFixed(1)}x</div>
              <div>Momentum</div>
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

/**
 * Loading skeleton for priority cards.
 */
function PriorityCardSkeleton() {
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

/**
 * Empty state when no priorities.
 */
function EmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Target className="h-8 w-8 text-muted-foreground" />
        </div>
        <CardTitle className="text-xl mb-2">All caught up!</CardTitle>
        <CardDescription className="max-w-sm mb-6">
          No urgent priorities right now. Check Discover or actions for
          things to work on.
        </CardDescription>
        <div className="flex gap-3">
          <Link href="/discover">
            <Button variant="outline" className="gap-2">
              <Mail className="h-4 w-4" />
              View Discover
            </Button>
          </Link>
          <Link href="/actions">
            <Button variant="outline" className="gap-2">
              <CheckSquare className="h-4 w-4" />
              View Actions
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Stats banner showing how priorities were calculated.
 *
 * Displays a summary of items considered during priority calculation:
 * - Total candidates analyzed by AI
 * - Breakdown by type: emails, actions, events, extracted dates
 * - Last updated timestamp
 *
 * UPDATED Jan 2026: Added extractedDatesConsidered for timeline intelligence.
 */
function StatsBanner({
  stats,
  lastUpdated,
}: {
  stats: {
    totalCandidates: number;
    emailsConsidered: number;
    actionsConsidered: number;
    eventsConsidered: number;
    extractedDatesConsidered?: number;  // NEW: Extracted dates (deadlines, birthdays, etc.)
    processingTimeMs: number;
  } | null;
  lastUpdated: string | null;
}) {
  // Guard clause: Don't render if no stats available
  if (!stats) return null;

  /**
   * Formats an ISO timestamp to a readable time string.
   * @param iso - ISO 8601 timestamp string
   * @returns Formatted time like "2:30 PM"
   */
  const formatTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Build the items breakdown string, including extracted dates if present
  const itemsBreakdown = [
    `${stats.emailsConsidered} emails`,
    `${stats.actionsConsidered} actions`,
    `${stats.eventsConsidered} events`,
    // Only show extracted dates if the count is present and > 0
    ...(stats.extractedDatesConsidered && stats.extractedDatesConsidered > 0
      ? [`${stats.extractedDatesConsidered} dates`]
      : []),
  ].join(', ');

  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground mb-6 px-1">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1">
          <Brain className="h-3 w-3" />
          AI analyzed {stats.totalCandidates} items
        </span>
        <span>{itemsBreakdown}</span>
      </div>
      {lastUpdated && (
        <span>
          Updated at {formatTime(lastUpdated)}
        </span>
      )}
    </div>
  );
}

// ===============================================================================
// MAIN COMPONENT
// ===============================================================================

/**
 * Hub Page - Shows top 3 priority items.
 */
export default function HubPage() {
  const {
    items,
    stats,
    lastUpdated,
    isLoading,
    error,
    refetch,
  } = useHubPriorities({ limit: 3, refreshInterval: 5 * 60 * 1000 }); // Refresh every 5 min

  // User context for profile completion nudge
  const { completionPercent, incompleteSections, isLoading: isLoadingContext } = useUserContext();

  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  // Get greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div>
      {/* Page Header */}
      <PageHeader
        title="Hub"
        description={`${getGreeting()}! Here are your top priorities.`}
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Hub' },
        ]}
        actions={
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleRefresh}
            disabled={isLoading || isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      {/* Profile Completion Nudge - shows when profile <50% complete */}
      {!isLoadingContext && (
        <ProfileCompletionNudge
          completionPercent={completionPercent}
          incompleteSections={incompleteSections}
        />
      )}

      {/* How AI Determines Priorities - Info Banner */}
      <Card className="mb-6 bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-1">
                AI-Powered Priority Scoring
              </h3>
              <p className="text-sm text-muted-foreground">
                These priorities are calculated using multiple signals: deadline proximity,
                client importance, item staleness, and time context. The system learns
                from your patterns to surface what matters most.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Banner */}
      {!isLoading && <StatsBanner stats={stats} lastUpdated={lastUpdated} />}

      {/* Error State */}
      {error && (
        <Card className="mb-6 border-destructive/50 bg-destructive/5">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-medium">Failed to load priorities</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {error.message}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={handleRefresh}
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Priority Cards */}
      <div className="space-y-4">
        {isLoading ? (
          // Loading skeletons
          <>
            <PriorityCardSkeleton />
            <PriorityCardSkeleton />
            <PriorityCardSkeleton />
          </>
        ) : items.length === 0 ? (
          // Empty state
          <EmptyState />
        ) : (
          // Priority items
          items.map((item, index) => (
            <PriorityCard key={item.id} item={item} rank={index + 1} />
          ))
        )}
      </div>

      {/* Navigation to other views */}
      {!isLoading && items.length > 0 && (
        <div className="mt-8 pt-6 border-t">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">
            Explore more
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Link href="/discover">
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="py-4 flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-amber-500" />
                  <span className="font-medium">Discover</span>
                </CardContent>
              </Card>
            </Link>
            <Link href="/actions">
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="py-4 flex items-center gap-3">
                  <CheckSquare className="h-5 w-5 text-purple-500" />
                  <span className="font-medium">Actions</span>
                </CardContent>
              </Card>
            </Link>
            <Link href="/clients">
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="py-4 flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-teal-500" />
                  <span className="font-medium">Clients</span>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
