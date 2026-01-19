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
 * - Mark contacts as VIP for priority handling
 * - Mute contacts to hide their emails
 * - View emails from a specific contact
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 * Route: /contacts
 * Protected: Yes (requires authentication)
 *
 * @module app/(auth)/contacts/page
 * @version 1.0.0
 * @since January 2026
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  Input,
  Skeleton,
} from '@/components/ui';
import { useContacts } from '@/hooks/useContacts';
import type { Contact, ContactRelationshipType, ContactStats } from '@/hooks/useContacts';
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
  UserPlus,
  Filter,
  ArrowUpDown,
  ChevronDown,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('ContactsPage');

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Filter tabs for the contacts list.
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
 */
function StatsCards({ stats }: { stats: ContactStats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-2xl font-bold">{stats.total}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Total Contacts</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-yellow-500" />
            <span className="text-2xl font-bold">{stats.vip}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">VIP Contacts</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-blue-500" />
            <span className="text-2xl font-bold">{stats.clients}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Clients</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <VolumeX className="h-4 w-4 text-gray-500" />
            <span className="text-2xl font-bold">{stats.muted}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Muted</p>
        </CardContent>
      </Card>
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
 */
function ContactCard({
  contact,
  onToggleVip,
  onToggleMuted,
}: {
  contact: Contact;
  onToggleVip: (id: string) => void;
  onToggleMuted: (id: string) => void;
}) {
  const relationshipConfig = RELATIONSHIP_CONFIG[contact.relationship_type] || RELATIONSHIP_CONFIG.unknown;

  return (
    <Card className="hover:bg-muted/50 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Contact info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {/* VIP indicator */}
              {contact.is_vip && (
                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 shrink-0" />
              )}

              {/* Name */}
              <h3 className="font-medium truncate">
                {contact.name || contact.email.split('@')[0]}
              </h3>

              {/* Relationship badge */}
              <Badge className={`text-xs shrink-0 ${relationshipConfig.color}`}>
                {relationshipConfig.label}
              </Badge>

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

            {/* Stats row */}
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {contact.email_count} emails
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatRelativeTime(contact.last_seen_at)}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* View emails button */}
            <Link href={`/inbox?sender=${encodeURIComponent(contact.email)}`}>
              <Button variant="outline" size="sm" className="gap-1">
                <Mail className="h-3 w-3" />
                Emails
              </Button>
            </Link>

            {/* VIP toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onToggleVip(contact.id)}
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
              onClick={() => onToggleMuted(contact.id)}
              title={contact.is_muted ? 'Unmute' : 'Mute'}
            >
              {contact.is_muted ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
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
            <Skeleton className="h-8 w-20" />
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
 */
function EmptyState({ activeTab }: { activeTab: string }) {
  const messages: Record<string, { title: string; description: string }> = {
    all: {
      title: 'No contacts yet',
      description: 'Contacts will appear here as you receive and process emails.',
    },
    vip: {
      title: 'No VIP contacts',
      description: 'Mark important contacts as VIP to see them here.',
    },
    muted: {
      title: 'No muted contacts',
      description: 'Muted contacts will appear here.',
    },
  };

  const { title, description } = messages[activeTab] || messages.all;

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <Users className="h-6 w-6 text-muted-foreground" />
        </div>
        <CardTitle className="text-lg mb-2">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
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
 * - Toggle VIP and muted status
 * - Link to view emails from each contact
 */
export default function ContactsPage() {
  // ─────────────────────────────────────────────────────────────────────────────
  // Local State
  // ─────────────────────────────────────────────────────────────────────────────

  const [activeTab, setActiveTab] = React.useState<string>('all');
  const [searchValue, setSearchValue] = React.useState('');
  const [sortBy, setSortBy] = React.useState<string>('last_seen_at');

  // Debounce search to avoid excessive API calls
  const [debouncedSearch, setDebouncedSearch] = React.useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchValue);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchValue]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Build filter options based on active tab
  // ─────────────────────────────────────────────────────────────────────────────

  const filterOptions = React.useMemo(() => {
    const tabFilter = FILTER_TABS.find((t) => t.id === activeTab)?.filter || {};
    return {
      ...tabFilter,
      search: debouncedSearch || undefined,
      sortBy: sortBy as 'email_count' | 'last_seen_at' | 'name',
      sortOrder: sortBy === 'name' ? 'asc' as const : 'desc' as const,
    };
  }, [activeTab, debouncedSearch, sortBy]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch contacts using the hook
  // ─────────────────────────────────────────────────────────────────────────────

  const {
    contacts,
    isLoading,
    error,
    refetch,
    loadMore,
    hasMore,
    stats,
    toggleVip,
    toggleMuted,
  } = useContacts(filterOptions);

  // ─────────────────────────────────────────────────────────────────────────────
  // Event Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const handleTabChange = (tab: string) => {
    logger.debug('Tab changed', { from: activeTab, to: tab });
    setActiveTab(tab);
  };

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
  };

  const handleSortChange = (value: string) => {
    logger.debug('Sort changed', { from: sortBy, to: value });
    setSortBy(value);
  };

  const handleToggleVip = async (contactId: string) => {
    logger.start('Toggle VIP', { contactId: contactId.substring(0, 8) });
    await toggleVip(contactId);
  };

  const handleToggleMuted = async (contactId: string) => {
    logger.start('Toggle muted', { contactId: contactId.substring(0, 8) });
    await toggleMuted(contactId);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page Header */}
      <PageHeader
        title="Contacts"
        description="People you've exchanged emails with, automatically organized."
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Contacts' },
        ]}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      {/* Error Banner */}
      {error && <ErrorBanner error={error} onRetry={refetch} />}

      {/* Stats Cards */}
      {!isLoading && <StatsCards stats={stats} />}

      {/* Filters */}
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
          // Empty state
          <EmptyState activeTab={activeTab} />
        ) : (
          // Contact cards
          <>
            {contacts.map((contact) => (
              <ContactCard
                key={contact.id}
                contact={contact}
                onToggleVip={handleToggleVip}
                onToggleMuted={handleToggleMuted}
              />
            ))}

            {/* Load More Button */}
            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button variant="outline" onClick={loadMore} className="gap-2">
                  Load More
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
