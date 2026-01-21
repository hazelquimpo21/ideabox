/**
 * 🔒 Authenticated Layout for IdeaBox
 *
 * Layout wrapper for all authenticated pages. Provides:
 * - Navigation bar with user menu
 * - Sidebar with category filters and clients
 * - Protected route wrapper
 * - Responsive mobile sidebar toggle
 *
 * STRUCTURE
 *
 * +-------------------------------------------------------------------+
 * |                           Navbar                                  |
 * +--------------+----------------------------------------------------+
 * |              |                                                    |
 * |   Sidebar    |              Page Content                          |
 * |   (w-64)     |              (flex-1)                              |
 * |              |                                                    |
 * +--------------+----------------------------------------------------+
 *
 * @module app/(auth)/layout
 */

'use client';

import * as React from 'react';
import { useAuth } from '@/lib/auth';
import { ProtectedRoute } from '@/components/auth';
import { Navbar, Sidebar } from '@/components/layout';
import { useSidebarData, useSyncStatus } from '@/hooks';
import { createLogger } from '@/lib/utils/logger';
import { useToast } from '@/components/ui';

// -----------------------------------------------------------------------------
// LOGGER
// -----------------------------------------------------------------------------

const logger = createLogger('AuthLayout');

// -----------------------------------------------------------------------------
// COMPONENT
// -----------------------------------------------------------------------------

/**
 * Authenticated pages layout.
 *
 * Wraps all pages in the (auth) route group with:
 * - Authentication protection
 * - Navbar with user menu and search
 * - Sidebar navigation
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, signOut } = useAuth();
  const { toast } = useToast();

  // Sidebar data (category counts, clients, and upcoming events)
  const { categoryCounts, clients, upcomingEvents } = useSidebarData();

  // Sync status for navbar sync button
  const { isSyncing, lastSyncAt, triggerSync } = useSyncStatus();

  // Mobile sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleLogout = async () => {
    logger.info('User initiated logout');
    try {
      await signOut();
    } catch (error) {
      logger.error('Logout failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleSearch = (query: string) => {
    // TODO: Implement global search
    logger.debug('Search triggered', { query });
  };

  /**
   * Triggers a manual email refresh (sync + analyze).
   * Called when user clicks the sync button in the navbar.
   *
   * Terminology:
   * - "Refresh" = Fetch new emails from Gmail AND analyze them
   * - This is what users expect when they click sync
   */
  const handleSync = async () => {
    logger.info('Manual refresh triggered from navbar');
    const result = await triggerSync();
    if (result.success) {
      toast({
        title: 'Refresh started',
        description: 'Fetching and analyzing new emails...',
      });
    } else {
      toast({
        variant: 'destructive',
        title: 'Refresh failed',
        description: result.error || 'Could not start email refresh.',
      });
    }
  };

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <ProtectedRoute requireOnboarding>
      <div className="min-h-screen bg-background">
        {/* Navbar */}
        <Navbar
          user={user ? {
            id: user.id,
            name: user.name,
            email: user.email,
            avatarUrl: user.avatarUrl,
          } : null}
          syncStatus={{
            isSyncing,
            lastSyncAt: lastSyncAt || null,
          }}
          onSearch={handleSearch}
          onSync={handleSync}
          onLogout={handleLogout}
          onMenuToggle={toggleSidebar}
        />

        {/* Main Content Area */}
        <div className="flex">
          {/* Sidebar */}
          <Sidebar
            isOpen={isSidebarOpen}
            onClose={closeSidebar}
            categoryCounts={categoryCounts}
            clients={clients}
            upcomingEvents={upcomingEvents}
          />

          {/* Page Content */}
          <main className="flex-1 min-h-[calc(100vh-64px)]">
            <div className="container py-6 px-4 md:px-6 lg:px-8 max-w-7xl">
              {children}
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
