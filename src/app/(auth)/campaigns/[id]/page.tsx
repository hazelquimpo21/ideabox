/**
 * Campaign Detail Page
 *
 * Shows detailed view of a single email campaign including:
 * - Campaign metadata and configuration
 * - Real-time progress tracking
 * - Email delivery statistics (opens, replies, failures)
 * - List of individual emails with status
 * - Campaign control actions (start/pause/cancel)
 * - Email preview modal
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * GOTCHAS & NOTES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Auto-refresh: Running campaigns refresh every 5 seconds to show progress
 * 2. Email list pagination: Large campaigns may have thousands of emails
 * 3. Status transitions: UI must handle async status changes gracefully
 * 4. Error recovery: Network errors should allow retry without data loss
 * 5. Preview merging: Preview uses first recipient by default, but user can select
 *
 * @module app/(auth)/campaigns/[id]/page
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Badge,
  Skeleton,
  Progress,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import {
  useCampaigns,
  type CampaignWithStats,
  type CampaignStatus,
  type CampaignPreview,
} from '@/hooks';
import {
  Mail,
  Loader2,
  Play,
  Pause,
  XCircle,
  Trash2,
  Eye,
  Clock,
  CheckCircle,
  AlertCircle,
  Send,
  Users,
  MousePointerClick,
  MessageSquare,
  ArrowLeft,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Timer,
  AlertTriangle,
  BarChart3,
  Inbox,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('CampaignDetailPage');

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns badge configuration for a campaign status.
 * Maps status values to visual representations with colors and icons.
 */
function getStatusBadge(status: CampaignStatus): {
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  label: string;
  icon: React.ReactNode;
  color: string;
} {
  const map: Record<
    CampaignStatus,
    { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string; icon: React.ReactNode; color: string }
  > = {
    draft: { variant: 'secondary', label: 'Draft', icon: <Clock className="h-3 w-3" />, color: 'text-muted-foreground' },
    scheduled: { variant: 'default', label: 'Scheduled', icon: <Calendar className="h-3 w-3" />, color: 'text-blue-500' },
    in_progress: { variant: 'default', label: 'Running', icon: <Play className="h-3 w-3" />, color: 'text-green-500' },
    paused: { variant: 'outline', label: 'Paused', icon: <Pause className="h-3 w-3" />, color: 'text-orange-500' },
    completed: { variant: 'secondary', label: 'Completed', icon: <CheckCircle className="h-3 w-3" />, color: 'text-blue-500' },
    cancelled: { variant: 'destructive', label: 'Cancelled', icon: <XCircle className="h-3 w-3" />, color: 'text-destructive' },
  };
  return map[status] || { variant: 'outline', label: status, icon: null, color: 'text-muted-foreground' };
}

/**
 * Formats a date string for display.
 * Includes time for better tracking of campaign events.
 */
function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Formats a date for relative time display (e.g., "2 hours ago").
 */
function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateString);
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL STATUS TYPES & HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Individual email record from the outbound_emails table.
 */
interface CampaignEmail {
  id: string;
  to_email: string;
  to_name: string | null;
  subject: string;
  status: 'draft' | 'scheduled' | 'queued' | 'sending' | 'sent' | 'failed' | 'cancelled';
  sent_at: string | null;
  scheduled_at: string | null;
  open_count: number;
  first_opened_at: string | null;
  last_opened_at: string | null;
  has_reply: boolean;
  reply_received_at: string | null;
  error_message: string | null;
  error_code: string | null;
  created_at: string;
}

/**
 * Returns badge configuration for an email status.
 */
function getEmailStatusBadge(status: CampaignEmail['status']): {
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  label: string;
} {
  const map: Record<CampaignEmail['status'], { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
    draft: { variant: 'secondary', label: 'Draft' },
    scheduled: { variant: 'outline', label: 'Scheduled' },
    queued: { variant: 'outline', label: 'Queued' },
    sending: { variant: 'default', label: 'Sending' },
    sent: { variant: 'default', label: 'Sent' },
    failed: { variant: 'destructive', label: 'Failed' },
    cancelled: { variant: 'secondary', label: 'Cancelled' },
  };
  return map[status] || { variant: 'outline', label: status };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOADING SKELETON
// ═══════════════════════════════════════════════════════════════════════════════

function CampaignDetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>

      {/* Content skeleton */}
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATS CARDS
// ═══════════════════════════════════════════════════════════════════════════════

interface StatsCardsProps {
  campaign: CampaignWithStats;
}

function StatsCards({ campaign }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {/* Recipients */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-2xl font-bold">{campaign.total_recipients}</span>
            </div>
            {campaign.remaining > 0 && campaign.status !== 'completed' && (
              <span className="text-xs text-muted-foreground">
                {campaign.remaining} left
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Total Recipients</p>
        </CardContent>
      </Card>

      {/* Sent */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-green-500" />
              <span className="text-2xl font-bold">{campaign.sent_count}</span>
            </div>
            {campaign.failed_count > 0 && (
              <span className="text-xs text-destructive">
                {campaign.failed_count} failed
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Emails Sent</p>
        </CardContent>
      </Card>

      {/* Opens */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MousePointerClick className="h-4 w-4 text-blue-500" />
              <span className="text-2xl font-bold">{campaign.open_count}</span>
            </div>
            {campaign.sent_count > 0 && (
              <span className="text-xs text-muted-foreground">
                {campaign.openRate}%
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Unique Opens</p>
        </CardContent>
      </Card>

      {/* Replies */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-purple-500" />
              <span className="text-2xl font-bold">{campaign.reply_count}</span>
            </div>
            {campaign.sent_count > 0 && (
              <span className="text-xs text-muted-foreground">
                {campaign.replyRate}%
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Replies</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAMPAIGN ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

interface CampaignActionsProps {
  campaign: CampaignWithStats;
  onStart: () => void;
  onPause: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onPreview: () => void;
  isActioning: boolean;
}

function CampaignActions({
  campaign,
  onStart,
  onPause,
  onCancel,
  onDelete,
  onPreview,
  isActioning,
}: CampaignActionsProps) {
  // Determine which actions are available based on status
  const canStart = ['draft', 'scheduled', 'paused'].includes(campaign.status);
  const canPause = campaign.status === 'in_progress';
  const canCancel = ['draft', 'scheduled', 'in_progress', 'paused'].includes(campaign.status);
  const canDelete = ['draft', 'cancelled'].includes(campaign.status);
  const canEdit = campaign.status === 'draft';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Preview button - always available */}
      <Button variant="outline" size="sm" onClick={onPreview} disabled={isActioning}>
        <Eye className="h-4 w-4 mr-2" />
        Preview
      </Button>

      {/* Edit button - only for drafts */}
      {canEdit && (
        <Link href={`/tasks/campaigns/${campaign.id}/edit`}>
          <Button variant="outline" size="sm" disabled={isActioning}>
            Edit Campaign
          </Button>
        </Link>
      )}

      {/* Start/Resume button */}
      {canStart && (
        <Button size="sm" onClick={onStart} disabled={isActioning}>
          {isActioning ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          {campaign.status === 'paused' ? 'Resume' : 'Start'} Campaign
        </Button>
      )}

      {/* Pause button */}
      {canPause && (
        <Button variant="outline" size="sm" onClick={onPause} disabled={isActioning}>
          {isActioning ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Pause className="h-4 w-4 mr-2" />
          )}
          Pause
        </Button>
      )}

      {/* Cancel button */}
      {canCancel && (
        <Button variant="outline" size="sm" className="text-orange-600" onClick={onCancel} disabled={isActioning}>
          <XCircle className="h-4 w-4 mr-2" />
          Cancel
        </Button>
      )}

      {/* Delete button */}
      {canDelete && (
        <Button variant="outline" size="sm" className="text-destructive" onClick={onDelete} disabled={isActioning}>
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </Button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRESS SECTION
// ═══════════════════════════════════════════════════════════════════════════════

interface ProgressSectionProps {
  campaign: CampaignWithStats;
}

function ProgressSection({ campaign }: ProgressSectionProps) {
  const showProgress = ['in_progress', 'paused', 'completed'].includes(campaign.status);

  if (!showProgress && campaign.sent_count === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Campaign Progress
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">
                {campaign.sent_count + campaign.failed_count} of {campaign.total_recipients} processed
              </span>
              <span className="font-medium">{campaign.progressPercent}%</span>
            </div>
            <Progress value={campaign.progressPercent} className="h-2" />
          </div>

          {/* Progress breakdown */}
          <div className="grid grid-cols-3 gap-4 text-center text-sm">
            <div>
              <div className="text-lg font-semibold text-green-500">{campaign.sent_count}</div>
              <div className="text-xs text-muted-foreground">Sent</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-destructive">{campaign.failed_count}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-muted-foreground">{campaign.remaining}</div>
              <div className="text-xs text-muted-foreground">Remaining</div>
            </div>
          </div>

          {/* Throttle info */}
          {campaign.status === 'in_progress' && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
              <Timer className="h-3 w-3" />
              <span>Sending at {campaign.throttle_seconds}s intervals (~{Math.round(3600 / campaign.throttle_seconds)} emails/hour)</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL LIST
// ═══════════════════════════════════════════════════════════════════════════════

interface EmailListProps {
  campaignId: string;
}

function EmailList({ campaignId }: EmailListProps) {
  const [emails, setEmails] = React.useState<CampaignEmail[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [totalCount, setTotalCount] = React.useState(0);
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const limit = 25;

  /**
   * Fetches campaign emails with pagination.
   * Uses the /api/campaigns/[id]/emails endpoint.
   */
  const fetchEmails = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);

    logger.start('Fetching campaign emails', { campaignId, page, statusFilter });

    try {
      let url = `/api/campaigns/${campaignId}/emails?page=${page}&limit=${limit}`;
      if (statusFilter !== 'all') {
        url += `&status=${statusFilter}`;
      }

      const response = await fetch(url);
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to fetch emails');
      }

      setEmails(result.data || []);
      setTotalCount(result.pagination?.total || 0);

      logger.success('Campaign emails fetched', { count: result.data?.length || 0 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to fetch campaign emails', { error: message });
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [campaignId, page, statusFilter]);

  // Fetch emails on mount and when filters change
  React.useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  const totalPages = Math.ceil(totalCount / limit);

  if (isLoading && emails.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            Sent Emails
            {totalCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {totalCount}
              </Badge>
            )}
          </CardTitle>

          {/* Status filter */}
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="text-xs border rounded px-2 py-1 bg-background"
            >
              <option value="all">All Status</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
              <option value="scheduled">Scheduled</option>
              <option value="queued">Queued</option>
            </select>
            <Button variant="ghost" size="icon" onClick={fetchEmails} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="text-sm text-destructive mb-4 p-3 bg-destructive/10 rounded-md">
            <AlertCircle className="h-4 w-4 inline mr-2" />
            {error}
          </div>
        )}

        {emails.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No emails sent yet</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {emails.map((email) => {
                const statusBadge = getEmailStatusBadge(email.status);
                return (
                  <div
                    key={email.id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors"
                  >
                    {/* Status indicator */}
                    <div className="mt-1">
                      {email.status === 'sent' && email.open_count > 0 ? (
                        <MousePointerClick className="h-4 w-4 text-blue-500" />
                      ) : email.status === 'sent' ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : email.status === 'failed' ? (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      ) : (
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>

                    {/* Email details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm truncate">
                          {email.to_name || email.to_email}
                        </span>
                        <Badge variant={statusBadge.variant} className="text-xs">
                          {statusBadge.label}
                        </Badge>
                        {email.has_reply && (
                          <Badge variant="outline" className="text-xs text-purple-500 border-purple-500">
                            Replied
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {email.to_email}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="font-medium">Subject:</span> {email.subject}
                      </p>

                      {/* Error message for failed emails */}
                      {email.status === 'failed' && email.error_message && (
                        <p className="text-xs text-destructive mt-1 bg-destructive/10 rounded px-2 py-1">
                          {email.error_message}
                        </p>
                      )}
                    </div>

                    {/* Metrics and timestamp */}
                    <div className="text-right text-xs text-muted-foreground shrink-0">
                      {email.sent_at && (
                        <p>{formatRelativeTime(email.sent_at)}</p>
                      )}
                      {email.open_count > 0 && (
                        <p className="text-blue-500">
                          {email.open_count} open{email.open_count !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <span className="text-xs text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1 || isLoading}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages || isLoading}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAMPAIGN INFO CARD
// ═══════════════════════════════════════════════════════════════════════════════

interface CampaignInfoProps {
  campaign: CampaignWithStats;
}

function CampaignInfo({ campaign }: CampaignInfoProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Campaign Details</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-3 text-sm">
          {campaign.description && (
            <div>
              <dt className="text-muted-foreground text-xs">Description</dt>
              <dd>{campaign.description}</dd>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-muted-foreground text-xs">Created</dt>
              <dd>{formatDate(campaign.created_at)}</dd>
            </div>
            {campaign.started_at && (
              <div>
                <dt className="text-muted-foreground text-xs">Started</dt>
                <dd>{formatDate(campaign.started_at)}</dd>
              </div>
            )}
            {campaign.completed_at && (
              <div>
                <dt className="text-muted-foreground text-xs">Completed</dt>
                <dd>{formatDate(campaign.completed_at)}</dd>
              </div>
            )}
            {campaign.scheduled_at && campaign.status === 'scheduled' && (
              <div>
                <dt className="text-muted-foreground text-xs">Scheduled For</dt>
                <dd>{formatDate(campaign.scheduled_at)}</dd>
              </div>
            )}
          </div>

          <div>
            <dt className="text-muted-foreground text-xs">Sending Account</dt>
            <dd>{campaign.gmail_accounts?.email || 'Unknown'}</dd>
          </div>

          <div>
            <dt className="text-muted-foreground text-xs">Throttle Rate</dt>
            <dd>{campaign.throttle_seconds} seconds between emails</dd>
          </div>

          {campaign.follow_up_enabled && (
            <div className="pt-2 border-t">
              <dt className="text-muted-foreground text-xs mb-1">Follow-up</dt>
              <dd className="text-xs bg-muted/50 rounded p-2">
                <p>
                  <strong>Condition:</strong>{' '}
                  {campaign.follow_up_condition === 'no_open'
                    ? 'No open'
                    : campaign.follow_up_condition === 'no_reply'
                    ? 'No reply'
                    : 'No open or reply'}
                </p>
                <p>
                  <strong>Delay:</strong> {campaign.follow_up_delay_hours} hours
                </p>
              </dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PREVIEW MODAL
// ═══════════════════════════════════════════════════════════════════════════════

interface PreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: CampaignPreview | null;
  isLoading: boolean;
  recipientIndex: number;
  totalRecipients: number;
  onRecipientChange: (index: number) => void;
}

function PreviewModal({
  open,
  onOpenChange,
  preview,
  isLoading,
  recipientIndex,
  totalRecipients,
  onRecipientChange,
}: PreviewModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Email Preview</DialogTitle>
          <DialogDescription>
            Preview of the email with merge fields populated
          </DialogDescription>
        </DialogHeader>

        {/* Recipient selector */}
        <div className="flex items-center justify-between pb-3 border-b">
          <span className="text-sm text-muted-foreground">
            Recipient {recipientIndex + 1} of {totalRecipients}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onRecipientChange(Math.max(0, recipientIndex - 1))}
              disabled={recipientIndex === 0 || isLoading}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onRecipientChange(Math.min(totalRecipients - 1, recipientIndex + 1))}
              disabled={recipientIndex === totalRecipients - 1 || isLoading}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Preview content */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : preview ? (
            <div className="space-y-4">
              {/* Header info */}
              <div className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="font-medium w-16 text-muted-foreground">From:</span>
                  <span>{preview.from}</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-medium w-16 text-muted-foreground">To:</span>
                  <span>{preview.to}</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-medium w-16 text-muted-foreground">Subject:</span>
                  <span className="font-medium">{preview.subject}</span>
                </div>
              </div>

              {/* Unresolved merge fields warning */}
              {preview.mergeFields.unresolved.length > 0 && (
                <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-md text-sm">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-orange-600">Unresolved merge fields</p>
                      <p className="text-muted-foreground text-xs mt-1">
                        The following fields will appear as placeholders:{' '}
                        {preview.mergeFields.unresolved.map((f) => `{{${f}}}`).join(', ')}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Email body */}
              <div className="border rounded-lg p-4 bg-background">
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: preview.bodyHtml }}
                />
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              Failed to load preview
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIRM DIALOG
// ═══════════════════════════════════════════════════════════════════════════════

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant?: 'default' | 'destructive';
  onConfirm: () => void;
  isLoading?: boolean;
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmVariant = 'default',
  onConfirm,
  isLoading,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;

  // ─────────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────────

  const [campaign, setCampaign] = React.useState<CampaignWithStats | null>(null);
  const [isLoadingCampaign, setIsLoadingCampaign] = React.useState(true);
  const [campaignError, setCampaignError] = React.useState<string | null>(null);
  const [isActioning, setIsActioning] = React.useState(false);

  // Preview state
  const [showPreview, setShowPreview] = React.useState(false);
  const [preview, setPreview] = React.useState<CampaignPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = React.useState(false);
  const [previewRecipientIndex, setPreviewRecipientIndex] = React.useState(0);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = React.useState<{
    open: boolean;
    type: 'cancel' | 'delete';
  }>({ open: false, type: 'cancel' });

  // ─────────────────────────────────────────────────────────────────────────────
  // Hooks
  // ─────────────────────────────────────────────────────────────────────────────

  const {
    startCampaign,
    pauseCampaign,
    cancelCampaign,
    deleteCampaign,
    previewCampaign,
  } = useCampaigns();

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch Campaign Data
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Fetches the campaign details from the API.
   * Runs on mount and sets up auto-refresh for running campaigns.
   */
  const fetchCampaign = React.useCallback(async () => {
    logger.start('Fetching campaign details', { campaignId });

    try {
      const response = await fetch(`/api/campaigns/${campaignId}`);
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to fetch campaign');
      }

      // Add computed stats to the campaign
      const campaignData = result.data.campaign;
      const withStats: CampaignWithStats = {
        ...campaignData,
        progressPercent: campaignData.total_recipients > 0
          ? Math.round(((campaignData.sent_count + campaignData.failed_count) / campaignData.total_recipients) * 100)
          : 0,
        openRate: campaignData.sent_count > 0
          ? Math.round((campaignData.open_count / campaignData.sent_count) * 100)
          : 0,
        replyRate: campaignData.sent_count > 0
          ? Math.round((campaignData.reply_count / campaignData.sent_count) * 100)
          : 0,
        remaining: campaignData.total_recipients - campaignData.sent_count - campaignData.failed_count,
      };

      setCampaign(withStats);
      setCampaignError(null);

      logger.success('Campaign fetched', { status: campaignData.status });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to fetch campaign', { error: message });
      setCampaignError(message);
    } finally {
      setIsLoadingCampaign(false);
    }
  }, [campaignId]);

  // Initial fetch
  React.useEffect(() => {
    fetchCampaign();
  }, [fetchCampaign]);

  // Auto-refresh for running campaigns (every 5 seconds)
  React.useEffect(() => {
    if (!campaign || campaign.status !== 'in_progress') return;

    logger.info('Setting up auto-refresh for running campaign');
    const interval = setInterval(fetchCampaign, 5000);

    return () => {
      logger.info('Clearing auto-refresh interval');
      clearInterval(interval);
    };
  }, [campaign?.status, fetchCampaign]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Preview Handler
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Fetches preview for a specific recipient.
   * Called when opening preview modal or changing recipient.
   */
  const handleFetchPreview = React.useCallback(
    async (recipientIndex: number) => {
      setIsLoadingPreview(true);
      setPreviewRecipientIndex(recipientIndex);

      logger.start('Fetching preview', { campaignId, recipientIndex });

      const result = await previewCampaign(campaignId, recipientIndex);
      setPreview(result);
      setIsLoadingPreview(false);

      if (result) {
        logger.success('Preview loaded');
      }
    },
    [campaignId, previewCampaign]
  );

  const handleOpenPreview = () => {
    setShowPreview(true);
    handleFetchPreview(0);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Action Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const handleStart = async () => {
    if (!campaign) return;
    setIsActioning(true);

    logger.info('Starting campaign', { id: campaign.id.substring(0, 8) });
    const success = await startCampaign(campaign.id);

    if (success) {
      await fetchCampaign();
    }
    setIsActioning(false);
  };

  const handlePause = async () => {
    if (!campaign) return;
    setIsActioning(true);

    logger.info('Pausing campaign', { id: campaign.id.substring(0, 8) });
    const success = await pauseCampaign(campaign.id);

    if (success) {
      await fetchCampaign();
    }
    setIsActioning(false);
  };

  const handleCancelClick = () => {
    setConfirmDialog({ open: true, type: 'cancel' });
  };

  const handleDeleteClick = () => {
    setConfirmDialog({ open: true, type: 'delete' });
  };

  const handleConfirmAction = async () => {
    if (!campaign) return;
    setIsActioning(true);

    if (confirmDialog.type === 'cancel') {
      logger.info('Cancelling campaign', { id: campaign.id.substring(0, 8) });
      const success = await cancelCampaign(campaign.id);
      if (success) {
        await fetchCampaign();
      }
    } else {
      logger.info('Deleting campaign', { id: campaign.id.substring(0, 8) });
      const success = await deleteCampaign(campaign.id);
      if (success) {
        router.push('/tasks?tab=campaigns');
        return;
      }
    }

    setIsActioning(false);
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  // Loading state
  if (isLoadingCampaign) {
    return (
      <div>
        <PageHeader
          title="Campaign Details"
          breadcrumbs={[
            { label: 'Home', href: '/' },
            { label: 'Campaigns', href: '/tasks?tab=campaigns' },
            { label: 'Loading...' },
          ]}
        />
        <CampaignDetailSkeleton />
      </div>
    );
  }

  // Error state
  if (campaignError || !campaign) {
    return (
      <div>
        <PageHeader
          title="Campaign Not Found"
          breadcrumbs={[
            { label: 'Home', href: '/' },
            { label: 'Campaigns', href: '/tasks?tab=campaigns' },
            { label: 'Error' },
          ]}
        />
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h3 className="text-lg font-medium mb-2">Campaign Not Found</h3>
            <p className="text-muted-foreground mb-4">
              {campaignError || "The campaign you're looking for doesn't exist or you don't have access to it."}
            </p>
            <Link href="/tasks?tab=campaigns">
              <Button>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Campaigns
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusBadge = getStatusBadge(campaign.status);

  return (
    <div>
      <PageHeader
        title={campaign.name}
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Campaigns', href: '/tasks?tab=campaigns' },
          { label: campaign.name },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={statusBadge.variant} className="gap-1 text-sm">
              {statusBadge.icon}
              {statusBadge.label}
            </Badge>
            <Button variant="ghost" size="icon" onClick={fetchCampaign} title="Refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      <div className="space-y-6">
        {/* Action buttons */}
        <CampaignActions
          campaign={campaign}
          onStart={handleStart}
          onPause={handlePause}
          onCancel={handleCancelClick}
          onDelete={handleDeleteClick}
          onPreview={handleOpenPreview}
          isActioning={isActioning}
        />

        {/* Stats cards */}
        <StatsCards campaign={campaign} />

        {/* Progress section */}
        <ProgressSection campaign={campaign} />

        {/* Main content tabs */}
        <Tabs defaultValue="emails" className="space-y-4">
          <TabsList>
            <TabsTrigger value="emails">
              Emails
              {campaign.sent_count > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {campaign.sent_count}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>

          <TabsContent value="emails">
            <EmailList campaignId={campaign.id} />
          </TabsContent>

          <TabsContent value="details">
            <CampaignInfo campaign={campaign} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Preview modal */}
      <PreviewModal
        open={showPreview}
        onOpenChange={setShowPreview}
        preview={preview}
        isLoading={isLoadingPreview}
        recipientIndex={previewRecipientIndex}
        totalRecipients={campaign.total_recipients}
        onRecipientChange={handleFetchPreview}
      />

      {/* Confirm dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.type === 'cancel' ? 'Cancel Campaign?' : 'Delete Campaign?'}
        description={
          confirmDialog.type === 'cancel'
            ? `Are you sure you want to cancel "${campaign.name}"? This will stop all pending sends. Emails already sent cannot be recalled.`
            : `Are you sure you want to delete "${campaign.name}"? This action cannot be undone.`
        }
        confirmLabel={confirmDialog.type === 'cancel' ? 'Cancel Campaign' : 'Delete'}
        confirmVariant="destructive"
        onConfirm={handleConfirmAction}
        isLoading={isActioning}
      />
    </div>
  );
}
