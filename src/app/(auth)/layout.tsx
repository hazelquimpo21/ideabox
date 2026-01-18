/**
 * 🔒 Authenticated Layout for IdeaBox
 *
 * Layout wrapper for all authenticated pages. Provides:
 * - Navigation bar with user menu
 * - Sidebar with category filters and clients
 * - Protected route wrapper
 * - Responsive mobile sidebar toggle
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * STRUCTURE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                           Navbar                                │
 * ├──────────────┬──────────────────────────────────────────────────┤
 * │              │                                                  │
 * │   Sidebar    │              Page Content                        │
 * │   (240px)    │              (flex-1)                            │
 * │              │                                                  │
 * └──────────────┴──────────────────────────────────────────────────┘
 *
 * @module app/(auth)/layout
 */

'use client';

import * as React from 'react';
import { useAuth } from '@/lib/auth';
import { ProtectedRoute } from '@/components/auth';
import { Navbar, Sidebar } from '@/components/layout';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('AuthLayout');

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

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

  // Mobile sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

  // ───────────────────────────────────────────────────────────────────────────
  // Handlers
  // ───────────────────────────────────────────────────────────────────────────

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

  const handleSync = () => {
    // TODO: Implement manual sync trigger
    logger.debug('Manual sync triggered');
  };

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <ProtectedRoute requireOnboarding>
      <div className="min-h-screen bg-background">
        {/* ─────────────────────────────────────────────────────────────────────
            Navbar
            ───────────────────────────────────────────────────────────────────── */}
        <Navbar
          user={user ? {
            id: user.id,
            name: user.name,
            email: user.email,
            avatarUrl: user.avatarUrl,
          } : null}
          syncStatus={{
            isSyncing: false,
            lastSyncAt: null,
          }}
          onSearch={handleSearch}
          onSync={handleSync}
          onLogout={handleLogout}
          onMenuToggle={toggleSidebar}
        />

        {/* ─────────────────────────────────────────────────────────────────────
            Main Content Area
            ───────────────────────────────────────────────────────────────────── */}
        <div className="flex">
          {/* Sidebar */}
          <Sidebar
            isOpen={isSidebarOpen}
            onClose={closeSidebar}
            categoryCounts={{}}
            clients={[]}
          />

          {/* Page Content */}
          <main className="flex-1 min-h-[calc(100vh-64px)] lg:ml-60">
            <div className="container py-6 px-4 md:px-6 lg:px-8 max-w-7xl">
              {children}
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
