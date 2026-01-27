/**
 * 📑 Sidebar Component for IdeaBox
 *
 * The main navigation sidebar that appears on the left side of authenticated pages.
 * Contains navigation links, email category filters, upcoming events preview, and
 * client quick-access list.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Collapsible on mobile (controlled by parent)
 * - Navigation links with active state indication
 * - Email category quick filters with counts
 * - Upcoming Events preview section with compact cards (P6 Enhancement, Jan 2026)
 * - Client list for quick access to client-filtered views
 * - Keyboard navigation support
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 * ```tsx
 * import { Sidebar } from '@/components/layout';
 *
 * <Sidebar
 *   currentPath="/inbox"
 *   categoryCounts={{ action_required: 5, newsletter: 12 }}
 *   clients={[{ id: '1', name: 'Acme Corp' }]}
 *   isOpen={sidebarOpen}
 *   onClose={() => setSidebarOpen(false)}
 * />
 * ```
 *
 * @module components/layout/Sidebar
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Inbox,
  CheckSquare,
  Users,
  Settings,
  Archive,
  X,
  ChevronRight,
  AlertCircle,
  Calendar,
  Newspaper,
  Tag,
  Building2,
  Sparkles,
  Target,
  // ─── Email Intelligence P6 icons ───────────────────────────────────────────
  BookUser,      // Contacts page - represents address book / contact management
  CalendarDays,  // Timeline page - represents date-based timeline view
  // ─── Events Page Enhancement (Jan 2026) ────────────────────────────────────
  CalendarCheck, // For event cards in sidebar
  // ─── Gmail Campaign Management (Jan 2026) ──────────────────────────────────
  Send,          // Campaigns page - represents email outreach campaigns
  FileText,      // Templates page - represents email template management
} from 'lucide-react';

import { createLogger } from '@/lib/utils/logger';

import { cn } from '@/lib/utils/cn';
import { Button, Badge, Card, CardContent } from '@/components/ui';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('Sidebar');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Email category for filtering.
 * Matches the categories defined in the analyzer system.
 */
export type EmailCategory =
  | 'action_required'
  | 'event'
  | 'newsletter'
  | 'promo'
  | 'admin'
  | 'personal'
  | 'noise';

/**
 * Category counts for sidebar badges.
 */
export type CategoryCounts = Partial<Record<EmailCategory, number>>;

/**
 * Simplified client data for sidebar display.
 */
export interface SidebarClient {
  /** Unique client identifier */
  id: string;
  /** Client display name */
  name: string;
  /** Number of unread/unprocessed emails (optional) */
  unreadCount?: number;
}

/**
 * Individual event data for sidebar preview cards.
 * Minimal data needed for compact display.
 *
 * @since January 2026 (Events Page Enhancement)
 */
export interface UpcomingEvent {
  /** Unique event identifier */
  id: string;
  /** Event title */
  title: string;
  /** Event date (YYYY-MM-DD format) */
  date: string;
  /** Event time (HH:MM format, optional) */
  time?: string;
  /** Days until event (0 = today, 1 = tomorrow, etc.) */
  daysUntil: number;
}

/**
 * Upcoming events summary for sidebar display.
 * Enhanced in January 2026 to include preview events for sidebar cards.
 */
export interface UpcomingEventsSummary {
  /** Total count of upcoming events */
  count: number;
  /** Next upcoming event date (ISO string) */
  nextEventDate?: string;
  /** Days until next event */
  daysUntilNext?: number;
  /** Preview events for sidebar cards (max 3) */
  previewEvents?: UpcomingEvent[];
}

/**
 * Props for the Sidebar component.
 */
export interface SidebarProps {
  /** Current pathname for active state (auto-detected if not provided) */
  currentPath?: string;
  /** Email counts per category for badges */
  categoryCounts?: CategoryCounts;
  /** List of clients for quick access */
  clients?: SidebarClient[];
  /** Upcoming events summary for display */
  upcomingEvents?: UpcomingEventsSummary;
  /** Whether sidebar is open (mobile only) */
  isOpen?: boolean;
  /** Callback to close sidebar (mobile only) */
  onClose?: () => void;
  /** Additional CSS classes */
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NAVIGATION CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main navigation items configuration.
 * Each item defines a route, icon, and display properties.
 */
interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: 'count' | 'dot';
  countKey?: keyof CategoryCounts;
}

const mainNavItems: NavItem[] = [
  {
    label: 'Hub',
    href: '/hub',
    icon: Target,
  },
  {
    label: 'Discover',
    href: '/discover',
    icon: Sparkles,
  },
  {
    label: 'Inbox',
    href: '/inbox',
    icon: Inbox,
  },
  {
    label: 'Actions',
    href: '/actions',
    icon: CheckSquare,
    badge: 'count',
    countKey: 'action_required',
  },
  {
    label: 'Clients',
    href: '/clients',
    icon: Users,
  },
  // ─────────────────────────────────────────────────────────────────────────────
  // Gmail Campaign Management: January 2026
  // Campaign builder and template management for bulk email outreach.
  // ─────────────────────────────────────────────────────────────────────────────
  {
    label: 'Campaigns',
    href: '/campaigns',
    icon: Send,
  },
  {
    label: 'Templates',
    href: '/templates',
    icon: FileText,
  },
  // ─────────────────────────────────────────────────────────────────────────────
  // Email Intelligence P6: Contact & Timeline Navigation
  // Added: January 2026
  // These pages surface the contact intelligence and extracted dates features.
  // ─────────────────────────────────────────────────────────────────────────────
  {
    label: 'Contacts',
    href: '/contacts',
    icon: BookUser,
  },
  {
    label: 'Timeline',
    href: '/timeline',
    icon: CalendarDays,
  },
  // ─────────────────────────────────────────────────────────────────────────────
  // Events Page Enhancement: January 2026
  // Dedicated events page with friendly event cards, separate from Timeline.
  // Events are detected via the `has_event` label since the Jan 2026 refactor.
  // ─────────────────────────────────────────────────────────────────────────────
  {
    label: 'Events',
    href: '/events',
    icon: Calendar,
  },
  // ─────────────────────────────────────────────────────────────────────────────
  {
    label: 'Archive',
    href: '/archive',
    icon: Archive,
  },
];

/**
 * Category filter items for quick inbox filtering.
 *
 * Note: Events was removed from this list in January 2026 as it now has a
 * dedicated /events page. Events are detected via the `has_event` label
 * rather than being a primary category.
 */
interface CategoryItem {
  label: string;
  category: EmailCategory;
  icon: React.ElementType;
  color: string;
}

const categoryItems: CategoryItem[] = [
  {
    label: 'Action Required',
    category: 'action_required',
    icon: AlertCircle,
    color: 'text-red-500',
  },
  // Note: Events moved to dedicated /events page and main nav (Jan 2026)
  {
    label: 'Newsletters',
    category: 'newsletter',
    icon: Newspaper,
    color: 'text-blue-500',
  },
  {
    label: 'Promo',
    category: 'promo',
    icon: Tag,
    color: 'text-orange-500',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Section header with optional collapsible behavior.
 */
function SidebarSection({
  title,
  children,
  defaultExpanded = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);

  return (
    <div className="py-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
      >
        {title}
        <ChevronRight
          className={cn(
            'h-3 w-3 transition-transform duration-200',
            isExpanded && 'rotate-90'
          )}
        />
      </button>
      {isExpanded && <div className="mt-1 space-y-0.5">{children}</div>}
    </div>
  );
}

/**
 * Individual navigation link item.
 */
function NavLink({
  href,
  icon: Icon,
  label,
  isActive,
  count,
  onClick,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  isActive: boolean;
  count?: number;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-xs">
          {count > 99 ? '99+' : count}
        </Badge>
      )}
    </Link>
  );
}

/**
 * Category filter link item with colored icon.
 */
function CategoryLink({
  href,
  icon: Icon,
  label,
  isActive,
  count,
  iconColor,
  onClick,
  subtitle,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  isActive: boolean;
  count?: number;
  iconColor: string;
  onClick?: () => void;
  subtitle?: string;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      )}
    >
      <Icon className={cn('h-4 w-4 flex-shrink-0', iconColor)} />
      <div className="flex-1 min-w-0">
        <span className="truncate block">{label}</span>
        {subtitle && (
          <span className="text-xs text-green-600 dark:text-green-400 truncate block">
            {subtitle}
          </span>
        )}
      </div>
      {count !== undefined && count > 0 && (
        <span className="text-xs text-muted-foreground">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}

/**
 * Client quick-access link.
 */
function ClientLink({
  client,
  isActive,
  onClick,
}: {
  client: SidebarClient;
  isActive: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={`/clients/${client.id}`}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      )}
    >
      <Building2 className="h-4 w-4 flex-shrink-0 text-teal-500" />
      <span className="flex-1 truncate">{client.name}</span>
      {client.unreadCount !== undefined && client.unreadCount > 0 && (
        <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-xs">
          {client.unreadCount}
        </Badge>
      )}
    </Link>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// UPCOMING EVENTS PREVIEW (P6 Enhancement - January 2026)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compact event card for sidebar preview.
 * Shows minimal info: title, date indicator, and click action.
 *
 * This component provides a quick glance at upcoming events directly in the
 * sidebar, eliminating the need to navigate to the Events page for basic info.
 *
 * @since January 2026
 */
function CompactEventCard({
  event,
  onClick,
}: {
  event: UpcomingEvent;
  onClick?: () => void;
}) {
  const isToday = event.daysUntil === 0;
  const isTomorrow = event.daysUntil === 1;

  logger.debug('Rendering CompactEventCard', {
    eventId: event.id.substring(0, 8),
    title: event.title,
    daysUntil: event.daysUntil,
  });

  return (
    <Link href={`/events?highlight=${event.id}`} onClick={onClick}>
      <Card
        className={cn(
          'cursor-pointer transition-all hover:shadow-sm hover:border-green-300 dark:hover:border-green-700',
          isToday && 'border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/20'
        )}
      >
        <CardContent className="p-2.5">
          <div className="flex items-center gap-2">
            {/* Calendar icon with color based on urgency */}
            <CalendarCheck
              className={cn(
                'h-3.5 w-3.5 shrink-0',
                isToday
                  ? 'text-green-600 dark:text-green-400'
                  : isTomorrow
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-muted-foreground'
              )}
            />

            <div className="flex-1 min-w-0">
              {/* Event title - truncated */}
              <p className="text-xs font-medium truncate">{event.title}</p>

              {/* Date indicator */}
              <p className="text-[10px] text-muted-foreground">
                {isToday ? (
                  <span className="text-green-600 dark:text-green-400 font-medium">Today</span>
                ) : isTomorrow ? (
                  <span className="text-blue-600 dark:text-blue-400 font-medium">Tomorrow</span>
                ) : event.daysUntil <= 7 ? (
                  `In ${event.daysUntil} days`
                ) : (
                  event.date
                )}
                {event.time && <span className="ml-1">at {event.time}</span>}
              </p>
            </div>

            {/* Chevron */}
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * Upcoming events preview section.
 * Displays up to 3 compact event cards in the sidebar.
 *
 * This section provides at-a-glance visibility into upcoming events without
 * requiring navigation to the Events page. Helps users stay on top of their
 * schedule while working in other parts of the app.
 *
 * @since January 2026
 */
function UpcomingEventsPreview({
  events,
  onEventClick,
}: {
  events: UpcomingEvent[];
  onEventClick?: () => void;
}) {
  if (!events || events.length === 0) {
    logger.debug('No preview events to display');
    return null;
  }

  logger.debug('Rendering UpcomingEventsPreview', { eventCount: events.length });

  return (
    <SidebarSection title="Upcoming Events">
      <div className="space-y-1.5 px-2">
        {events.slice(0, 3).map((event) => (
          <CompactEventCard
            key={event.id}
            event={event}
            onClick={onEventClick}
          />
        ))}

        {/* View all link */}
        <Link
          href="/events"
          onClick={onEventClick}
          className="flex items-center justify-center gap-1 rounded-md py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View all events
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </SidebarSection>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main sidebar navigation component.
 *
 * Provides hierarchical navigation with:
 * - Main navigation (Hub, Inbox, Actions, Events, Clients, Contacts, Timeline, Archive)
 * - Category quick filters (Action Required, Newsletters, Promo)
 * - Upcoming Events preview cards (P6 Enhancement - January 2026)
 * - Client quick-access list
 *
 * On mobile, renders as an overlay that can be toggled open/closed.
 * On desktop, renders as a fixed sidebar.
 *
 * @example
 * ```tsx
 * const [sidebarOpen, setSidebarOpen] = useState(false);
 *
 * <Sidebar
 *   categoryCounts={{
 *     action_required: 5,
 *     newsletter: 12,
 *   }}
 *   clients={[
 *     { id: '1', name: 'Acme Corp', unreadCount: 2 },
 *     { id: '2', name: 'StartupXYZ' },
 *   ]}
 *   upcomingEvents={{
 *     count: 3,
 *     daysUntilNext: 0,
 *     previewEvents: [
 *       { id: '1', title: 'Team Standup', date: '2026-01-21', daysUntil: 0 },
 *       { id: '2', title: 'Design Review', date: '2026-01-22', daysUntil: 1 },
 *     ],
 *   }}
 *   isOpen={sidebarOpen}
 *   onClose={() => setSidebarOpen(false)}
 * />
 * ```
 */
export function Sidebar({
  currentPath,
  categoryCounts = {},
  clients = [],
  upcomingEvents,
  isOpen = false,
  onClose,
  className,
}: SidebarProps) {
  // Auto-detect current path if not provided
  const pathname = usePathname();
  const activePath = currentPath || pathname;

  /**
   * Check if a path is currently active.
   * Supports both exact matches and prefix matches for nested routes.
   */
  const isActivePath = (href: string): boolean => {
    if (href === '/inbox') {
      // Inbox is active for /inbox and /inbox?category=...
      return activePath === '/inbox' || activePath.startsWith('/inbox?');
    }
    return activePath === href || activePath.startsWith(`${href}/`);
  };

  /**
   * Handle link click - close mobile sidebar after navigation.
   */
  const handleLinkClick = () => {
    if (onClose) {
      onClose();
    }
  };

  // Sidebar content (shared between mobile and desktop)
  const sidebarContent = (
    <>
      {/* Main Navigation */}
      <nav className="px-2 py-4 space-y-1">
        {mainNavItems.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={item.label}
            isActive={isActivePath(item.href)}
            count={item.countKey ? categoryCounts[item.countKey] : undefined}
            onClick={handleLinkClick}
          />
        ))}
      </nav>

      {/* Category Filters */}
      <SidebarSection title="Categories">
        {categoryItems.map((item) => (
          <CategoryLink
            key={item.category}
            href={`/inbox?category=${item.category}`}
            icon={item.icon}
            label={item.label}
            isActive={activePath === `/inbox?category=${item.category}`}
            count={categoryCounts[item.category]}
            iconColor={item.color}
            onClick={handleLinkClick}
          />
        ))}
      </SidebarSection>

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* Upcoming Events Preview (P6 Enhancement - January 2026) */}
      {/* Shows compact event cards for quick visibility into upcoming events */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {upcomingEvents?.previewEvents && upcomingEvents.previewEvents.length > 0 && (
        <UpcomingEventsPreview
          events={upcomingEvents.previewEvents}
          onEventClick={handleLinkClick}
        />
      )}

      {/* Clients */}
      {clients.length > 0 && (
        <SidebarSection title="Clients">
          {clients.slice(0, 5).map((client) => (
            <ClientLink
              key={client.id}
              client={client}
              isActive={isActivePath(`/clients/${client.id}`)}
              onClick={handleLinkClick}
            />
          ))}
          {clients.length > 5 && (
            <Link
              href="/clients"
              onClick={handleLinkClick}
              className="flex items-center gap-3 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              View all {clients.length} clients...
            </Link>
          )}
        </SidebarSection>
      )}

      {/* Settings Link (bottom) */}
      <div className="mt-auto border-t px-2 py-4">
        <NavLink
          href="/settings"
          icon={Settings}
          label="Settings"
          isActive={isActivePath('/settings')}
          onClick={handleLinkClick}
        />
      </div>
    </>
  );

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          // Base styles
          'flex flex-col h-[calc(100vh-3.5rem)] bg-background border-r',
          // Mobile: fixed overlay
          'fixed left-0 top-14 z-40 w-64 transform transition-transform duration-200 ease-in-out md:transform-none',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop: static
          'md:static md:translate-x-0',
          className
        )}
      >
        {/* Mobile close button */}
        <div className="flex items-center justify-between px-4 py-2 border-b md:hidden">
          <span className="font-semibold">Menu</span>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {sidebarContent}
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
