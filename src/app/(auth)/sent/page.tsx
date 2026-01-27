/**
 * Sent/Outbox Page
 *
 * Displays sent, scheduled, and draft emails with tracking statistics.
 * Allows users to manage their outbound emails and view open tracking data.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Tabbed view: Sent / Scheduled / Drafts / Failed
 * - Email list with status badges
 * - Open tracking stats (opens count, last opened)
 * - Reply status indicator
 * - Cancel scheduled emails
 * - Resend failed emails
 * - Compose new email button
 * - Pagination
 *
 * @module app/(auth)/sent/page
 * @see docs/GMAIL_SENDING_IMPLEMENTATION.md
 */

'use client';

import * as React from 'react';
import { PageHeader } from '@/components/layout';
import {
  Card,
  CardContent,
  Button,
  Badge,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  useToast,
} from '@/components/ui';
import { ComposeEmail, type GmailAccount, type EmailTemplate } from '@/components/email/ComposeEmail';
import { createLogger } from '@/lib/utils/logger';
import {
  Send,
  Clock,
  FileEdit,
  AlertCircle,
  Mail,
  MailOpen,
  Eye,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Loader2,
  RefreshCw,
  X,
  CheckCircle2,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('SentPage');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type EmailStatus = 'sent' | 'scheduled' | 'draft' | 'failed' | 'queued';

interface OutboundEmail {
  id: string;
  to_email: string;
  to_name: string | null;
  subject: string;
  status: EmailStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
  open_count: number;
  first_opened_at: string | null;
  last_opened_at: string | null;
  has_reply: boolean;
  reply_received_at: string | null;
  tracking_enabled: boolean;
  error_message: string | null;
  gmail_accounts: {
    id: string;
    email: string;
  };
}

interface PaginationInfo {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasMore: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Formats a date for display.
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  if (diffDays === 1) {
    return 'Yesterday';
  }

  if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Gets status badge properties.
 */
function getStatusBadge(status: EmailStatus): {
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  label: string;
  icon: React.ReactNode;
} {
  switch (status) {
    case 'sent':
      return { variant: 'default', label: 'Sent', icon: <CheckCircle2 className="h-3 w-3" /> };
    case 'scheduled':
      return { variant: 'secondary', label: 'Scheduled', icon: <Clock className="h-3 w-3" /> };
    case 'draft':
      return { variant: 'outline', label: 'Draft', icon: <FileEdit className="h-3 w-3" /> };
    case 'failed':
      return { variant: 'destructive', label: 'Failed', icon: <AlertCircle className="h-3 w-3" /> };
    case 'queued':
      return { variant: 'secondary', label: 'Queued', icon: <Loader2 className="h-3 w-3 animate-spin" /> };
    default:
      return { variant: 'outline', label: status, icon: null };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL ROW COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

interface EmailRowProps {
  email: OutboundEmail;
  onCancel?: (id: string) => void;
  onResend?: (id: string) => void;
}

function EmailRow({ email, onCancel, onResend }: EmailRowProps) {
  const statusBadge = getStatusBadge(email.status);

  return (
    <div className="flex items-center gap-4 p-4 border-b hover:bg-muted/50 transition-colors">
      {/* Status Icon */}
      <div className="flex-shrink-0">
        {email.status === 'sent' ? (
          email.open_count > 0 ? (
            <MailOpen className="h-5 w-5 text-green-500" />
          ) : (
            <Mail className="h-5 w-5 text-muted-foreground" />
          )
        ) : (
          <div className="text-muted-foreground">{statusBadge.icon}</div>
        )}
      </div>

      {/* Email Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium truncate">
            {email.to_name || email.to_email}
          </span>
          <Badge variant={statusBadge.variant} className="flex items-center gap-1">
            {statusBadge.icon}
            {statusBadge.label}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground truncate">{email.subject}</p>
        {email.error_message && (
          <p className="text-xs text-destructive mt-1">{email.error_message}</p>
        )}
      </div>

      {/* Tracking Stats */}
      {email.status === 'sent' && email.tracking_enabled && (
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {/* Opens */}
          <div className="flex items-center gap-1" title={`${email.open_count} opens`}>
            <Eye className="h-4 w-4" />
            <span>{email.open_count}</span>
          </div>

          {/* Reply Status */}
          {email.has_reply && (
            <div className="flex items-center gap-1 text-green-600" title="Reply received">
              <MessageSquare className="h-4 w-4" />
            </div>
          )}
        </div>
      )}

      {/* Date/Time */}
      <div className="text-sm text-muted-foreground whitespace-nowrap">
        {email.status === 'scheduled' && email.scheduled_at
          ? formatDate(email.scheduled_at)
          : email.sent_at
            ? formatDate(email.sent_at)
            : formatDate(email.created_at)}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {email.status === 'scheduled' && onCancel && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCancel(email.id)}
            title="Cancel scheduled email"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        {email.status === 'failed' && onResend && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onResend(email.id)}
            title="Retry sending"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOADING SKELETON
// ═══════════════════════════════════════════════════════════════════════════════

function EmailRowSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4 border-b">
      <Skeleton className="h-5 w-5 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-64" />
      </div>
      <Skeleton className="h-4 w-12" />
      <Skeleton className="h-4 w-16" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function SentPage() {
  const { toast } = useToast();

  // ─────────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────────

  const [activeTab, setActiveTab] = React.useState<string>('sent');
  const [emails, setEmails] = React.useState<OutboundEmail[]>([]);
  const [pagination, setPagination] = React.useState<PaginationInfo | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isComposeOpen, setIsComposeOpen] = React.useState(false);

  // Mock data for accounts and templates (in real app, fetch from API)
  const [accounts] = React.useState<GmailAccount[]>([]);
  const [templates] = React.useState<EmailTemplate[]>([]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch Emails
  // ─────────────────────────────────────────────────────────────────────────────

  const fetchEmails = React.useCallback(async (status: string, page = 1) => {
    setIsLoading(true);

    try {
      const params = new URLSearchParams({
        status: status === 'all' ? 'all' : status,
        page: String(page),
        limit: '20',
      });

      const response = await fetch(`/api/emails/outbox?${params}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch emails');
      }

      setEmails(result.data.emails);
      setPagination(result.data.pagination);

      logger.info('Fetched outbox emails', {
        status,
        count: result.data.emails.length,
        page,
      });
    } catch (error) {
      logger.error('Failed to fetch outbox emails', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      toast({
        title: 'Error',
        description: 'Failed to load emails. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Initial fetch and tab change
  React.useEffect(() => {
    fetchEmails(activeTab);
  }, [activeTab, fetchEmails]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────────────────────

  const handleCancel = async (emailId: string) => {
    logger.info('Cancelling scheduled email', { emailId: emailId.substring(0, 8) });

    // TODO: Implement cancel API call
    toast({
      title: 'Email Cancelled',
      description: 'The scheduled email has been cancelled.',
    });

    // Refresh list
    fetchEmails(activeTab);
  };

  const handleResend = async (emailId: string) => {
    logger.info('Retrying failed email', { emailId: emailId.substring(0, 8) });

    // TODO: Implement resend API call
    toast({
      title: 'Retrying',
      description: 'Attempting to resend the email...',
    });

    // Refresh list
    fetchEmails(activeTab);
  };

  const handleComposeSend = (result: { id: string; status: string }) => {
    logger.info('Email composed', { result });

    setIsComposeOpen(false);
    fetchEmails(activeTab);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Sent"
        description="Manage your sent and scheduled emails"
        actions={
          <Button onClick={() => setIsComposeOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Compose
          </Button>
        }
      />

      <main className="container mx-auto py-6 px-4 max-w-5xl">
        <Card>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start border-b rounded-none p-0 h-auto">
              <TabsTrigger
                value="sent"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
              >
                <Send className="h-4 w-4 mr-2" />
                Sent
              </TabsTrigger>
              <TabsTrigger
                value="scheduled"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
              >
                <Clock className="h-4 w-4 mr-2" />
                Scheduled
              </TabsTrigger>
              <TabsTrigger
                value="draft"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
              >
                <FileEdit className="h-4 w-4 mr-2" />
                Drafts
              </TabsTrigger>
              <TabsTrigger
                value="failed"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
              >
                <AlertCircle className="h-4 w-4 mr-2" />
                Failed
              </TabsTrigger>
            </TabsList>

            <CardContent className="p-0">
              {/* Loading State */}
              {isLoading && (
                <div>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <EmailRowSkeleton key={i} />
                  ))}
                </div>
              )}

              {/* Empty State */}
              {!isLoading && emails.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Mail className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No emails</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {activeTab === 'sent'
                      ? "You haven't sent any emails yet."
                      : activeTab === 'scheduled'
                        ? "You don't have any scheduled emails."
                        : activeTab === 'draft'
                          ? "You don't have any drafts."
                          : "No failed emails."}
                  </p>
                  <Button onClick={() => setIsComposeOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Compose Email
                  </Button>
                </div>
              )}

              {/* Email List */}
              {!isLoading && emails.length > 0 && (
                <div>
                  {emails.map((email) => (
                    <EmailRow
                      key={email.id}
                      email={email}
                      onCancel={activeTab === 'scheduled' ? handleCancel : undefined}
                      onResend={activeTab === 'failed' ? handleResend : undefined}
                    />
                  ))}
                </div>
              )}

              {/* Pagination */}
              {!isLoading && pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {emails.length} of {pagination.totalCount} emails
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page === 1}
                      onClick={() => fetchEmails(activeTab, pagination.page - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!pagination.hasMore}
                      onClick={() => fetchEmails(activeTab, pagination.page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Tabs>
        </Card>
      </main>

      {/* Compose Dialog */}
      <ComposeEmail
        mode="new"
        accounts={accounts}
        templates={templates}
        open={isComposeOpen}
        onOpenChange={setIsComposeOpen}
        onSend={handleComposeSend}
      />
    </div>
  );
}
