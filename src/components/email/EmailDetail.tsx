/* eslint-disable max-lines */
/**
 * Email Detail Component
 *
 * Displays the full content of a selected email with rich AI analysis.
 * Used in a slide-out panel from the email list.
 *
 * @module components/email/EmailDetail
 */

'use client';

import * as React from 'react';
import { Button, Badge, Card, CardContent, CardHeader, Skeleton } from '@/components/ui';
import { useEmailAnalysis, useExtractedDates } from '@/hooks';
import { EventDetailsCard } from './EventDetailsCard';
import { ContentDigestSection } from './ContentDigestSection';
import { DateExtractionSection } from './DateExtractionSection';
import { createLogger } from '@/lib/utils/logger';
import { cn } from '@/lib/utils/cn';
import {
  X,
  Star,
  Archive,
  Mail,
  MailOpen,
  Clock,
  User,
  Calendar,
  AlertCircle,
  Newspaper,
  CheckCircle2,
  Building2,
  ExternalLink,
  Brain,
  Loader2,
  Zap,
  Target,
  MessageSquare,
  FileEdit,
  CalendarClock,
  HelpCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Lightbulb,
  Bookmark,
  Sparkles,
  Rss,
  Signal,
  Reply,
  ListChecks,
  Gem,
  Palette,
  Bell,
} from 'lucide-react';
import type { Email, EmailCategory } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('EmailDetail');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface EmailDetailProps {
  email: Email;
  onStar?: (emailId: string) => void;
  onArchive?: (emailId: string) => void;
  onToggleRead?: (emailId: string) => void;
  onAnalyze?: (emailId: string) => Promise<void>;
  onClose?: () => void;
  isLoading?: boolean;
  isAnalyzing?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Maps life-bucket email categories to badge display properties.
 *
 * REFACTORED (Jan 2026): Updated from action-focused categories to life-bucket categories.
 * Each category represents an area of the user's life, not an action type.
 *
 * @param category - The email category from AI analysis
 * @returns Badge variant, label, and icon for display
 */
function getCategoryBadge(category: EmailCategory | null): {
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  label: string;
  icon: React.ReactNode;
} {
  if (!category) {
    return { variant: 'outline', label: 'Uncategorized', icon: <Mail className="h-3 w-3" /> };
  }

  switch (category) {
    // Work & Business
    case 'clients':
      return { variant: 'default', label: 'Client', icon: <Building2 className="h-3 w-3" /> };
    case 'work':
      return { variant: 'secondary', label: 'Work', icon: <Building2 className="h-3 w-3" /> };

    // Personal & Family
    case 'personal_friends_family':
      return { variant: 'outline', label: 'Personal', icon: <User className="h-3 w-3" /> };
    case 'family':
      return { variant: 'outline', label: 'Family', icon: <User className="h-3 w-3" /> };

    // Finance & Shopping
    case 'finance':
      return { variant: 'secondary', label: 'Finance', icon: <Mail className="h-3 w-3" /> };
    case 'shopping':
      return { variant: 'outline', label: 'Shopping', icon: <Mail className="h-3 w-3" /> };

    // Content & News
    case 'newsletters_creator':
      return { variant: 'secondary', label: 'Newsletter', icon: <Newspaper className="h-3 w-3" /> };
    case 'newsletters_industry':
      return { variant: 'secondary', label: 'Industry Newsletter', icon: <Newspaper className="h-3 w-3" /> };
    case 'news_politics':
      return { variant: 'secondary', label: 'News', icon: <Newspaper className="h-3 w-3" /> };
    case 'product_updates':
      return { variant: 'outline', label: 'Product Update', icon: <Mail className="h-3 w-3" /> };

    // Location & Travel
    case 'local':
      return { variant: 'default', label: 'Local', icon: <Calendar className="h-3 w-3" /> };
    case 'travel':
      return { variant: 'outline', label: 'Travel', icon: <Calendar className="h-3 w-3" /> };

    // Notifications & Alerts
    case 'notifications':
      return { variant: 'outline', label: 'Alert', icon: <Bell className="h-3 w-3" /> };

    default: {
      // Defensive fallback for any future categories not yet handled
      const fallbackCategory = category as string;
      return { variant: 'outline', label: fallbackCategory.replace(/_/g, ' '), icon: <Mail className="h-3 w-3" /> };
    }
  }
}

function getActionTypeIcon(actionType: string) {
  switch (actionType) {
    case 'respond': return <MessageSquare className="h-4 w-4" />;
    case 'review': return <FileEdit className="h-4 w-4" />;
    case 'create': return <FileEdit className="h-4 w-4" />;
    case 'schedule': return <CalendarClock className="h-4 w-4" />;
    case 'decide': return <HelpCircle className="h-4 w-4" />;
    case 'pay': return <Mail className="h-4 w-4" />;
    case 'submit': return <ExternalLink className="h-4 w-4" />;
    case 'register': return <CheckCircle2 className="h-4 w-4" />;
    case 'book': return <Calendar className="h-4 w-4" />;
    default: return <Target className="h-4 w-4" />;
  }
}

function getUrgencyColor(score: number): string {
  if (score >= 8) return 'text-red-600 dark:text-red-400';
  if (score >= 6) return 'text-orange-600 dark:text-orange-400';
  if (score >= 4) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-green-600 dark:text-green-400';
}

function getRelationshipIcon(signal: string) {
  switch (signal) {
    case 'positive': return <TrendingUp className="h-4 w-4 text-green-500" />;
    case 'negative': return <TrendingDown className="h-4 w-4 text-red-500" />;
    default: return <Minus className="h-4 w-4 text-muted-foreground" />;
  }
}

function getSignalBadge(signal: string): { label: string; className: string } {
  switch (signal) {
    case 'high': return { label: 'High Signal', className: 'bg-green-100 text-green-700 border-green-200' };
    case 'medium': return { label: 'Medium Signal', className: 'bg-blue-100 text-blue-700 border-blue-200' };
    case 'low': return { label: 'Low Signal', className: 'bg-gray-100 text-gray-600 border-gray-200' };
    case 'noise': return { label: 'Noise', className: 'bg-gray-50 text-gray-400 border-gray-100' };
    default: return { label: signal, className: 'bg-gray-100 text-gray-600 border-gray-200' };
  }
}

/** Color coding for different golden nugget types */
function getNuggetBadgeColor(type: string): string {
  switch (type) {
    case 'deal': return 'bg-green-50 text-green-700 border-green-200';
    case 'tip': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'quote': return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'stat': return 'bg-cyan-50 text-cyan-700 border-cyan-200';
    case 'recommendation': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'remember_this': return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'sales_opportunity': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    default: return 'bg-gray-50 text-gray-600 border-gray-200';
  }
}

function getReplyBadge(reply: string): { label: string; className: string } {
  switch (reply) {
    case 'must_reply': return { label: 'Must Reply', className: 'bg-red-100 text-red-700 border-red-200' };
    case 'should_reply': return { label: 'Should Reply', className: 'bg-orange-100 text-orange-700 border-orange-200' };
    case 'optional_reply': return { label: 'Optional Reply', className: 'bg-yellow-100 text-yellow-600 border-yellow-200' };
    case 'no_reply': return { label: 'No Reply Needed', className: 'bg-gray-50 text-gray-400 border-gray-100' };
    default: return { label: reply.replace(/_/g, ' '), className: 'bg-gray-100 text-gray-600 border-gray-200' };
  }
}

function sanitizeHtml(html: string): string {
  let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  clean = clean.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  clean = clean.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');
  clean = clean.replace(
    /<a\s+([^>]*?)href\s*=\s*["']([^"']+)["']([^>]*)>/gi,
    '<a $1href="$2" target="_blank" rel="noopener noreferrer"$3>'
  );
  return clean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function EmailHeader({
  email,
  onStar,
  onArchive,
  onToggleRead,
  onClose,
}: {
  email: Email;
  onStar?: (id: string) => void;
  onArchive?: (id: string) => void;
  onToggleRead?: (id: string) => void;
  onClose?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-6 border-b border-border bg-muted/30">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-sm font-medium text-primary">
              {(email.sender_name || email.sender_email)?.[0]?.toUpperCase() || 'U'}
            </span>
          </div>
          <div className="min-w-0">
            <p className="font-medium truncate">{email.sender_name || email.sender_email}</p>
            <p className="text-sm text-muted-foreground truncate">{email.sender_email}</p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => onStar?.(email.id)}
          className={email.is_starred ? 'text-yellow-500' : 'text-muted-foreground'}>
          <Star className="h-4 w-4" fill={email.is_starred ? 'currentColor' : 'none'} />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onToggleRead?.(email.id)} className="text-muted-foreground">
          {email.is_read ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onArchive?.(email.id)} className="text-muted-foreground">
          <Archive className="h-4 w-4" />
        </Button>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} className="text-muted-foreground">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function EmailSubject({ email }: { email: Email }) {
  const categoryBadge = getCategoryBadge(email.category);
  return (
    <div className="px-6 py-4 border-b border-border">
      <h1 className="text-xl font-semibold mb-2">{email.subject || '(No subject)'}</h1>
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          <span>{formatDate(email.date)}</span>
        </div>
        <Badge variant={categoryBadge.variant} className="gap-1">
          {categoryBadge.icon}
          {categoryBadge.label}
        </Badge>
        {!email.is_read && (
          <Badge variant="outline" className="gap-1">
            <Mail className="h-3 w-3" />
            Unread
          </Badge>
        )}
      </div>
    </div>
  );
}

function AnalysisSummary({
  email,
  onAnalyze,
  isAnalyzing,
}: {
  email: Email;
  onAnalyze?: (emailId: string) => Promise<void>;
  isAnalyzing?: boolean;
}) {
  const { analysis, isLoading: isLoadingAnalysis, refetch } = useEmailAnalysis(email.id);
  const { dates: extractedDates } = useExtractedDates({ emailId: email.id });

  // Handle analyze button click - await analysis then refetch
  const handleAnalyze = React.useCallback(async () => {
    if (onAnalyze) {
      await onAnalyze(email.id);
      // Refetch analysis data after it completes
      await refetch();
    }
  }, [onAnalyze, email.id, refetch]);

  // Not analyzed yet
  if (!email.analyzed_at) {
    return (
      <Card className="mx-6 my-4 border-dashed">
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                <Brain className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-sm">AI Analysis Pending</p>
                <p className="text-xs text-muted-foreground">
                  This email hasn&apos;t been analyzed yet
                </p>
              </div>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={handleAnalyze}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Brain className="h-4 w-4 mr-2" />
                  Analyze Now
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Loading analysis data
  if (isLoadingAnalysis) {
    return (
      <Card className="mx-6 my-4">
        <CardHeader className="py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Loading Analysis...
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Analysis failed
  if (email.analysis_error) {
    return (
      <Card className="mx-6 my-4 border-destructive/50">
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="font-medium text-sm text-destructive">Analysis Failed</p>
                <p className="text-xs text-muted-foreground">{email.analysis_error}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleAnalyze} disabled={isAnalyzing}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show rich analysis
  const analysisCard = (
    <Card className="mx-6 my-4">
      <CardHeader className="py-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            AI Analysis
          </div>
          {analysis?.categorization?.confidence && (
            <span className="text-xs text-muted-foreground">
              {Math.round(analysis.categorization.confidence * 100)}% confident
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {/* Category, Signal, Reply Worthiness & Summary */}
        {analysis?.categorization && (
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-sm font-medium">Category:</span>
              <Badge variant={getCategoryBadge(email.category).variant} className="gap-1">
                {getCategoryBadge(email.category).icon}
                {email.category?.replace('_', ' ')}
              </Badge>
              {/* Additional categories (NEW Feb 2026) */}
              {analysis.categorization.additionalCategories && analysis.categorization.additionalCategories.length > 0 && (
                analysis.categorization.additionalCategories.map((addCat, i) => (
                  <Badge key={i} variant="outline" className="gap-1 text-[10px] border-dashed">
                    {getCategoryBadge(addCat as EmailCategory).icon}
                    {addCat.replace(/_/g, ' ')}
                  </Badge>
                ))
              )}
              {analysis.categorization.signalStrength && (
                <Badge variant="outline" className={`text-[10px] gap-1 ${getSignalBadge(analysis.categorization.signalStrength).className}`}>
                  <Signal className="h-3 w-3" />
                  {getSignalBadge(analysis.categorization.signalStrength).label}
                </Badge>
              )}
              {analysis.categorization.replyWorthiness && analysis.categorization.replyWorthiness !== 'no_reply' && (
                <Badge variant="outline" className={`text-[10px] gap-1 ${getReplyBadge(analysis.categorization.replyWorthiness).className}`}>
                  <Reply className="h-3 w-3" />
                  {getReplyBadge(analysis.categorization.replyWorthiness).label}
                </Badge>
              )}
              {analysis.categorization.quickAction && analysis.categorization.quickAction !== 'none' && (
                <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-600 border-violet-200">
                  {analysis.categorization.quickAction.replace(/_/g, ' ')}
                </Badge>
              )}
            </div>
            {/* AI Summary (conversational one-liner) */}
            {analysis.categorization.summary && (
              <p className="text-sm font-medium mt-2 mb-1 border-l-2 border-blue-300 pl-3">
                {analysis.categorization.summary}
              </p>
            )}
            {analysis.categorization.reasoning && (
              <p className="text-sm text-muted-foreground mt-1 border-l-2 border-muted pl-3">
                {analysis.categorization.reasoning}
              </p>
            )}
            {/* Labels */}
            {analysis.categorization.labels && analysis.categorization.labels.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {analysis.categorization.labels.map((label, i) => (
                  <Badge key={i} variant="outline" className="text-[10px] text-muted-foreground">
                    {label.replace(/_/g, ' ')}
                  </Badge>
                ))}
              </div>
            )}
            {analysis.categorization.topics && analysis.categorization.topics.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {analysis.categorization.topics.map((topic, i) => (
                  <Badge key={i} variant="outline" className="text-xs">{topic}</Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Content Digest — gist, key points, links */}
        {analysis?.contentDigest && analysis.contentDigest.gist && (
          <ContentDigestSection digest={analysis.contentDigest} />
        )}

        {/* Golden Nuggets — deals, tips, quotes, stats, recommendations, remember_this, sales_opportunity (ENHANCED Feb 2026) */}
        {analysis?.contentDigest?.goldenNuggets && analysis.contentDigest.goldenNuggets.length > 0 && (
          <div className="pt-3 border-t">
            <div className="flex items-center gap-2 mb-2">
              <Gem className="h-4 w-4 text-yellow-500" />
              <span className="text-sm font-medium">Worth Remembering</span>
              <span className="text-[10px] text-muted-foreground">
                {analysis.contentDigest.goldenNuggets.length} nugget{analysis.contentDigest.goldenNuggets.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-1.5 pl-6">
              {analysis.contentDigest.goldenNuggets.map((nugget, index) => (
                <div
                  key={index}
                  className="group flex items-start gap-2 p-1.5 rounded-md hover:bg-muted/50 transition-colors"
                >
                  <Badge variant="outline" className={cn('text-[10px] shrink-0 mt-0.5', getNuggetBadgeColor(nugget.type))}>
                    {nugget.type.replace(/_/g, ' ')}
                  </Badge>
                  <p className="text-sm leading-snug flex-1">{nugget.nugget}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    title="Save nugget"
                    onClick={() => {
                      const nuggetTypeToIdeaType: Record<string, string> = {
                        deal: 'shopping',
                        tip: 'personal_growth',
                        quote: 'content_creation',
                        stat: 'business',
                        recommendation: 'personal_growth',
                        remember_this: 'business',
                        sales_opportunity: 'business',
                      };
                      fetch('/api/ideas', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          idea: nugget.nugget,
                          ideaType: nuggetTypeToIdeaType[nugget.type] || 'business',
                          relevance: `Extracted ${nugget.type.replace(/_/g, ' ')} from email`,
                          confidence: 0.8,
                          emailId: email.id,
                        }),
                      }).then(() => {
                        logger.info('Golden nugget saved', { emailId: email.id.substring(0, 8), type: nugget.type });
                      }).catch(err => {
                        logger.error('Failed to save nugget', { error: err instanceof Error ? err.message : 'Unknown error' });
                      });
                    }}
                  >
                    <Bookmark className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Email Style Ideas — format/design ideas for solopreneurs (NEW Feb 2026) */}
        {analysis?.contentDigest?.emailStyleIdeas && analysis.contentDigest.emailStyleIdeas.length > 0 && (
          <div className="pt-3 border-t">
            <div className="flex items-center gap-2 mb-2">
              <Palette className="h-4 w-4 text-pink-500" />
              <span className="text-sm font-medium">Email Style Ideas</span>
            </div>
            <div className="space-y-2 pl-6">
              {analysis.contentDigest.emailStyleIdeas.map((style, index) => (
                <div
                  key={index}
                  className="group flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors"
                >
                  <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5 bg-pink-50 text-pink-600 border-pink-200">
                    {style.type.replace(/_/g, ' ')}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug">{style.idea}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{style.whyItWorks}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    title="Save email style idea"
                    onClick={() => {
                      fetch('/api/ideas', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          idea: `${style.idea} — ${style.whyItWorks}`,
                          ideaType: 'content_creation',
                          relevance: `Email style idea (${style.type.replace(/_/g, ' ')}) from ${email.sender_name || email.sender_email}`,
                          confidence: style.confidence,
                          emailId: email.id,
                        }),
                      }).then(() => {
                        logger.info('Email style idea saved', { emailId: email.id.substring(0, 8), type: style.type });
                      }).catch(err => {
                        logger.error('Failed to save style idea', { error: err instanceof Error ? err.message : 'Unknown error' });
                      });
                    }}
                  >
                    <Bookmark className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Extraction (supports multi-action array) */}
        {analysis?.actionExtraction && (
          <div className="pt-3 border-t">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">
                {analysis.actionExtraction.actions && analysis.actionExtraction.actions.length > 1
                  ? `Actions (${analysis.actionExtraction.actions.length})`
                  : 'Action'}
              </span>
              {analysis.actionExtraction.urgencyScore && (
                <span className={`text-xs font-medium ${getUrgencyColor(analysis.actionExtraction.urgencyScore)}`}>
                  Urgency: {analysis.actionExtraction.urgencyScore}/10
                </span>
              )}
            </div>
            {analysis.actionExtraction.hasAction ? (
              <div className="space-y-2 pl-6">
                {/* Multi-action list (when available) */}
                {analysis.actionExtraction.actions && analysis.actionExtraction.actions.length > 0 ? (
                  analysis.actionExtraction.actions.map((action, index) => (
                    <div
                      key={index}
                      className={`flex items-start gap-2 p-2 rounded-md ${
                        index === (analysis.actionExtraction?.primaryActionIndex ?? 0) ? 'bg-primary/5 border border-primary/10' : 'hover:bg-muted/50'
                      } transition-colors`}
                    >
                      {getActionTypeIcon(action.type)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{action.title}</p>
                          {index === (analysis.actionExtraction?.primaryActionIndex ?? 0) && (
                            <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                              Primary
                            </Badge>
                          )}
                        </div>
                        {action.description && (
                          <p className="text-sm text-muted-foreground mt-0.5">{action.description}</p>
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
                          {action.sourceLine && (
                            <span className="truncate max-w-[200px]" title={action.sourceLine}>
                              &ldquo;{action.sourceLine}&rdquo;
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  /* Fallback: legacy single-action display */
                  <>
                    <div className="flex items-start gap-2">
                      {getActionTypeIcon(analysis.actionExtraction.actionType)}
                      <div className="flex-1">
                        <p className="font-medium text-sm">
                          {analysis.actionExtraction.actionTitle || `${analysis.actionExtraction.actionType} required`}
                        </p>
                        {analysis.actionExtraction.actionDescription && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {analysis.actionExtraction.actionDescription}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs">
                      {analysis.actionExtraction.deadline && (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span>{new Date(analysis.actionExtraction.deadline).toLocaleDateString()}</span>
                        </div>
                      )}
                      {analysis.actionExtraction.estimatedMinutes && (
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span>~{analysis.actionExtraction.estimatedMinutes} min</span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground pl-6">No action required</p>
            )}
          </div>
        )}

        {/* Client Tagging */}
        {analysis?.clientTagging && (
          <div className="pt-3 border-t">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-4 w-4 text-teal-500" />
              <span className="text-sm font-medium">Client</span>
            </div>
            {analysis.clientTagging.clientMatch ? (
              <div className="pl-6 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{analysis.clientTagging.clientName || 'Matched Client'}</span>
                  {analysis.clientTagging.relationshipSignal && (
                    getRelationshipIcon(analysis.clientTagging.relationshipSignal)
                  )}
                </div>
                {analysis.clientTagging.projectName && (
                  <p className="text-xs text-muted-foreground">Project: {analysis.clientTagging.projectName}</p>
                )}
              </div>
            ) : (
              <div className="pl-6">
                <p className="text-sm text-muted-foreground">Not linked to a client</p>
                {analysis.clientTagging.newClientSuggestion && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Suggestion: {analysis.clientTagging.newClientSuggestion}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Idea Sparks — AI-generated ideas from this email (NEW Feb 2026) */}
        {analysis?.ideaSparks?.hasIdeas && analysis.ideaSparks.ideas.length > 0 && (
          <div className="pt-3 border-t">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium">Idea Sparks</span>
              <span className="text-xs text-muted-foreground">
                ({analysis.ideaSparks.ideas.length} ideas)
              </span>
            </div>
            <div className="space-y-2 pl-6">
              {analysis.ideaSparks.ideas.map((idea, index) => (
                <div
                  key={index}
                  className="group flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors"
                >
                  <Badge variant="outline" className="text-xs shrink-0 mt-0.5">
                    {idea.type.replace(/_/g, ' ')}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug">{idea.idea}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{idea.relevance}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    title="Save idea"
                    onClick={() => {
                      // Save idea via Ideas API
                      fetch('/api/ideas', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          idea: idea.idea,
                          ideaType: idea.type,
                          relevance: idea.relevance,
                          confidence: idea.confidence,
                          emailId: email.id,
                        }),
                      }).then(() => {
                        logger.info('Idea saved from email detail', {
                          emailId: email.id.substring(0, 8),
                          ideaType: idea.type,
                        });
                      }).catch(err => {
                        logger.error('Failed to save idea from detail', {
                          error: err instanceof Error ? err.message : 'Unknown error',
                        });
                      });
                    }}
                  >
                    <Bookmark className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Insights — Synthesized tips, frameworks, observations (NEW Feb 2026) */}
        {analysis?.insightExtraction?.hasInsights && analysis.insightExtraction.insights.length > 0 && (
          <div className="pt-3 border-t">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium">Insights</span>
              <span className="text-xs text-muted-foreground">
                ({analysis.insightExtraction.insights.length})
              </span>
            </div>
            <div className="space-y-2 pl-6">
              {analysis.insightExtraction.insights.map((item, index) => (
                <div
                  key={index}
                  className="group flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors"
                >
                  <Badge variant="outline" className="text-xs shrink-0 mt-0.5">
                    {item.type}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug">{item.insight}</p>
                    {item.topics.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.topics.map((topic, i) => (
                          <span key={i} className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {topic}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    title="Save insight"
                    onClick={() => {
                      fetch('/api/insights', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          insight: item.insight,
                          insightType: item.type,
                          topics: item.topics,
                          confidence: item.confidence,
                          emailId: email.id,
                        }),
                      }).then(() => {
                        logger.info('Insight saved from email detail', {
                          emailId: email.id.substring(0, 8),
                          insightType: item.type,
                        });
                      }).catch(err => {
                        logger.error('Failed to save insight from detail', {
                          error: err instanceof Error ? err.message : 'Unknown error',
                        });
                      });
                    }}
                  >
                    <Bookmark className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* News Brief — Factual news items extracted from email (NEW Feb 2026) */}
        {analysis?.newsBrief?.hasNews && analysis.newsBrief.newsItems.length > 0 && (
          <div className="pt-3 border-t">
            <div className="flex items-center gap-2 mb-2">
              <Rss className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-medium">News Brief</span>
              <span className="text-xs text-muted-foreground">
                ({analysis.newsBrief.newsItems.length} items)
              </span>
            </div>
            <div className="space-y-2 pl-6">
              {analysis.newsBrief.newsItems.map((item, index) => (
                <div
                  key={index}
                  className="group flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-snug">{item.headline}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {item.topics.map((topic, i) => (
                        <span key={i} className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {topic}
                        </span>
                      ))}
                      {item.dateMentioned && (
                        <span className="text-xs text-muted-foreground">
                          {item.dateMentioned}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    title="Save news item"
                    onClick={() => {
                      fetch('/api/news', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          headline: item.headline,
                          detail: item.detail,
                          topics: item.topics,
                          dateMentioned: item.dateMentioned,
                          confidence: item.confidence,
                          emailId: email.id,
                        }),
                      }).then(() => {
                        logger.info('News item saved from email detail', {
                          emailId: email.id.substring(0, 8),
                        });
                      }).catch(err => {
                        logger.error('Failed to save news item from detail', {
                          error: err instanceof Error ? err.message : 'Unknown error',
                        });
                      });
                    }}
                  >
                    <Bookmark className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Date Extraction — deadlines, dates, time-sensitive items */}
        {(extractedDates.length > 0 || analysis?.dateExtraction) && (
          <DateExtractionSection
            extraction={analysis?.dateExtraction}
            dates={extractedDates.length > 0 ? extractedDates.map(d => ({
              dateType: d.date_type || 'other',
              date: d.date,
              time: d.event_time || undefined,
              endDate: d.end_date || undefined,
              endTime: d.end_time || undefined,
              title: d.title,
              description: d.description || undefined,
              relatedEntity: d.related_entity || undefined,
              isRecurring: d.is_recurring || false,
              recurrencePattern: d.recurrence_pattern || undefined,
              confidence: d.confidence || 0.5,
            })) : undefined}
          />
        )}

        {/* Multi-Event Detection — multiple events from a single email */}
        {analysis?.multiEventDetection?.hasMultipleEvents && analysis.multiEventDetection.events.length > 0 && (
          <div className="pt-3 border-t">
            <div className="flex items-center gap-2 mb-2">
              <ListChecks className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium">Multiple Events</span>
              <span className="text-xs text-muted-foreground">
                ({analysis.multiEventDetection.eventCount} events)
              </span>
            </div>
            {analysis.multiEventDetection.sourceDescription && (
              <p className="text-xs text-muted-foreground pl-6 mb-2">
                {analysis.multiEventDetection.sourceDescription}
              </p>
            )}
            <div className="space-y-2 pl-6">
              {analysis.multiEventDetection.events.map((evt, index) => (
                <div key={index} className="p-2 rounded-md hover:bg-muted/50 transition-colors">
                  <p className="text-sm font-medium">{evt.eventTitle}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      <Calendar className="h-3 w-3" />
                      {evt.eventDate}
                    </span>
                    {evt.eventTime && (
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-3 w-3" />
                        {evt.eventTime}
                      </span>
                    )}
                    {evt.location && <span>{evt.location}</span>}
                    {evt.cost && <span>{evt.cost}</span>}
                    {evt.rsvpRequired && (
                      <Badge variant="outline" className="text-[10px]">RSVP</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Meta info */}
        {(analysis?.tokensUsed || analysis?.processingTimeMs) && (
          <div className="pt-3 border-t flex items-center gap-4 text-xs text-muted-foreground">
            {analysis.tokensUsed && <span>{analysis.tokensUsed} tokens</span>}
            {analysis.processingTimeMs && <span>{analysis.processingTimeMs}ms</span>}
            {analysis.analyzerVersion && <span>v{analysis.analyzerVersion}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );

  // Return analysis card, plus event details card if this is an event email
  if (analysis?.eventDetection?.hasEvent) {
    logger.debug('Rendering event details for email', {
      emailId: email.id,
      eventTitle: analysis.eventDetection.eventTitle,
    });

    return (
      <>
        {analysisCard}
        <EventDetailsCard
          event={analysis.eventDetection}
          emailSubject={email.subject || undefined}
          description={email.snippet || undefined}
        />
      </>
    );
  }

  return analysisCard;
}

function EmailBody({ email }: { email: Email }) {
  const htmlRef = React.useRef<HTMLDivElement>(null);
  const hasHtml = email.body_html && email.body_html.trim().length > 0;
  const hasText = email.body_text && email.body_text.trim().length > 0;

  // Hide broken images (e.g. favicon 404s embedded in email HTML) to suppress console noise
  React.useEffect(() => {
    if (!htmlRef.current) return;
    const imgs = htmlRef.current.querySelectorAll('img');
    const handler = (e: Event) => {
      (e.target as HTMLImageElement).style.display = 'none';
    };
    imgs.forEach(img => img.addEventListener('error', handler));
    return () => {
      imgs.forEach(img => img.removeEventListener('error', handler));
    };
  }, [email.id]);

  if (!hasHtml && !hasText) {
    return (
      <div className="px-6 py-4">
        <p className="text-muted-foreground italic">{email.snippet || 'No content available'}</p>
      </div>
    );
  }

  if (hasHtml) {
    return (
      <div className="px-6 py-4">
        <div
          ref={htmlRef}
          className="prose prose-sm max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(email.body_html || '') }}
        />
      </div>
    );
  }

  return (
    <div className="px-6 py-4">
      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{email.body_text}</pre>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function EmailDetail({
  email,
  onStar,
  onArchive,
  onToggleRead,
  onAnalyze,
  onClose,
  isLoading = false,
  isAnalyzing = false,
}: EmailDetailProps) {
  if (isLoading) {
    return (
      <div className="p-6 animate-pulse">
        <div className="h-10 bg-muted rounded mb-4" />
        <div className="h-6 bg-muted rounded w-3/4 mb-2" />
        <div className="h-4 bg-muted rounded w-1/2 mb-4" />
        <div className="space-y-2">
          <div className="h-4 bg-muted rounded" />
          <div className="h-4 bg-muted rounded" />
          <div className="h-4 bg-muted rounded w-2/3" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <EmailHeader
        email={email}
        onStar={onStar}
        onArchive={onArchive}
        onToggleRead={onToggleRead}
        onClose={onClose}
      />
      <div className="flex-1 overflow-y-auto">
        <EmailSubject email={email} />
        <EmailBody email={email} />
        <AnalysisSummary email={email} onAnalyze={onAnalyze} isAnalyzing={isAnalyzing} />
        {email.gmail_id && (
          <div className="px-6 py-4 border-t border-border">
            <a
              href={`https://mail.google.com/mail/u/0/#inbox/${email.gmail_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View in Gmail
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default EmailDetail;
