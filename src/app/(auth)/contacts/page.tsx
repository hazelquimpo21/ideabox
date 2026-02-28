/**
 * Contacts Page
 *
 * Displays and manages contacts automatically extracted from emails.
 * Contacts are enriched with AI-detected information like company, job title,
 * and inferred relationship type.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - List all contacts with filtering (VIP, All, Muted)
 * - Search by name or email
 * - Sort by email count, last seen, or name
 * - Page-based pagination with navigation controls
 * - Mark contacts as VIP for priority handling
 * - Mute contacts to hide their emails
 * - Click contact card to view full CRM-style detail page
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 * Route: /contacts
 * Protected: Yes (requires authentication)
 *
 * @module app/(auth)/contacts/page
 * @version 2.0.0
 * @since January 2026
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/layout';
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
  Badge,
  Button,
  Input,
  Skeleton,
  Pagination,
} from '@/components/ui';
import { useContacts } from '@/hooks/useContacts';
import {
  SyncContactsButton,
  HistoricalSyncButton,
  ContactsTabs,
  getActiveContactsTab,
  PromoteToClientDialog,
} from '@/components/contacts';
import type { ContactsTab } from '@/components/contacts';
import type { Contact, ContactRelationshipType, ContactStats, SenderType } from '@/hooks/useContacts';
import type { PromoteToClientData } from '@/components/contacts/PromoteToClientDialog';
import {
  Users,
  Star,
  StarOff,
  VolumeX,
  Volume2,
  Search,
  Mail,
  Building2,
  Briefcase,
  Clock,
  RefreshCw,
  AlertTriangle,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Newspaper,
  UserCircle,
  CircleHelp,
  Megaphone,
  Target,
  Crown,
  CheckCircle,
  XCircle,
  Archive,
  Cake,
  StickyNote,
  Send,
  Inbox as InboxIcon,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('ContactsPage');

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Number of contacts to display per page */
const PAGE_SIZE = 50;

/**
 * Primary sender type tabs for distinguishing contacts from subscriptions.
 * These control the main view filter (NEW Jan 2026).
 */
const SENDER_TYPE_TABS = [
  {
    id: 'direct' as SenderType,
    label: 'Contacts',
    icon: UserCircle,
    hint: 'Real people who know you',
    statsKey: 'direct' as const,
  },
  {
    id: 'broadcast' as SenderType,
    label: 'Subscriptions',
    icon: Newspaper,
    hint: 'Newsletters and marketing',
    statsKey: 'broadcast' as const,
  },
  {
    id: 'cold_outreach' as SenderType,
    label: 'Outreach',
    icon: Megaphone,
    hint: 'Cold emails and sales',
    statsKey: 'cold_outreach' as const,
  },
  {
    id: 'unknown' as SenderType,
    label: 'Uncategorized',
    icon: CircleHelp,
    hint: 'Not yet classified',
    statsKey: 'unknown' as const,
  },
  {
    id: 'all' as SenderType,
    label: 'All',
    icon: Users,
    hint: 'Show everyone',
    statsKey: null,
  },
] as const;

/**
 * Filter tabs for the contacts list (secondary filters).
 * Each tab corresponds to a specific filter configuration.
 */
const FILTER_TABS = [
  { id: 'all', label: 'All', filter: {} },
  { id: 'vip', label: 'VIP', filter: { isVip: true } },
  { id: 'muted', label: 'Muted', filter: { isMuted: true } },
] as const;

/**
 * Sort options for the contacts list.
 */
const SORT_OPTIONS = [
  { value: 'last_seen_at', label: 'Last Seen' },
  { value: 'email_count', label: 'Email Count' },
  { value: 'name', label: 'Name' },
] as const;

/**
 * Relationship type display configuration.
 * Maps relationship types to labels and colors.
 */
const RELATIONSHIP_CONFIG: Record<
  ContactRelationshipType,
  { label: string; color: string }
> = {
  client: { label: 'Client', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  colleague: { label: 'Colleague', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  vendor: { label: 'Vendor', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  friend: { label: 'Friend', color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300' },
  family: { label: 'Family', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' },
  recruiter: { label: 'Recruiter', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  service: { label: 'Service', color: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300' },
  unknown: { label: 'Unknown', color: 'bg-gray-100 text-gray-500 dark:bg-gray-900/30 dark:text-gray-400' },
};

/**
 * Sender type display configuration.
 * Shows visual indicators for newsletters vs direct contacts.
 */
const SENDER_TYPE_CONFIG: Record<
  string,
  { label: string; color: string; icon: typeof Newspaper }
> = {
  direct: {
    label: 'Contact',
    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    icon: UserCircle,
  },
  broadcast: {
    label: 'Newsletter',
    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    icon: Newspaper,
  },
  cold_outreach: {
    label: 'Outreach',
    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    icon: Megaphone,
  },
  opportunity: {
    label: 'Opportunity',
    color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
    icon: Target,
  },
  unknown: {
    label: 'Uncategorized',
    color: 'bg-gray-100 text-gray-500 dark:bg-gray-900/30 dark:text-gray-400',
    icon: CircleHelp,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Formats a date string as a relative time (e.g., "2 days ago").
 * Used for displaying last seen dates.
 *
 * @param dateString - ISO date string to format
 * @returns Human-readable relative time string
 */
function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'Never';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Stats cards showing contact statistics.
 * Shows totals with subtle animations and helpful context.
 */
function StatsCards({ stats, isLoading }: { stats: ContactStats; isLoading?: boolean }) {
  const statItems = [
    {
      icon: Users,
      value: stats.total,
      label: 'Total Contacts',
      color: 'text-muted-foreground',
      hint: 'People you\'ve emailed',
    },
    {
      icon: Star,
      value: stats.vip,
      label: 'VIP Contacts',
      color: 'text-yellow-500',
      hint: 'Priority inbox',
    },
    {
      icon: Building2,
      value: stats.clients,
      label: 'Clients',
      color: 'text-blue-500',
      hint: 'Business relationships',
    },
    {
      icon: VolumeX,
      value: stats.muted,
      label: 'Muted',
      color: 'text-gray-500',
      hint: 'Hidden from inbox',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {statItems.map((item) => (
        <Card key={item.label} className="hover:border-primary/20 transition-colors group">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <item.icon className={`h-4 w-4 ${item.color}`} />
              {isLoading ? (
                <Skeleton className="h-7 w-12" />
              ) : (
                <span className="text-2xl font-bold tabular-nums">{item.value.toLocaleString()}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              {item.hint}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Primary sender type tabs component.
 * Allows switching between Contacts (direct) and Subscriptions (broadcast).
 * Shows badge counts from stats.bySenderType.
 */
function SenderTypeTabs({
  activeType,
  onTypeChange,
  stats,
  isLoading,
}: {
  activeType: SenderType;
  onTypeChange: (type: SenderType) => void;
  stats: ContactStats;
  isLoading?: boolean;
}) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {SENDER_TYPE_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeType === tab.id;
          const count = tab.statsKey ? stats.bySenderType[tab.statsKey] : stats.total;

          return (
            <button
              key={tab.id}
              onClick={() => onTypeChange(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                transition-all duration-200
                ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                }
              `}
              title={tab.hint}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
              {/* Badge count */}
              {isLoading ? (
                <Skeleton className="h-5 w-6 rounded-full" />
              ) : (
                <span
                  className={`
                    px-2 py-0.5 text-xs rounded-full font-medium tabular-nums
                    ${
                      isActive
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }
                  `}
                >
                  {count.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Filter tabs and search bar component.
 */
function ContactFilters({
  activeTab,
  onTabChange,
  searchValue,
  onSearchChange,
  sortBy,
  onSortChange,
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  sortBy: string;
  onSortChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col md:flex-row gap-4 mb-6">
      {/* Filter tabs */}
      <div className="flex gap-2">
        {FILTER_TABS.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => onTabChange(tab.id)}
          >
            {tab.id === 'vip' && <Star className="h-3 w-3 mr-1" />}
            {tab.id === 'muted' && <VolumeX className="h-3 w-3 mr-1" />}
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Search and sort */}
      <div className="flex-1 flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search contacts..."
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Sort dropdown */}
        <div className="relative">
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowUpDown className="h-3 w-3" />
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {SORT_OPTIONS.find((o) => o.value === sortBy)?.label || 'Sort'}
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Single contact card component.
 * Displays contact info with action buttons.
 * The entire card is clickable and navigates to the contact detail page.
 */
/**
 * Gets the appropriate badge config for a client status value.
 */
function getClientStatusBadge(status: string | null) {
  const map: Record<string, { variant: 'default' | 'secondary' | 'outline'; label: string; icon: React.ReactNode }> = {
    active: { variant: 'default', label: 'Active', icon: <CheckCircle className="h-3 w-3" /> },
    inactive: { variant: 'secondary', label: 'Inactive', icon: <XCircle className="h-3 w-3" /> },
    archived: { variant: 'outline', label: 'Archived', icon: <Archive className="h-3 w-3" /> },
  };
  return status ? map[status] || null : null;
}

/**
 * Gets the appropriate badge config for a client priority value.
 */
function getClientPriorityBadge(priority: string | null) {
  const map: Record<string, { variant: 'default' | 'destructive' | 'secondary'; label: string }> = {
    vip: { variant: 'destructive', label: 'VIP' },
    high: { variant: 'destructive', label: 'High' },
    medium: { variant: 'default', label: 'Medium' },
    low: { variant: 'secondary', label: 'Low' },
  };
  return priority ? map[priority] || null : null;
}

function ContactCard({
  contact,
  onToggleVip,
  onToggleMuted,
  onPromoteToClient,
  showPromoteButton,
}: {
  contact: Contact;
  onToggleVip: (id: string, e: React.MouseEvent) => void;
  onToggleMuted: (id: string, e: React.MouseEvent) => void;
  onPromoteToClient?: (contact: Contact, e: React.MouseEvent) => void;
  showPromoteButton?: boolean;
}) {
  const relationshipConfig = RELATIONSHIP_CONFIG[contact.relationship_type] || RELATIONSHIP_CONFIG.unknown;
  // Get sender type config with fallback to 'unknown' if not found
  const senderKey = contact.sender_type && contact.sender_type !== 'all' ? contact.sender_type : 'unknown';
  const senderTypeConfig = SENDER_TYPE_CONFIG[senderKey] ?? SENDER_TYPE_CONFIG.unknown;
  const SenderTypeIcon = senderTypeConfig.icon;

  // Client-specific badges
  const clientStatusBadge = contact.is_client ? getClientStatusBadge(contact.client_status) : null;
  const clientPriorityBadge = contact.is_client ? getClientPriorityBadge(contact.client_priority) : null;

  return (
    <Link href={`/contacts/${contact.id}`} className="block">
      <Card className={`hover:bg-muted/50 hover:border-primary/20 transition-colors cursor-pointer group ${
        contact.is_client && contact.client_priority === 'vip' ? 'bg-yellow-50/30 dark:bg-yellow-950/10' : ''
      }`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            {/* Contact info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {/* VIP / Client icon */}
                {contact.is_client && contact.client_priority === 'vip' ? (
                  <Crown className="h-4 w-4 text-yellow-500 shrink-0" />
                ) : contact.is_vip ? (
                  <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 shrink-0" />
                ) : null}

                {/* Name */}
                <h3 className="font-medium truncate group-hover:text-primary transition-colors">
                  {contact.name || contact.email.split('@')[0]}
                </h3>

                {/* Client status badge */}
                {clientStatusBadge && (
                  <Badge variant={clientStatusBadge.variant} className="gap-1 text-xs shrink-0">
                    {clientStatusBadge.icon}
                    {clientStatusBadge.label}
                  </Badge>
                )}

                {/* Client priority badge (only show non-medium) */}
                {clientPriorityBadge && contact.client_priority !== 'medium' && (
                  <Badge variant={clientPriorityBadge.variant} className="text-xs shrink-0">
                    {clientPriorityBadge.label}
                  </Badge>
                )}

                {/* Sender type badge (newsletter vs contact) — hide for clients */}
                {!contact.is_client && (
                  <Badge className={`text-xs shrink-0 ${senderTypeConfig.color}`}>
                    <SenderTypeIcon className="h-3 w-3 mr-1" />
                    {senderTypeConfig.label}
                  </Badge>
                )}

                {/* Relationship badge (only show for direct contacts, non-client) */}
                {!contact.is_client && contact.sender_type === 'direct' && contact.relationship_type !== 'unknown' && (
                  <Badge className={`text-xs shrink-0 ${relationshipConfig.color}`}>
                    {relationshipConfig.label}
                  </Badge>
                )}

                {/* Muted indicator */}
                {contact.is_muted && (
                  <Badge variant="secondary" className="text-xs shrink-0">
                    <VolumeX className="h-3 w-3 mr-1" />
                    Muted
                  </Badge>
                )}
              </div>

              {/* Email */}
              <p className="text-sm text-muted-foreground truncate">{contact.email}</p>

              {/* Email domains (for clients) */}
              {contact.is_client && contact.email_domains && contact.email_domains.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {contact.email_domains.join(', ')}
                </p>
              )}

              {/* Company and job title */}
              {(contact.company || contact.job_title) && (
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  {contact.job_title && (
                    <span className="flex items-center gap-1">
                      <Briefcase className="h-3 w-3" />
                      {contact.job_title}
                    </span>
                  )}
                  {contact.company && (
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {contact.company}
                    </span>
                  )}
                </div>
              )}

              {/* Birthday indicator */}
              {contact.birthday && (
                <div className="flex items-center gap-1 mt-1 text-xs text-pink-600 dark:text-pink-400">
                  <Cake className="h-3 w-3" />
                  <span>
                    {(() => {
                      const parts = contact.birthday.split('-');
                      const month = new Date(`2000-${parts.length >= 2 ? parts[parts.length - 2] : '01'}-01`).toLocaleDateString('en-US', { month: 'short' });
                      const day = parts[parts.length - 1];
                      return `${month} ${parseInt(day, 10)}`;
                    })()}
                  </span>
                </div>
              )}

              {/* Notes preview */}
              {contact.notes && (
                <div className="flex items-start gap-1 mt-1">
                  <StickyNote className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground/80 line-clamp-1 italic">{contact.notes}</p>
                </div>
              )}

              {/* Stats row */}
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {contact.email_count} emails
                </span>
                {contact.sent_count > 0 && (
                  <span className="flex items-center gap-1" title={`${contact.sent_count} sent, ${contact.received_count} received`}>
                    <Send className="h-3 w-3" />
                    {contact.sent_count}
                    <InboxIcon className="h-3 w-3 ml-1" />
                    {contact.received_count}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatRelativeTime(contact.last_seen_at)}
                </span>
                {contact.avg_response_hours !== null && contact.avg_response_hours > 0 && (
                  <span className="flex items-center gap-1" title="Average response time">
                    ~{contact.avg_response_hours < 1
                      ? `${Math.round(contact.avg_response_hours * 60)}m`
                      : contact.avg_response_hours < 24
                        ? `${Math.round(contact.avg_response_hours)}h`
                        : `${Math.round(contact.avg_response_hours / 24)}d`
                    } reply
                  </span>
                )}
              </div>
            </div>

            {/* Action buttons - prevent card click propagation */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Promote to Client button (only for non-clients) */}
              {showPromoteButton && !contact.is_client && onPromoteToClient && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => onPromoteToClient(contact, e)}
                  title="Promote to Client"
                >
                  <Building2 className="h-4 w-4" />
                </Button>
              )}

              {/* VIP toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => onToggleVip(contact.id, e)}
                title={contact.is_vip ? 'Remove VIP' : 'Mark as VIP'}
                className={contact.is_vip ? 'text-yellow-500' : ''}
              >
                {contact.is_vip ? (
                  <Star className="h-4 w-4 fill-current" />
                ) : (
                  <StarOff className="h-4 w-4" />
                )}
              </Button>

              {/* Mute toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => onToggleMuted(contact.id, e)}
                title={contact.is_muted ? 'Unmute' : 'Mute'}
              >
                {contact.is_muted ? (
                  <Volume2 className="h-4 w-4" />
                ) : (
                  <VolumeX className="h-4 w-4" />
                )}
              </Button>

              {/* View indicator */}
              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * Loading skeleton for contact cards.
 */
function ContactCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-24" />
            <div className="flex gap-4 mt-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Empty state when no contacts match filters.
 * Provides helpful context and actions based on the current filter.
 */
function EmptyState({
  activeTab,
  activeSenderType,
  hasSearch,
  onSyncGoogle,
}: {
  activeTab: string;
  activeSenderType: SenderType;
  hasSearch?: boolean;
  onSyncGoogle?: () => void;
}) {
  // Sender type specific messages
  const senderTypeMessages: Record<SenderType, { title: string; description: string; icon: typeof Users }> = {
    direct: {
      title: 'No contacts yet',
      description: 'Real people who send you emails will appear here. Sync or process emails to get started.',
      icon: UserCircle,
    },
    broadcast: {
      title: 'No subscriptions detected',
      description: 'Newsletter and marketing senders will appear here as you receive their emails.',
      icon: Newspaper,
    },
    cold_outreach: {
      title: 'No cold outreach emails',
      description: 'Sales pitches, recruiters, and cold emails will be categorized here.',
      icon: Megaphone,
    },
    opportunity: {
      title: 'No opportunity sources',
      description: 'Mailing lists like HARO where you might want to respond will show up here.',
      icon: Target,
    },
    unknown: {
      title: 'Nothing uncategorized',
      description: 'All your senders have been classified. Nice work!',
      icon: CircleHelp,
    },
    all: {
      title: 'No contacts yet',
      description: 'Sync your Google contacts or process some emails to see your network here.',
      icon: Users,
    },
  };

  // Secondary filter messages override sender type messages
  const secondaryMessages: Record<string, { title: string; description: string; icon: typeof Users; action?: string }> = {
    vip: {
      title: 'No VIP contacts',
      description: 'Mark your most important contacts as VIP and they\'ll get priority in your inbox.',
      icon: Star,
    },
    muted: {
      title: 'No muted contacts',
      description: 'Mute contacts to hide their emails from your inbox. Great for newsletters!',
      icon: VolumeX,
    },
  };

  // Use search message if searching
  if (hasSearch) {
    return (
      <Card className="border-dashed border-2 bg-muted/5">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
            <Search className="h-7 w-7 text-muted-foreground" />
          </div>
          <CardTitle className="text-lg mb-2">No matches found</CardTitle>
          <CardDescription className="max-w-sm">
            Try a different search term or clear the filter.
          </CardDescription>
        </CardContent>
      </Card>
    );
  }

  // Use secondary filter message if not 'all'
  const config = activeTab !== 'all'
    ? secondaryMessages[activeTab] || senderTypeMessages[activeSenderType]
    : senderTypeMessages[activeSenderType];
  const Icon = config.icon;
  const showSyncAction = activeSenderType === 'all' || activeSenderType === 'direct';

  return (
    <Card className="border-dashed border-2 bg-muted/5">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
          <Icon className="h-7 w-7 text-muted-foreground" />
        </div>
        <CardTitle className="text-lg mb-2">{config.title}</CardTitle>
        <CardDescription className="max-w-sm">{config.description}</CardDescription>

        {showSyncAction && onSyncGoogle && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSyncGoogle}
            className="mt-4 gap-2"
          >
            <Sparkles className="h-4 w-4" />
            Import from Google
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Error banner component.
 */
function ErrorBanner({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  return (
    <Card className="mb-6 border-destructive/50 bg-destructive/5">
      <CardContent className="py-4">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <span className="font-medium">Failed to load contacts</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Try Again
        </Button>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Contacts Page - Lists and manages all contacts.
 *
 * Features:
 * - Tab filters: All | VIP | Muted
 * - Search by name or email
 * - Sort by email count, last seen, or name
 * - Page-based pagination
 * - Toggle VIP and muted status
 * - Click card to view contact detail page
 */
export default function ContactsPage() {
  // ─────────────────────────────────────────────────────────────────────────────
  // Router and URL State
  // ─────────────────────────────────────────────────────────────────────────────

  const router = useRouter();
  const searchParams = useSearchParams();

  // Get initial page from URL, default to 1
  const initialPage = React.useMemo(() => {
    const pageParam = searchParams.get('page');
    const parsed = pageParam ? parseInt(pageParam, 10) : 1;
    return isNaN(parsed) || parsed < 1 ? 1 : parsed;
  }, [searchParams]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Local State
  // ─────────────────────────────────────────────────────────────────────────────

  // Top-level tab: All, Clients, Personal, Subscriptions (NEW Phase 3)
  const activeContactsTab = getActiveContactsTab(searchParams);
  // Primary filter: sender type (Contacts vs Subscriptions)
  const [activeSenderType, setActiveSenderType] = React.useState<SenderType>('direct');
  // Secondary filter: VIP/Muted
  const [activeTab, setActiveTab] = React.useState<string>('all');
  const [searchValue, setSearchValue] = React.useState('');
  const [sortBy, setSortBy] = React.useState<string>('last_seen_at');

  // Promote to Client dialog state
  const [promoteDialogOpen, setPromoteDialogOpen] = React.useState(false);
  const [promoteTarget, setPromoteTarget] = React.useState<Contact | null>(null);

  // Debounce search to avoid excessive API calls
  const [debouncedSearch, setDebouncedSearch] = React.useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchValue);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchValue]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Build filter options based on active tab, sender type, and secondary tab
  // ─────────────────────────────────────────────────────────────────────────────

  const filterOptions = React.useMemo(() => {
    const tabFilter = FILTER_TABS.find((t) => t.id === activeTab)?.filter || {};

    // Base options
    const options: Record<string, unknown> = {
      ...tabFilter,
      search: debouncedSearch || undefined,
      sortBy: sortBy as 'email_count' | 'last_seen_at' | 'name',
      sortOrder: sortBy === 'name' ? 'asc' as const : 'desc' as const,
      page: initialPage,
      pageSize: PAGE_SIZE,
    };

    // ─── Apply top-level tab filters (NEW Phase 3) ─────────────────────────
    switch (activeContactsTab) {
      case 'clients':
        // Clients tab: show only is_client = TRUE
        options.isClient = true;
        break;
      case 'personal':
        // Personal tab: direct senders who are friends/family
        options.senderType = 'direct' as SenderType;
        break;
      case 'subscriptions':
        // Subscriptions tab: broadcast senders
        options.senderType = 'broadcast' as SenderType;
        break;
      case 'all':
      default:
        // All tab: keep existing sender type filter
        options.senderType = activeSenderType;
        break;
    }

    logger.debug('Filter options built', {
      contactsTab: activeContactsTab,
      senderType: options.senderType,
      isClient: options.isClient,
    });

    return options;
  }, [activeContactsTab, activeSenderType, activeTab, debouncedSearch, sortBy, initialPage]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch contacts using the hook
  // ─────────────────────────────────────────────────────────────────────────────

  const {
    contacts,
    isLoading,
    error,
    refetch,
    pagination,
    goToPage,
    stats,
    refreshStats,
    toggleVip,
    toggleMuted,
    promoteToClient,
  } = useContacts(filterOptions);

  // ─────────────────────────────────────────────────────────────────────────────
  // Handle page change - update URL and scroll to top
  // ─────────────────────────────────────────────────────────────────────────────

  const handlePageChange = React.useCallback((newPage: number) => {
    logger.info('Page changed', {
      from: pagination.page,
      to: newPage,
      totalPages: pagination.totalPages,
    });

    // Update URL with new page
    const url = new URL(window.location.href);
    if (newPage === 1) {
      url.searchParams.delete('page');
    } else {
      url.searchParams.set('page', newPage.toString());
    }
    router.push(url.pathname + url.search, { scroll: false });

    // Navigate to the new page
    goToPage(newPage);

    // Scroll to top of list
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [router, goToPage, pagination.page, pagination.totalPages]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Handle sync completion - refresh both contacts and stats
  // ─────────────────────────────────────────────────────────────────────────────

  const handleSyncComplete = React.useCallback(() => {
    logger.info('Google sync complete, refreshing data');
    refetch();
    refreshStats();
  }, [refetch, refreshStats]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Event Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const handleSenderTypeChange = (type: SenderType) => {
    logger.debug('Sender type changed', { from: activeSenderType, to: type });
    setActiveSenderType(type);
    // Reset secondary tab when changing sender type
    setActiveTab('all');
    // Reset to page 1
    if (pagination.page !== 1) {
      handlePageChange(1);
    }
  };

  /**
   * Handle top-level tab change (All/Clients/Personal/Subscriptions).
   * Resets secondary filters and page when switching tabs.
   */
  const handleContactsTabChange = React.useCallback((tab: ContactsTab) => {
    logger.info('Contacts tab changed', { to: tab });
    // Reset secondary filters when changing top-level tab
    setActiveTab('all');
    setActiveSenderType('direct');
    // Page reset is handled by ContactsTabs via URL param
  }, []);

  /**
   * Open the Promote to Client dialog for a contact.
   */
  const handlePromoteToClient = React.useCallback((contact: Contact, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    logger.info('Opening promote dialog', {
      contactId: contact.id.substring(0, 8),
      name: contact.name,
    });
    setPromoteTarget(contact);
    setPromoteDialogOpen(true);
  }, []);

  /**
   * Handle the promote action from the dialog.
   */
  const handlePromoteSubmit = React.useCallback(async (contactId: string, data: PromoteToClientData) => {
    logger.start('Promoting contact to client', { contactId: contactId.substring(0, 8) });
    await promoteToClient(contactId, data);
    refetch();
  }, [promoteToClient, refetch]);

  const handleTabChange = (tab: string) => {
    logger.debug('Tab changed', { from: activeTab, to: tab });
    setActiveTab(tab);
    // Reset to page 1 when changing tabs (URL will be updated by the hook)
    if (pagination.page !== 1) {
      handlePageChange(1);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
  };

  const handleSortChange = (value: string) => {
    logger.debug('Sort changed', { from: sortBy, to: value });
    setSortBy(value);
  };

  /**
   * Handle VIP toggle - prevents card navigation when clicking the button.
   */
  const handleToggleVip = async (contactId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    logger.start('Toggle VIP', { contactId: contactId.substring(0, 8) });
    await toggleVip(contactId);
  };

  /**
   * Handle muted toggle - prevents card navigation when clicking the button.
   */
  const handleToggleMuted = async (contactId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    logger.start('Toggle muted', { contactId: contactId.substring(0, 8) });
    await toggleMuted(contactId);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Sync handler for empty state
  // ─────────────────────────────────────────────────────────────────────────────

  const handleSyncFromEmptyState = () => {
    // Trigger the sync button programmatically
    const syncButton = document.querySelector('[data-sync-button]') as HTMLButtonElement;
    if (syncButton) {
      syncButton.click();
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page Header */}
      <PageHeader
        title="Contacts"
        description="Your network, organized. Filter between real contacts and subscriptions."
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Contacts' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <SyncContactsButton
              onSyncComplete={handleSyncComplete}
              variant="default"
            />
            <HistoricalSyncButton
              onSyncComplete={handleSyncComplete}
              variant="default"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
              title="Refresh contact list"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        }
      />

      {/* Error Banner */}
      {error && <ErrorBanner error={error} onRetry={refetch} />}

      {/* Last sync indicator */}
      {stats.lastGoogleSync && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
          <Clock className="h-3 w-3" />
          <span>
            Google synced {formatRelativeTime(stats.lastGoogleSync)}
          </span>
        </div>
      )}

      {/* Stats Cards - always show but with loading state */}
      <StatsCards stats={stats} isLoading={isLoading} />

      {/* ─── Top-Level Tabs (NEW Phase 3) ────────────────────────────────── */}
      <ContactsTabs
        onTabChange={handleContactsTabChange}
        stats={{
          total: stats.total,
          clients: stats.clients,
          personal: stats.bySenderType?.direct ?? 0,
          subscriptions: stats.bySenderType?.broadcast ?? 0,
        }}
      />

      {/* Sender Type Tabs (only show on "All" tab) */}
      {activeContactsTab === 'all' && (
        <SenderTypeTabs
          activeType={activeSenderType}
          onTypeChange={handleSenderTypeChange}
          stats={stats}
          isLoading={isLoading}
        />
      )}

      {/* Secondary Filters (VIP/Muted) and Search */}
      <ContactFilters
        activeTab={activeTab}
        onTabChange={handleTabChange}
        searchValue={searchValue}
        onSearchChange={handleSearchChange}
        sortBy={sortBy}
        onSortChange={handleSortChange}
      />

      {/* Contact List */}
      <div className="space-y-3">
        {isLoading ? (
          // Loading skeletons
          <>
            <ContactCardSkeleton />
            <ContactCardSkeleton />
            <ContactCardSkeleton />
            <ContactCardSkeleton />
            <ContactCardSkeleton />
          </>
        ) : contacts.length === 0 ? (
          // Empty state with context-aware messaging
          <EmptyState
            activeTab={activeTab}
            activeSenderType={activeSenderType}
            hasSearch={!!debouncedSearch}
            onSyncGoogle={handleSyncFromEmptyState}
          />
        ) : (
          // Contact cards with pagination
          <>
            {contacts.map((contact) => (
              <ContactCard
                key={contact.id}
                contact={contact}
                onToggleVip={handleToggleVip}
                onToggleMuted={handleToggleMuted}
                onPromoteToClient={handlePromoteToClient}
                showPromoteButton={activeContactsTab === 'all' || activeContactsTab === 'personal'}
              />
            ))}

            {/* Pagination */}
            <div className="pt-6 pb-8">
              <Pagination
                currentPage={pagination.page}
                totalPages={pagination.totalPages}
                totalItems={pagination.totalCount}
                pageSize={pagination.pageSize}
                onPageChange={handlePageChange}
                showInfo
              />
            </div>
          </>
        )}
      </div>

      {/* ─── Promote to Client Dialog ─────────────────────────────────────── */}
      {promoteTarget && (
        <PromoteToClientDialog
          open={promoteDialogOpen}
          onOpenChange={setPromoteDialogOpen}
          contactId={promoteTarget.id}
          contactName={promoteTarget.name}
          onPromote={handlePromoteSubmit}
        />
      )}
    </div>
  );
}
