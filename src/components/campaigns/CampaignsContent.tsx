/**
 * Campaigns Content Component
 *
 * Extracted from the campaigns page for use inside the Tasks tabbed UI.
 * Contains all campaign list functionality without the PageHeader wrapper.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```tsx
 * import { CampaignsContent } from '@/components/campaigns';
 * ```
 *
 * @module components/campaigns/CampaignsContent
 * @since February 2026 — Phase 4 Navigation Redesign
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
  Badge,
  Skeleton,
  Progress,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui';
import {
  useCampaigns,
  type CampaignWithStats,
  type CampaignStatus,
} from '@/hooks';
import {
  Mail,
  Plus,
  MoreHorizontal,
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
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('CampaignsContent');

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function getStatusBadge(status: CampaignStatus): {
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  label: string;
  icon: React.ReactNode;
} {
  const map: Record<CampaignStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string; icon: React.ReactNode }> = {
    draft: { variant: 'secondary', label: 'Draft', icon: <Clock className="h-3 w-3" /> },
    scheduled: { variant: 'default', label: 'Scheduled', icon: <Clock className="h-3 w-3" /> },
    in_progress: { variant: 'default', label: 'Running', icon: <Play className="h-3 w-3" /> },
    paused: { variant: 'outline', label: 'Paused', icon: <Pause className="h-3 w-3" /> },
    completed: { variant: 'secondary', label: 'Completed', icon: <CheckCircle className="h-3 w-3" /> },
    cancelled: { variant: 'destructive', label: 'Cancelled', icon: <XCircle className="h-3 w-3" /> },
  };
  return map[status] || { variant: 'outline', label: status, icon: null };
}

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

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

interface CampaignListItemProps {
  campaign: CampaignWithStats;
  onStart: (id: string) => void;
  onPause: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  isActioning: boolean;
}

function CampaignListItem({
  campaign,
  onStart,
  onPause,
  onCancel,
  onDelete,
  isActioning,
}: CampaignListItemProps) {
  const [showMenu, setShowMenu] = React.useState(false);
  const statusBadge = getStatusBadge(campaign.status);

  const canStart = ['draft', 'scheduled', 'paused'].includes(campaign.status);
  const canPause = campaign.status === 'in_progress';
  const canCancel = ['draft', 'scheduled', 'in_progress', 'paused'].includes(campaign.status);
  const canDelete = ['draft', 'cancelled'].includes(campaign.status);

  return (
    <div className="flex items-start gap-4 p-4 border-b border-border/50 hover:bg-muted/30 transition-colors">
      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <Mail className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Link
            href={`/tasks/campaigns/${campaign.id}`}
            className="font-medium truncate hover:underline"
          >
            {campaign.name}
          </Link>
          <Badge variant={statusBadge.variant} className="gap-1 text-xs">
            {statusBadge.icon}
            {statusBadge.label}
          </Badge>
        </div>
        {(campaign.status === 'in_progress' || campaign.status === 'paused') && (
          <div className="mt-2 mb-2">
            <Progress value={campaign.progressPercent} className="h-1.5" />
            <p className="text-xs text-muted-foreground mt-1">
              {campaign.sent_count} of {campaign.total_recipients} sent ({campaign.progressPercent}%)
              {campaign.failed_count > 0 && (
                <span className="text-destructive ml-2">
                  {campaign.failed_count} failed
                </span>
              )}
            </p>
          </div>
        )}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {campaign.total_recipients} recipients
          </span>
          {campaign.sent_count > 0 && (
            <>
              <span className="flex items-center gap-1">
                <MousePointerClick className="h-3 w-3" />
                {campaign.openRate}% opens
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {campaign.replyRate}% replies
              </span>
            </>
          )}
          {campaign.gmail_accounts?.email && (
            <span className="text-muted-foreground/70">
              via {campaign.gmail_accounts.email}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
          {campaign.scheduled_at && campaign.status === 'scheduled' && (
            <span>Scheduled: {formatDate(campaign.scheduled_at)}</span>
          )}
          {campaign.started_at && (
            <span>Started: {formatDate(campaign.started_at)}</span>
          )}
          {campaign.completed_at && (
            <span>Completed: {formatDate(campaign.completed_at)}</span>
          )}
          {!campaign.started_at && !campaign.scheduled_at && (
            <span>Created: {formatDate(campaign.created_at)}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {canStart && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onStart(campaign.id)}
            disabled={isActioning}
            title={campaign.status === 'paused' ? 'Resume' : 'Start'}
          >
            <Play className="h-4 w-4" />
          </Button>
        )}
        {canPause && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onPause(campaign.id)}
            disabled={isActioning}
            title="Pause"
          >
            <Pause className="h-4 w-4" />
          </Button>
        )}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowMenu(!showMenu)}
            aria-label="More actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1 w-48 bg-popover border border-border rounded-md shadow-md z-20">
                <Link
                  href={`/tasks/campaigns/${campaign.id}`}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted"
                  onClick={() => setShowMenu(false)}
                >
                  <Eye className="h-4 w-4" />
                  View Details
                </Link>
                {canCancel && (
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onCancel(campaign.id);
                    }}
                    disabled={isActioning}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/20"
                  >
                    <XCircle className="h-4 w-4" />
                    Cancel Campaign
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onDelete(campaign.id);
                    }}
                    disabled={isActioning}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CampaignListSkeleton() {
  return (
    <div className="space-y-0">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-start gap-4 p-4 border-b border-border/50">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <Send className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-2">No campaigns yet</h3>
      <p className="text-muted-foreground max-w-sm mb-4">
        Create your first email campaign to send personalized emails to multiple recipients.
      </p>
      <Link href="/tasks/campaigns/new">
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Create Campaign
        </Button>
      </Link>
    </div>
  );
}

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

type StatusFilter = 'all' | 'draft' | 'in_progress' | 'completed' | 'paused';

/**
 * CampaignsContent — campaign list with filtering and actions.
 * Extracted from CampaignsPage for use inside TasksTabs.
 */
export function CampaignsContent() {
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');
  const [isActioning, setIsActioning] = React.useState(false);
  const [confirmDialog, setConfirmDialog] = React.useState<{
    open: boolean;
    type: 'cancel' | 'delete';
    campaignId: string;
    campaignName: string;
  }>({ open: false, type: 'cancel', campaignId: '', campaignName: '' });

  const {
    campaigns,
    isLoading,
    error,
    stats,
    startCampaign,
    pauseCampaign,
    cancelCampaign,
    deleteCampaign,
    refetch,
  } = useCampaigns({
    status: statusFilter === 'all' ? undefined : statusFilter,
    refreshInterval: 10000,
  });

  const handleStart = async (id: string) => {
    setIsActioning(true);
    logger.info('Starting campaign', { id: id.substring(0, 8) });
    const success = await startCampaign(id);
    if (success) await refetch();
    setIsActioning(false);
  };

  const handlePause = async (id: string) => {
    setIsActioning(true);
    logger.info('Pausing campaign', { id: id.substring(0, 8) });
    const success = await pauseCampaign(id);
    if (success) await refetch();
    setIsActioning(false);
  };

  const handleCancelClick = (campaign: CampaignWithStats) => {
    setConfirmDialog({
      open: true,
      type: 'cancel',
      campaignId: campaign.id,
      campaignName: campaign.name,
    });
  };

  const handleDeleteClick = (campaign: CampaignWithStats) => {
    setConfirmDialog({
      open: true,
      type: 'delete',
      campaignId: campaign.id,
      campaignName: campaign.name,
    });
  };

  const handleConfirmAction = async () => {
    setIsActioning(true);
    if (confirmDialog.type === 'cancel') {
      logger.info('Cancelling campaign', { id: confirmDialog.campaignId.substring(0, 8) });
      await cancelCampaign(confirmDialog.campaignId);
    } else {
      logger.info('Deleting campaign', { id: confirmDialog.campaignId.substring(0, 8) });
      await deleteCampaign(confirmDialog.campaignId);
    }
    await refetch();
    setIsActioning(false);
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  return (
    <>
      {error && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-sm text-destructive">
            <AlertCircle className="h-4 w-4 inline mr-2" />
            <strong>Error:</strong> {error.message}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card
          className={`cursor-pointer transition-colors ${statusFilter === 'all' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => setStatusFilter('all')}
        >
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-primary" />
              <span className="text-2xl font-bold">{stats.total}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Total Campaigns</p>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-colors ${statusFilter === 'in_progress' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'in_progress' ? 'all' : 'in_progress')}
        >
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Play className="h-4 w-4 text-green-500" />
              <span className="text-2xl font-bold">{stats.inProgress}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Running</p>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-colors ${statusFilter === 'draft' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'draft' ? 'all' : 'draft')}
        >
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">{stats.draft}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Drafts</p>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-colors ${statusFilter === 'completed' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'completed' ? 'all' : 'completed')}
        >
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-blue-500" />
              <span className="text-2xl font-bold">{stats.completed}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Completed</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {statusFilter === 'all'
                ? 'All Campaigns'
                : `${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1).replace('_', ' ')} Campaigns`}
            </CardTitle>
            {campaigns.length > 0 && (
              <span className="text-sm text-muted-foreground">
                {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <CampaignListSkeleton />
          ) : campaigns.length === 0 ? (
            <EmptyState />
          ) : (
            <div>
              {campaigns.map((campaign) => (
                <CampaignListItem
                  key={campaign.id}
                  campaign={campaign}
                  onStart={handleStart}
                  onPause={handlePause}
                  onCancel={() => handleCancelClick(campaign)}
                  onDelete={() => handleDeleteClick(campaign)}
                  isActioning={isActioning}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.type === 'cancel' ? 'Cancel Campaign?' : 'Delete Campaign?'}
        description={
          confirmDialog.type === 'cancel'
            ? `Are you sure you want to cancel "${confirmDialog.campaignName}"? This will stop all pending sends. Emails already sent cannot be recalled.`
            : `Are you sure you want to delete "${confirmDialog.campaignName}"? This action cannot be undone.`
        }
        confirmLabel={confirmDialog.type === 'cancel' ? 'Cancel Campaign' : 'Delete'}
        confirmVariant="destructive"
        onConfirm={handleConfirmAction}
        isLoading={isActioning}
      />
    </>
  );
}
