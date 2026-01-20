/**
 * Inbox Page for IdeaBox
 *
 * The main email inbox view with AI analysis integration.
 *
 * @module app/(auth)/inbox/page
 */

'use client';

/* eslint-disable max-lines, @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue with client-side updates
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/layout';
import {
  Card,
  CardContent,
  Button,
  Badge,
  Skeleton,
  Sheet,
  SheetContent,
  SheetTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  useToast,
} from '@/components/ui';
import { SyncStatusBanner, EmailDetail, EventPreview } from '@/components/email';
import { useEmails, type Email, type EmailCategory, type EventPreviewData } from '@/hooks';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';
import {
  Mail,
  Inbox,
  AlertCircle,
  Calendar,
  Newspaper,
  Tag,
  Archive,
  Star,
  MoreHorizontal,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Brain,
  Clock,
  Trash2,
  MailOpen,
  FolderInput,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('InboxPage');

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) {
    return `${diffMins} min ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  } else {
    return date.toLocaleDateString();
  }
}

function getCategoryInfo(category: EmailCategory | null): {
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  label: string;
  icon: React.ReactNode;
} {
  switch (category) {
    case 'action_required':
      return { variant: 'destructive', label: 'Action Required', icon: <AlertCircle className="h-3 w-3" /> };
    case 'event':
      return { variant: 'default', label: 'Event', icon: <Calendar className="h-3 w-3" /> };
    case 'newsletter':
      return { variant: 'secondary', label: 'Newsletter', icon: <Newspaper className="h-3 w-3" /> };
    case 'promo':
      return { variant: 'outline', label: 'Promo', icon: <Tag className="h-3 w-3" /> };
    case 'admin':
      return { variant: 'secondary', label: 'Admin', icon: <Mail className="h-3 w-3" /> };
    case 'personal':
      return { variant: 'outline', label: 'Personal', icon: <Mail className="h-3 w-3" /> };
    case 'noise':
      return { variant: 'outline', label: 'Noise', icon: <Archive className="h-3 w-3" /> };
    default:
      return { variant: 'outline', label: 'Uncategorized', icon: <Mail className="h-3 w-3" /> };
  }
}

function getCategoryLabel(category: EmailCategory | 'all' | null): string {
  switch (category) {
    case 'action_required': return 'Action Required';
    case 'event': return 'Events';
    case 'newsletter': return 'Newsletters';
    case 'promo': return 'Promotions';
    case 'admin': return 'Admin';
    case 'personal': return 'Personal';
    case 'noise': return 'Noise';
    default: return 'Inbox';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

interface EmailListItemProps {
  email: Email;
  onSelect: (email: Email) => void;
  onToggleStar: (id: string) => void;
  onMarkRead: (id: string) => void;
  onArchive: (id: string) => void;
  onAnalyze: (id: string) => void;
  isAnalyzing: boolean;
  /** Event preview data if this is an event email */
  eventData?: EventPreviewData;
}

/**
 * Gets display info for quick action type.
 */
function getQuickActionInfo(quickAction: string | null | undefined): {
  label: string;
  className: string;
} | null {
  switch (quickAction) {
    case 'respond':
      return { label: 'Reply needed', className: 'text-red-600 dark:text-red-400' };
    case 'review':
      return { label: 'Review', className: 'text-blue-600 dark:text-blue-400' };
    case 'calendar':
      return { label: 'Add to calendar', className: 'text-purple-600 dark:text-purple-400' };
    case 'follow_up':
      return { label: 'Follow up', className: 'text-orange-600 dark:text-orange-400' };
    case 'save':
      return { label: 'Save for later', className: 'text-teal-600 dark:text-teal-400' };
    case 'unsubscribe':
      return { label: 'Unsubscribe?', className: 'text-gray-500' };
    case 'archive':
    case 'none':
    default:
      return null;
  }
}

function EmailListItem({
  email,
  onSelect,
  onToggleStar,
  onMarkRead,
  onArchive,
  onAnalyze,
  isAnalyzing,
  eventData,
}: EmailListItemProps) {
  const categoryInfo = getCategoryInfo(email.category);
  const isAnalyzed = !!email.analyzed_at;
  const hasPendingAnalysis = !isAnalyzed && !email.analysis_error;
  const quickActionInfo = getQuickActionInfo(email.quick_action);
  const isEventEmail = email.category === 'event';

  return (
    <div
      onClick={() => onSelect(email)}
      className={`
        flex items-start gap-4 p-4 border-b border-border/50
        hover:bg-muted/30 transition-colors cursor-pointer
        ${!email.is_read ? 'bg-muted/10' : ''}
      `}
    >
      {/* Star button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleStar(email.id);
        }}
        className={`
          mt-1 p-1 rounded hover:bg-muted transition-colors
          ${email.is_starred ? 'text-yellow-500' : 'text-muted-foreground'}
        `}
        aria-label={email.is_starred ? 'Unstar email' : 'Star email'}
      >
        <Star className="h-4 w-4" fill={email.is_starred ? 'currentColor' : 'none'} />
      </button>

      {/* Email content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className={`font-medium truncate ${!email.is_read ? 'text-foreground' : 'text-muted-foreground'}`}>
            {email.sender_name || email.sender_email}
          </span>
          <div className="flex items-center gap-2">
            {/* Quick action indicator */}
            {quickActionInfo && (
              <span className={`text-xs font-medium ${quickActionInfo.className}`}>
                {quickActionInfo.label}
              </span>
            )}
            {/* Analysis status indicator */}
            {hasPendingAnalysis && (
              <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                <Clock className="h-3 w-3" />
                Pending
              </span>
            )}
            {isAnalyzed && !quickActionInfo && (
              <span className="text-green-500">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </span>
            )}
            {email.analysis_error && (
              <span className="text-destructive">
                <AlertCircle className="h-3.5 w-3.5" />
              </span>
            )}
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatRelativeTime(email.date)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-1">
          <span className={`text-sm truncate ${!email.is_read ? 'font-medium' : ''}`}>
            {email.subject || '(No subject)'}
          </span>
          {email.category && (
            <Badge variant={categoryInfo.variant} className="gap-1 text-xs shrink-0">
              {categoryInfo.icon}
              {categoryInfo.label}
            </Badge>
          )}
        </div>

        {/* Show AI summary if available, otherwise show snippet */}
        <p className="text-sm text-muted-foreground truncate">
          {email.summary || email.snippet}
        </p>

        {/* Event Preview - only for event emails with event data */}
        {isEventEmail && eventData && (
          <EventPreview event={eventData} />
        )}
      </div>

      {/* More Actions Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
            aria-label="More actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {!isAnalyzed && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onAnalyze(email.id);
              }}
              disabled={isAnalyzing}
            >
              <Brain className="h-4 w-4 mr-2" />
              {isAnalyzing ? 'Analyzing...' : 'Analyze with AI'}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onMarkRead(email.id);
            }}
          >
            <MailOpen className="h-4 w-4 mr-2" />
            {email.is_read ? 'Mark as unread' : 'Mark as read'}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onArchive(email.id);
            }}
          >
            <Archive className="h-4 w-4 mr-2" />
            Archive
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onToggleStar(email.id);
            }}
          >
            <Star className="h-4 w-4 mr-2" />
            {email.is_starred ? 'Remove star' : 'Add star'}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => e.stopPropagation()}
            className="text-muted-foreground"
          >
            <FolderInput className="h-4 w-4 mr-2" />
            Move to category...
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => e.stopPropagation()}
            className="text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function EmailListSkeleton() {
  return (
    <div className="space-y-0">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-start gap-4 p-4 border-b border-border/50">
          <Skeleton className="h-6 w-6 rounded" />
          <div className="flex-1 space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface EmptyStateProps {
  onSyncComplete: () => void;
  categoryFilter?: string | null;
}

function EmptyState({ onSyncComplete, categoryFilter }: EmptyStateProps) {
  if (categoryFilter) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Inbox className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">No emails in this category</h3>
        <p className="text-muted-foreground max-w-sm">
          There are no {getCategoryLabel(categoryFilter as EmailCategory).toLowerCase()} emails at the moment.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <Inbox className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-2">Welcome to your inbox!</h3>
      <p className="text-muted-foreground max-w-sm mb-6">
        Let&apos;s sync your Gmail emails to get started. IdeaBox will automatically
        categorize them and extract action items.
      </p>
      <SyncStatusBanner onSyncComplete={onSyncComplete} className="max-w-md w-full" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function InboxPage() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const supabase = React.useMemo(() => createClient(), []);

  // Get category filter from URL
  const categoryFilter = searchParams.get('category') as EmailCategory | null;

  const [isSyncing, setIsSyncing] = React.useState(false);
  const [syncSuccess, setSyncSuccess] = React.useState(false);
  const [selectedEmail, setSelectedEmail] = React.useState<Email | null>(null);
  const [isSheetOpen, setIsSheetOpen] = React.useState(false);
  const [analyzingEmailId, setAnalyzingEmailId] = React.useState<string | null>(null);

  // Fetch emails with category filter and event data
  const {
    emails,
    isLoading,
    error,
    refetch,
    updateEmail,
    stats,
    eventData,
  } = useEmails({
    limit: 50,
    category: categoryFilter || 'all',
    includeEventData: true, // Fetch event preview data for event emails
  });

  // Open email detail sheet
  const handleSelectEmail = React.useCallback((email: Email) => {
    setSelectedEmail(email);
    setIsSheetOpen(true);
    // Mark as read when opened
    if (!email.is_read) {
      updateEmail(email.id, { is_read: true });
      // Also update in database
      // @ts-expect-error - Supabase type generation issue
      supabase.from('emails').update({ is_read: true }).eq('id', email.id).then();
    }
  }, [updateEmail, supabase]);

  // Close email detail sheet
  const handleCloseSheet = React.useCallback(() => {
    setIsSheetOpen(false);
    setSelectedEmail(null);
  }, []);

  // Handle sync
  const handleSync = React.useCallback(async () => {
    setIsSyncing(true);
    setSyncSuccess(false);

    logger.start('Manual sync triggered from inbox');

    try {
      const response = await fetch('/api/emails/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Sync failed');
      }

      logger.success('Manual sync completed', {
        totalCreated: result.totals?.totalCreated,
        totalFetched: result.totals?.totalFetched,
      });

      await refetch();
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 3000);
    } catch (err) {
      logger.error('Manual sync failed', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      toast({
        title: 'Sync failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  }, [refetch, toast]);

  const handleSyncComplete = React.useCallback(() => {
    logger.info('Sync completed, refreshing email list');
    refetch();
  }, [refetch]);

  // Toggle star
  const handleToggleStar = React.useCallback(async (id: string) => {
    const email = emails.find((e) => e.id === id);
    if (email) {
      const newValue = !email.is_starred;
      updateEmail(id, { is_starred: newValue });
      // @ts-expect-error - Supabase type generation issue
      await supabase.from('emails').update({ is_starred: newValue }).eq('id', id);
    }
  }, [emails, updateEmail, supabase]);

  // Toggle read
  const handleToggleRead = React.useCallback(async (id: string) => {
    const email = emails.find((e) => e.id === id);
    if (email) {
      const newValue = !email.is_read;
      updateEmail(id, { is_read: newValue });
      // @ts-expect-error - Supabase type generation issue
      await supabase.from('emails').update({ is_read: newValue }).eq('id', id);
    }
  }, [emails, updateEmail, supabase]);

  // Archive email
  const handleArchive = React.useCallback(async (id: string) => {
    updateEmail(id, { is_archived: true });
    // @ts-expect-error - Supabase type generation issue
    await supabase.from('emails').update({ is_archived: true }).eq('id', id);
    toast({
      title: 'Email archived',
      description: 'The email has been moved to archive.',
    });
    // Close sheet if this email was selected
    if (selectedEmail?.id === id) {
      handleCloseSheet();
    }
  }, [updateEmail, supabase, toast, selectedEmail, handleCloseSheet]);

  // Analyze single email
  const handleAnalyzeEmail = React.useCallback(async (id: string) => {
    setAnalyzingEmailId(id);
    logger.start('Analyzing single email', { emailId: id });

    try {
      const response = await fetch(`/api/emails/${id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Analysis failed');
      }

      logger.success('Email analyzed', { emailId: id, category: result.summary?.category });

      // Update local state with all analysis fields
      const analysisUpdate = {
        analyzed_at: new Date().toISOString(),
        category: result.summary?.category,
        summary: result.summary?.summary,
        quick_action: result.summary?.quickAction,
        labels: result.summary?.labels,
        topics: result.summary?.topics,
      };
      updateEmail(id, analysisUpdate);

      // Update selected email if it's the one being analyzed
      if (selectedEmail?.id === id) {
        setSelectedEmail((prev) => prev ? {
          ...prev,
          ...analysisUpdate,
        } : null);
      }

      toast({
        title: 'Analysis complete',
        description: `Category: ${result.summary?.category?.replace('_', ' ')}${result.summary?.hasAction ? ' - Action required!' : ''}`,
      });

      // Refetch to get updated data
      refetch();
    } catch (err) {
      logger.error('Email analysis failed', {
        emailId: id,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      toast({
        title: 'Analysis failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setAnalyzingEmailId(null);
    }
  }, [updateEmail, selectedEmail, toast, refetch]);

  // Page title based on filter
  const pageTitle = categoryFilter ? getCategoryLabel(categoryFilter) : 'Inbox';

  return (
    <div>
      {/* Page Header */}
      <PageHeader
        title={pageTitle}
        description={categoryFilter
          ? `Emails categorized as ${getCategoryLabel(categoryFilter).toLowerCase()}`
          : 'Your unified email inbox with AI-powered categorization'
        }
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Inbox', href: '/inbox' },
          ...(categoryFilter ? [{ label: getCategoryLabel(categoryFilter) }] : []),
        ]}
        actions={
          <Button
            variant={syncSuccess ? 'default' : 'outline'}
            size="sm"
            className={`gap-2 transition-colors ${syncSuccess ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`}
            onClick={handleSync}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : syncSuccess ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {isSyncing ? 'Syncing...' : syncSuccess ? 'Synced!' : 'Sync'}
          </Button>
        }
      />

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-sm text-destructive">
            <strong>Error:</strong> {error.message}
          </p>
        </div>
      )}

      {/* Email Stats Banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="text-2xl font-bold">{stats.actionRequired}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Action Required</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              <span className="text-2xl font-bold">{stats.total}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Total Emails</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">{stats.unread}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Unread</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-500" />
              <span className="text-2xl font-bold">{stats.starred}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Starred</p>
          </CardContent>
        </Card>
      </div>

      {/* Sync Status Banner */}
      {!isLoading && emails.length > 0 && (
        <div className="mb-6">
          <SyncStatusBanner onSyncComplete={handleSyncComplete} compact />
        </div>
      )}

      {/* Email List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <EmailListSkeleton />
          ) : emails.length === 0 ? (
            <EmptyState onSyncComplete={handleSyncComplete} categoryFilter={categoryFilter} />
          ) : (
            <div>
              {emails.map((email) => (
                <EmailListItem
                  key={email.id}
                  email={email}
                  onSelect={handleSelectEmail}
                  onToggleStar={handleToggleStar}
                  onMarkRead={handleToggleRead}
                  onArchive={handleArchive}
                  onAnalyze={handleAnalyzeEmail}
                  isAnalyzing={analyzingEmailId === email.id}
                  eventData={eventData.get(email.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email Detail Sheet */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent side="right" className="p-0 w-full sm:max-w-xl md:max-w-2xl lg:max-w-3xl">
          <SheetTitle className="sr-only">Email Details</SheetTitle>
          {selectedEmail && (
            <EmailDetail
              email={selectedEmail}
              onStar={handleToggleStar}
              onArchive={handleArchive}
              onToggleRead={handleToggleRead}
              onAnalyze={handleAnalyzeEmail}
              onClose={handleCloseSheet}
              isAnalyzing={analyzingEmailId === selectedEmail.id}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
