'use client';

import * as React from 'react';
import { Badge, Button, Skeleton } from '@/components/ui';
import {
  Brain,
  Loader2,
  AlertCircle,
  Calendar,
  Clock,
  Reply,
  Bookmark,
  CheckCircle2,
  Plus,
  Newspaper,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';
import { EventDetailsCard } from './EventDetailsCard';
import {
  getActionTypeIcon,
  getUrgencyColor,
  getNuggetBadgeColor,
} from './analysis/helpers';
import type { NormalizedAnalysis } from '@/hooks/useEmailAnalysis';
import type { ExtractedDate } from '@/hooks/useExtractedDates';
import type { Email } from '@/types/database';

const logger = createLogger('AIDigestView');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface AIDigestViewProps {
  email: Email;
  analysis?: NormalizedAnalysis | null;
  isLoadingAnalysis?: boolean;
  extractedDates?: ExtractedDate[];
  onAnalyze?: (emailId: string) => Promise<void>;
  isAnalyzing?: boolean;
  refetchAnalysis?: () => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const SIGNAL_COLORS: Record<string, string> = {
  high: 'bg-emerald-500',
  medium: 'bg-yellow-500',
  low: 'bg-slate-400',
  noise: 'bg-slate-300',
};

const CATEGORY_TO_IDEA_TYPE: Record<string, string> = {
  clients: 'business', work: 'business',
  newsletters_creator: 'content_creation', newsletters_industry: 'learning',
  personal_friends_family: 'personal_growth', family: 'family_activity',
  finance: 'business', shopping: 'personal_growth',
  local: 'place_to_visit', travel: 'place_to_visit',
  news_politics: 'learning', product_updates: 'tool_to_try',
  notifications: 'learning',
};

const NUGGET_TO_IDEA_TYPE: Record<string, string> = {
  deal: 'business', tip: 'learning', quote: 'content_creation',
  stat: 'business', recommendation: 'learning',
  remember_this: 'business', sales_opportunity: 'business',
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const AIDigestView = React.memo(function AIDigestView({
  email,
  analysis,
  isLoadingAnalysis,
  extractedDates,
  onAnalyze,
  isAnalyzing,
  refetchAnalysis,
}: AIDigestViewProps) {
  const [savedPoints, setSavedPoints] = React.useState<Set<string>>(new Set());

  const handleAnalyze = React.useCallback(async () => {
    if (onAnalyze) {
      await onAnalyze(email.id);
      if (refetchAnalysis) await refetchAnalysis();
    }
  }, [onAnalyze, email.id, refetchAnalysis]);

  const handleSave = React.useCallback(async (key: string, idea: string, ideaType: string, relevance: string) => {
    try {
      await fetch('/api/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idea,
          ideaType,
          relevance,
          confidence: 0.7,
          emailId: email.id,
        }),
      });
      setSavedPoints(prev => new Set(prev).add(key));
      logger.info('Saved from digest', { key, emailId: email.id.substring(0, 8) });
    } catch (err) {
      logger.error('Failed to save', { error: err instanceof Error ? err.message : 'Unknown' });
    }
  }, [email.id]);

  // Merge extracted dates from hook + analysis (must be before early returns — Rules of Hooks)
  const dates = analysis?.dateExtraction;
  const allDates = React.useMemo(() => {
    if (extractedDates && extractedDates.length > 0) {
      return extractedDates.map(d => ({
        title: d.title,
        date: d.date,
        time: d.event_time || undefined,
        dateType: d.date_type || 'other',
      }));
    }
    if (dates?.hasDates && dates.dates.length > 0) {
      return dates.dates.map(d => ({
        title: d.title,
        date: d.date,
        time: d.time,
        dateType: d.dateType,
      }));
    }
    return [];
  }, [extractedDates, dates]);

  // ── Not analyzed ───────────────────────────────────────────────────────────
  if (!email.analyzed_at) {
    return (
      <div className="px-6 py-5">
        <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-dashed">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <Brain className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-sm">AI Analysis Pending</p>
              <p className="text-xs text-muted-foreground">
                Analyze to see synopsis, actions, and key facts
              </p>
            </div>
          </div>
          <Button variant="default" size="sm" onClick={handleAnalyze} disabled={isAnalyzing}>
            {isAnalyzing ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing...</>
            ) : (
              <><Brain className="h-4 w-4 mr-2" />Analyze</>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoadingAnalysis && !analysis) {
    return (
      <div className="px-6 py-5 space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-3/4" />
        <div className="space-y-2 pt-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (email.analysis_error) {
    return (
      <div className="px-6 py-5">
        <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="font-medium text-sm text-destructive">Analysis Failed</p>
              <p className="text-xs text-muted-foreground">{email.analysis_error}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleAnalyze} disabled={isAnalyzing}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!analysis) return null;

  // ── Extract data ───────────────────────────────────────────────────────────
  const cat = analysis.categorization;
  const digest = analysis.contentDigest;
  const actions = analysis.actionExtraction;
  const nuggets = digest?.goldenNuggets;
  const event = analysis.eventDetection;
  const multiEvent = analysis.multiEventDetection;
  const news = analysis.newsBrief;
  const inferredIdeaType = email.category
    ? (CATEGORY_TO_IDEA_TYPE[email.category] || 'learning')
    : 'learning';

  const signalDot = cat?.signalStrength ? SIGNAL_COLORS[cat.signalStrength] : null;

  return (
    <div className="px-6 py-5 space-y-4">
      {/* ── Status pills ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {cat?.category && (
          <Badge variant="outline" className="text-xs">
            {cat.category.replace(/_/g, ' ')}
          </Badge>
        )}
        {cat?.signalStrength && signalDot && (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className={cn('h-2 w-2 rounded-full', signalDot)} />
            {cat.signalStrength}
          </span>
        )}
        {(cat?.replyWorthiness === 'must_reply' || cat?.replyWorthiness === 'should_reply') && (
          <span className={cn(
            'inline-flex items-center gap-1 font-medium px-2 py-0.5 rounded-full',
            cat.replyWorthiness === 'must_reply'
              ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
              : 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400',
          )}>
            <Reply className="h-2.5 w-2.5" />
            {cat.replyWorthiness === 'must_reply' ? 'Must Reply' : 'Should Reply'}
          </span>
        )}
        {cat?.confidence && (
          <span className="text-muted-foreground ml-auto">
            {Math.round(cat.confidence * 100)}%
          </span>
        )}
      </div>

      {/* ── Gist ──────────────────────────────────────────────────────────── */}
      {digest?.gist && (
        <p className="text-lg font-semibold leading-snug text-foreground">
          {digest.gist}
        </p>
      )}

      {/* ── Key points ────────────────────────────────────────────────────── */}
      {digest?.keyPoints && digest.keyPoints.length > 0 && (
        <ul className="space-y-1.5">
          {digest.keyPoints.map((kp, i) => (
            <li key={i} className="group/kp flex items-start gap-2 text-sm">
              <span className="text-muted-foreground mt-0.5 shrink-0">&#8226;</span>
              <span className="flex-1">{kp.point}</span>
              {savedPoints.has(`kp-${i}`) ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 opacity-0 group-hover/kp:opacity-100 transition-opacity shrink-0 mt-0.5"
                  title="Save as idea"
                  onClick={() => handleSave(`kp-${i}`, kp.point, inferredIdeaType, 'Key point from email digest')}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* ── Action items ──────────────────────────────────────────────────── */}
      {actions?.hasAction && (
        <div className="rounded-lg bg-amber-50/60 dark:bg-amber-900/10 p-3 space-y-2">
          {actions.actions && actions.actions.length > 0 ? (
            actions.actions.map((action, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400">
                  {getActionTypeIcon(action.type)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{action.title}</p>
                  {action.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
                  )}
                  <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                    {action.deadline && (
                      <span className="flex items-center gap-0.5">
                        <Calendar className="h-3 w-3" />
                        {new Date(action.deadline).toLocaleDateString()}
                      </span>
                    )}
                    {action.estimatedMinutes && (
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-3 w-3" />
                        ~{action.estimatedMinutes} min
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400">
                {getActionTypeIcon(actions.actionType)}
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {actions.actionTitle || `${actions.actionType} required`}
                </p>
                {actions.actionDescription && (
                  <p className="text-xs text-muted-foreground mt-0.5">{actions.actionDescription}</p>
                )}
                {actions.deadline && (
                  <span className="flex items-center gap-0.5 text-xs text-muted-foreground mt-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(actions.deadline).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          )}
          {actions.urgencyScore && actions.urgencyScore >= 6 && (
            <p className={cn('text-xs font-medium', getUrgencyColor(actions.urgencyScore))}>
              Urgency: {actions.urgencyScore}/10
            </p>
          )}
        </div>
      )}

      {/* ── Golden nuggets ────────────────────────────────────────────────── */}
      {nuggets && nuggets.length > 0 && (
        <div className="space-y-1.5">
          {nuggets.map((nugget, i) => (
            <div
              key={i}
              className="group flex items-start gap-2 pl-3 border-l-2 border-amber-300 dark:border-amber-700"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-snug">{nugget.nugget}</p>
                <Badge
                  variant="outline"
                  className={cn('text-[10px] mt-1', getNuggetBadgeColor(nugget.type))}
                >
                  {nugget.type.replace(/_/g, ' ')}
                </Badge>
              </div>
              {savedPoints.has(`nugget-${i}`) ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  title="Save nugget"
                  onClick={() => handleSave(
                    `nugget-${i}`,
                    nugget.nugget,
                    NUGGET_TO_IDEA_TYPE[nugget.type] || 'business',
                    `Extracted ${nugget.type.replace(/_/g, ' ')} from email`,
                  )}
                >
                  <Bookmark className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Key dates ─────────────────────────────────────────────────────── */}
      {allDates.length > 0 && (
        <div className="space-y-1">
          {allDates.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <Calendar className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span className="font-medium">
                {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              {d.time && (
                <span className="text-muted-foreground text-xs">{d.time}</span>
              )}
              <span className="text-muted-foreground">&mdash;</span>
              <span className="truncate">{d.title}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Event details ─────────────────────────────────────────────────── */}
      {/* Show all events: multi-event emails show each event card,
          single-event emails show the single EventDetailsCard */}
      {multiEvent?.hasMultipleEvents && multiEvent.events.length > 0 ? (
        <div className="-mx-6 space-y-2">
          {multiEvent.sourceDescription && (
            <p className="mx-6 text-xs text-muted-foreground font-medium uppercase tracking-wider">
              {multiEvent.sourceDescription} ({multiEvent.events.length} events)
            </p>
          )}
          {multiEvent.events.map((evt, index) => (
            <EventDetailsCard
              key={`me-${index}`}
              event={evt}
              emailSubject={email.subject || undefined}
              description={email.snippet || undefined}
            />
          ))}
        </div>
      ) : event?.hasEvent ? (
        <div className="-mx-6">
          <EventDetailsCard
            event={event}
            emailSubject={email.subject || undefined}
            description={email.snippet || undefined}
          />
        </div>
      ) : null}

      {/* ── News brief headlines ──────────────────────────────────────────── */}
      {news?.hasNews && news.newsItems.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <Newspaper className="h-3 w-3" />
            News
          </div>
          {news.newsItems.map((item, i) => (
            <div key={i} className="text-sm">
              <p className="font-medium">{item.headline}</p>
              <p className="text-xs text-muted-foreground">{item.detail}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
