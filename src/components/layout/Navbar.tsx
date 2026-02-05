/**
 * 🧭 Navbar Component for IdeaBox
 *
 * The main navigation bar that appears at the top of every authenticated page.
 * Contains the app logo, search functionality, and user menu.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Responsive design (collapses gracefully on mobile)
 * - Global search input with keyboard shortcut (Cmd/Ctrl + K)
 * - User dropdown menu with profile, settings, and logout
 * - Sync status indicator showing last email sync time
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 * ```tsx
 * import { Navbar } from '@/components/layout';
 *
 * // In your layout:
 * <Navbar user={currentUser} onSearch={handleSearch} />
 * ```
 *
 * @module components/layout/Navbar
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Search,
  Settings,
  LogOut,
  User,
  RefreshCw,
  ChevronDown,
  Menu,
  Mail,
} from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * User information displayed in the navbar.
 * Minimal set of fields needed for display purposes.
 */
export interface NavbarUser {
  /** User's unique identifier */
  id: string;
  /** User's display name (falls back to email if not set) */
  name?: string | null;
  /** User's email address */
  email: string;
  /** URL to user's avatar image */
  avatarUrl?: string | null;
}

/**
 * Sync status information for the indicator.
 */
export interface SyncStatus {
  /** Whether a sync is currently in progress */
  isSyncing: boolean;
  /** Timestamp of the last successful sync (can be Date object or ISO string) */
  lastSyncAt?: Date | string | null;
  /** Number of emails processed in last sync */
  emailsProcessed?: number;
}

/**
 * Props for the Navbar component.
 */
export interface NavbarProps {
  /** Currently authenticated user (null if not logged in) */
  user?: NavbarUser | null;
  /** Current sync status */
  syncStatus?: SyncStatus;
  /** Callback when user triggers a search */
  onSearch?: (query: string) => void;
  /** Callback when user requests manual sync */
  onSync?: () => void;
  /** Callback when user logs out */
  onLogout?: () => void;
  /** Callback to toggle mobile sidebar */
  onMenuToggle?: () => void;
  /** Additional CSS classes */
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * App logo and brand name.
 * Links back to Discover (the main dashboard view).
 */
function NavbarLogo() {
  return (
    <Link
      href="/discover"
      className="flex items-center gap-2 font-semibold text-foreground hover:text-foreground/80 transition-colors"
    >
      <Mail className="h-6 w-6 text-primary" />
      <span className="text-lg hidden sm:inline">IdeaBox</span>
    </Link>
  );
}

/**
 * Global search input with keyboard shortcut hint.
 * Opens a command palette dialog for advanced search.
 */
function NavbarSearch({
  onSearch,
}: {
  onSearch?: (query: string) => void;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Handle keyboard shortcut (Cmd/Ctrl + K)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus input when dialog opens
  React.useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && onSearch) {
      onSearch(query.trim());
      setIsOpen(false);
      setQuery('');
    }
  };

  return (
    <>
      {/* Search trigger button */}
      <Button
        variant="outline"
        className="relative h-9 w-9 sm:w-64 sm:justify-start sm:px-3 text-muted-foreground"
        onClick={() => setIsOpen(true)}
      >
        <Search className="h-4 w-4 sm:mr-2" />
        <span className="hidden sm:inline-flex">Search emails...</span>
        <kbd className="pointer-events-none absolute right-2 top-2 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      {/* Search dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[500px] p-0">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="text-lg">Search Emails</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="px-4 pb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by subject, sender, or content..."
                className="pl-9"
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Press Enter to search or Escape to close
            </p>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Sync status indicator showing sync progress and last sync time.
 */
function SyncIndicator({
  status,
  onSync,
}: {
  status?: SyncStatus;
  onSync?: () => void;
}) {
  const formatLastSync = (date: Date | string): string => {
    const now = new Date();
    const dateObj = date instanceof Date ? date : new Date(date);
    const diffMs = now.getTime() - dateObj.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    return dateObj.toLocaleDateString();
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onSync}
      disabled={status?.isSyncing}
      className="text-muted-foreground hover:text-foreground"
      title={status?.lastSyncAt ? `Last sync: ${formatLastSync(status.lastSyncAt)}` : 'Sync emails'}
    >
      <RefreshCw
        className={cn(
          'h-4 w-4',
          status?.isSyncing && 'animate-spin'
        )}
      />
      <span className="ml-2 hidden md:inline text-xs">
        {status?.isSyncing
          ? 'Syncing...'
          : status?.lastSyncAt
            ? formatLastSync(status.lastSyncAt)
            : 'Sync'}
      </span>
    </Button>
  );
}

/**
 * User dropdown menu with profile, settings, and logout options.
 */
function UserMenu({
  user,
  onLogout,
}: {
  user: NavbarUser;
  onLogout?: () => void;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  React.useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Get initials for avatar fallback
  const initials = user.name
    ? user.name.split(' ').filter(n => n.length > 0).map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user.email[0]?.toUpperCase() ?? 'U';

  return (
    <div className="relative" ref={menuRef}>
      {/* User button */}
      <Button
        variant="ghost"
        className="flex items-center gap-2 px-2"
        onClick={() => setIsOpen(!isOpen)}
      >
        {/* Avatar */}
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name || user.email}
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            initials
          )}
        </div>
        <span className="hidden md:inline text-sm font-medium">
          {user.name || user.email.split('@')[0]}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </Button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-md border bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95">
          {/* User info header */}
          <div className="px-3 py-2 border-b mb-1">
            <p className="text-sm font-medium">{user.name || 'User'}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>

          {/* Menu items */}
          {/* Profile link opens Settings on the Account tab */}
          <Link
            href="/settings?tab=account"
            className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent"
            onClick={() => setIsOpen(false)}
          >
            <User className="h-4 w-4" />
            Profile
          </Link>

          {/* About Me link opens Settings on the About Me tab */}
          <Link
            href="/settings?tab=about"
            className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent"
            onClick={() => setIsOpen(false)}
          >
            <Settings className="h-4 w-4" />
            About Me
          </Link>

          <Link
            href="/settings"
            className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent"
            onClick={() => setIsOpen(false)}
          >
            <Settings className="h-4 w-4" />
            All Settings
          </Link>

          <div className="border-t my-1" />

          <button
            onClick={() => {
              setIsOpen(false);
              onLogout?.();
            }}
            className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main navigation bar component.
 *
 * Provides consistent navigation across all authenticated pages with:
 * - App branding and logo
 * - Global search functionality
 * - Sync status and manual sync trigger
 * - User menu with profile/settings/logout
 *
 * @example
 * ```tsx
 * <Navbar
 *   user={{ id: '123', name: 'Hazel', email: 'hazel@example.com' }}
 *   syncStatus={{ isSyncing: false, lastSyncAt: new Date() }}
 *   onSearch={(q) => router.push(`/search?q=${q}`)}
 *   onSync={() => triggerEmailSync()}
 *   onLogout={() => supabase.auth.signOut()}
 * />
 * ```
 */
export function Navbar({
  user,
  syncStatus,
  onSearch,
  onSync,
  onLogout,
  onMenuToggle,
  className,
}: NavbarProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60',
        className
      )}
    >
      <div className="flex h-14 items-center px-4 gap-4">
        {/* Mobile menu button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onMenuToggle}
          aria-label="Toggle menu"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Logo */}
        <NavbarLogo />

        {/* Search (centered on larger screens) */}
        <div className="flex-1 flex justify-center">
          <NavbarSearch onSearch={onSearch} />
        </div>

        {/* Right section: sync + user */}
        <div className="flex items-center gap-2">
          {user && (
            <>
              <SyncIndicator status={syncStatus} onSync={onSync} />
              <UserMenu user={user} onLogout={onLogout} />
            </>
          )}

          {!user && (
            <Button asChild size="sm">
              <Link href="/">Sign In</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

export default Navbar;
