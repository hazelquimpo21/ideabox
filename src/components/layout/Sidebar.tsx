/**
 * 📑 Sidebar Component for IdeaBox
 *
 * The main navigation sidebar that appears on the left side of authenticated pages.
 * Contains navigation links, email category filters, and client quick-access list.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Collapsible on mobile (controlled by parent)
 * - Navigation links with active state indication
 * - Email category quick filters with counts
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
} from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { Button, Badge } from '@/components/ui';

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
 * Upcoming events summary for sidebar display.
 */
export interface UpcomingEventsSummary {
  /** Total count of upcoming events */
  count: number;
  /** Next upcoming event date (ISO string) */
  nextEventDate?: string;
  /** Days until next event */
  daysUntilNext?: number;
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
  {
    label: 'Archive',
    href: '/archive',
    icon: Archive,
  },
];

/**
 * Category filter items for quick inbox filtering.
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
  {
    label: 'Events',
    category: 'event',
    icon: Calendar,
    color: 'text-purple-500',
  },
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
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main sidebar navigation component.
 *
 * Provides hierarchical navigation with:
 * - Main navigation (Inbox, Actions, Clients, Archive)
 * - Category quick filters
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
 *     event: 3,
 *     newsletter: 12,
 *   }}
 *   clients={[
 *     { id: '1', name: 'Acme Corp', unreadCount: 2 },
 *     { id: '2', name: 'StartupXYZ' },
 *   ]}
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
        {categoryItems.map((item) => {
          // Generate subtitle for Events category based on upcoming events
          let subtitle: string | undefined;
          if (item.category === 'event' && upcomingEvents && upcomingEvents.count > 0) {
            if (upcomingEvents.daysUntilNext === 0) {
              subtitle = 'Event today!';
            } else if (upcomingEvents.daysUntilNext === 1) {
              subtitle = 'Next: tomorrow';
            } else if (upcomingEvents.daysUntilNext !== undefined && upcomingEvents.daysUntilNext <= 7) {
              subtitle = `Next: in ${upcomingEvents.daysUntilNext} days`;
            } else if (upcomingEvents.count > 0) {
              subtitle = `${upcomingEvents.count} upcoming`;
            }
          }

          return (
            <CategoryLink
              key={item.category}
              href={`/inbox?category=${item.category}`}
              icon={item.icon}
              label={item.label}
              isActive={activePath === `/inbox?category=${item.category}`}
              count={categoryCounts[item.category]}
              iconColor={item.color}
              onClick={handleLinkClick}
              subtitle={subtitle}
            />
          );
        })}
      </SidebarSection>

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
