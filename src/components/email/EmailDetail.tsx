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
import { useEmailAnalysis } from '@/hooks';
import { EventDetailsCard } from './EventDetailsCard';
import { createLogger } from '@/lib/utils/logger';
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

    default:
      return { variant: 'outline', label: category.replace(/_/g, ' '), icon: <Mail className="h-3 w-3" /> };
  }
}

function getActionTypeIcon(actionType: string) {
  switch (actionType) {
    case 'respond': return <MessageSquare className="h-4 w-4" />;
    case 'review': return <FileEdit className="h-4 w-4" />;
    case 'create': return <FileEdit className="h-4 w-4" />;
    case 'schedule': return <CalendarClock className="h-4 w-4" />;
    case 'decide': return <HelpCircle className="h-4 w-4" />;
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
        {/* Category & Reasoning */}
        {analysis?.categorization && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium">Category:</span>
              <Badge variant={getCategoryBadge(email.category).variant} className="gap-1">
                {getCategoryBadge(email.category).icon}
                {email.category?.replace('_', ' ')}
              </Badge>
            </div>
            {analysis.categorization.reasoning && (
              <p className="text-sm text-muted-foreground mt-1 border-l-2 border-muted pl-3">
                {analysis.categorization.reasoning}
              </p>
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

        {/* Action Extraction */}
        {analysis?.actionExtraction && (
          <div className="pt-3 border-t">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Action</span>
            </div>
            {analysis.actionExtraction.hasAction ? (
              <div className="space-y-2 pl-6">
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
                  {analysis.actionExtraction.urgencyScore && (
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">Urgency:</span>
                      <span className={`font-medium ${getUrgencyColor(analysis.actionExtraction.urgencyScore)}`}>
                        {analysis.actionExtraction.urgencyScore}/10
                      </span>
                    </div>
                  )}
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
  const hasHtml = email.body_html && email.body_html.trim().length > 0;
  const hasText = email.body_text && email.body_text.trim().length > 0;

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
