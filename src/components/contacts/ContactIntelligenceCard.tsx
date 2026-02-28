/**
 * ContactIntelligenceCard Component
 *
 * Displays aggregated AI intelligence for a specific contact:
 * - Relationship trend (positive/neutral/negative signal distribution)
 * - Common topics from emails with this contact
 * - Extracted key dates (birthdays, deadlines, events)
 * - Communication frequency (emails per month sparkline)
 *
 * Used on the Contact Detail page (/contacts/[id]).
 *
 * @module components/contacts/ContactIntelligenceCard
 * @since February 2026 — Phase 1: Contact intelligence
 */

'use client';

import * as React from 'react';
import { format } from 'date-fns';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Tag,
  Calendar,
  BarChart3,
  Loader2,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Skeleton,
} from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';
import {
  useContactIntelligence,
  type RelationshipTrend,
  type TopicEntry,
  type ExtractedDateEntry,
  type MonthlyStats,
} from '@/hooks/useContactIntelligence';

const logger = createLogger('ContactIntelligenceCard');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Props for the ContactIntelligenceCard */
export interface ContactIntelligenceCardProps {
  /** Contact ID to fetch intelligence for */
  contactId: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Relationship trend indicator with color-coded signal */
function RelationshipTrendDisplay({ trend }: { trend: RelationshipTrend }) {
  const config: Record<string, { icon: React.ElementType; color: string; label: string }> = {
    positive: { icon: TrendingUp, color: 'text-green-600 dark:text-green-400', label: 'Positive' },
    neutral: { icon: Minus, color: 'text-slate-500 dark:text-slate-400', label: 'Neutral' },
    negative: { icon: TrendingDown, color: 'text-red-600 dark:text-red-400', label: 'Negative' },
    unknown: { icon: Minus, color: 'text-muted-foreground', label: 'Unknown' },
  };

  const fallback = { icon: Minus, color: 'text-muted-foreground', label: 'Unknown' };
  const { icon: Icon, color, label } = config[trend.dominant] ?? fallback;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4', color)} />
        <span className={cn('font-medium text-sm', color)}>{label}</span>
        <span className="text-xs text-muted-foreground">
          ({trend.totalEmails} email{trend.totalEmails !== 1 ? 's' : ''} analyzed)
        </span>
      </div>
      {/* Signal distribution bar */}
      {trend.totalEmails > 0 && (
        <div className="flex h-2 rounded-full overflow-hidden bg-muted">
          {trend.counts.positive > 0 && (
            <div
              className="bg-green-500"
              style={{ width: `${(trend.counts.positive / trend.totalEmails) * 100}%` }}
              title={`${trend.counts.positive} positive`}
            />
          )}
          {trend.counts.neutral > 0 && (
            <div
              className="bg-slate-400"
              style={{ width: `${(trend.counts.neutral / trend.totalEmails) * 100}%` }}
              title={`${trend.counts.neutral} neutral`}
            />
          )}
          {trend.counts.negative > 0 && (
            <div
              className="bg-red-500"
              style={{ width: `${(trend.counts.negative / trend.totalEmails) * 100}%` }}
              title={`${trend.counts.negative} negative`}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Common topics display as pill badges */
function TopicsDisplay({ topics }: { topics: TopicEntry[] }) {
  if (topics.length === 0) return <EmptyPlaceholder text="No topics extracted yet" />;

  return (
    <div className="flex flex-wrap gap-1.5">
      {topics.map(({ topic, count }) => (
        <Badge key={topic} variant="secondary" className="text-xs gap-1">
          <Tag className="h-2.5 w-2.5" />
          {topic}
          <span className="text-muted-foreground">({count})</span>
        </Badge>
      ))}
    </div>
  );
}

/** Key dates list */
function DatesDisplay({ dates }: { dates: ExtractedDateEntry[] }) {
  if (dates.length === 0) return <EmptyPlaceholder text="No key dates found" />;

  return (
    <ul className="space-y-1.5">
      {dates.map((d, i) => (
        <li key={`${d.date}-${i}`} className="flex items-center gap-2 text-sm">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="truncate">{d.title}</span>
          <span className="text-xs text-muted-foreground shrink-0">
            {formatSafeDate(d.date)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Simple communication frequency bars */
function FrequencyDisplay({ stats }: { stats: MonthlyStats[] }) {
  const maxCount = Math.max(...stats.map(s => s.count), 1);

  return (
    <div className="flex items-end gap-1 h-12">
      {stats.map(({ month, count }) => (
        <div key={month} className="flex-1 flex flex-col items-center gap-0.5">
          <div
            className="w-full rounded-t bg-primary/30 min-h-[2px]"
            style={{ height: `${Math.max((count / maxCount) * 100, 5)}%` }}
            title={`${month}: ${count} emails`}
          />
          <span className="text-[8px] text-muted-foreground">
            {month.slice(5)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Placeholder for empty data */
function EmptyPlaceholder({ text }: { text: string }) {
  return (
    <p className="text-xs text-muted-foreground italic">{text}</p>
  );
}

/**
 * Safely format a date string, returning the original on parse failure.
 */
function formatSafeDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'MMM d, yyyy');
  } catch {
    return dateStr;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Renders an Intelligence section for a contact detail page.
 * Fetches data via useContactIntelligence and displays relationship trend,
 * common topics, key dates, and communication frequency.
 */
export function ContactIntelligenceCard({ contactId }: ContactIntelligenceCardProps) {
  const { data, isLoading, error } = useContactIntelligence(contactId);

  React.useEffect(() => {
    logger.debug('ContactIntelligenceCard mounted', { contactId });
  }, [contactId]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Intelligence
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyPlaceholder text={error || 'Not enough data to generate intelligence.'} />
        </CardContent>
      </Card>
    );
  }

  // Don't render if there's basically no data
  const hasAnyData = data.relationshipTrend.totalEmails > 0
    || data.commonTopics.length > 0
    || data.extractedDates.length > 0;

  if (!hasAnyData) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyPlaceholder text="Not enough email data to generate intelligence for this contact." />
        </CardContent>
      </Card>
    );
  }

  logger.debug('Rendering contact intelligence', {
    contactId,
    dominant: data.relationshipTrend.dominant,
    topicCount: data.commonTopics.length,
    dateCount: data.extractedDates.length,
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Intelligence
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Relationship Trend */}
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-1.5">Relationship Signal</h4>
          <RelationshipTrendDisplay trend={data.relationshipTrend} />
        </div>

        {/* Common Topics */}
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-1.5">Common Topics</h4>
          <TopicsDisplay topics={data.commonTopics} />
        </div>

        {/* Key Dates */}
        {data.extractedDates.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-1.5">Key Dates</h4>
            <DatesDisplay dates={data.extractedDates} />
          </div>
        )}

        {/* Communication Frequency */}
        {data.communicationStats.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-1.5">
              Communication Pattern (6 months)
            </h4>
            <FrequencyDisplay stats={data.communicationStats} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
