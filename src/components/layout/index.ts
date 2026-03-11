/**
 * 📦 Layout Components Barrel Export for IdeaBox
 *
 * Central export for all layout components.
 * Import layout components from this file for cleaner imports.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```tsx
 * import { Navbar, Sidebar, PageHeader } from '@/components/layout';
 *
 * export default function Layout({ children }) {
 *   return (
 *     <>
 *       <Navbar user={currentUser} />
 *       <div className="flex">
 *         <Sidebar />
 *         <main className="flex-1">
 *           <PageHeader title="Inbox" />
 *           {children}
 *         </main>
 *       </div>
 *     </>
 *   );
 * }
 * ```
 *
 * @module components/layout
 */

// ═══════════════════════════════════════════════════════════════════════════════
// NAVBAR
// ═══════════════════════════════════════════════════════════════════════════════

export {
  Navbar,
  type NavbarProps,
  type NavbarUser,
  type SyncStatus,
} from './Navbar';

// ═══════════════════════════════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════════════════════════════

export {
  Sidebar,
  type SidebarProps,
  type SidebarClient,
  type CategoryCounts,
  type EmailCategory,
} from './Sidebar';

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE HEADER
// ═══════════════════════════════════════════════════════════════════════════════

export {
  PageHeader,
  type PageHeaderProps,
  type BreadcrumbItem,
} from './PageHeader';

// ═══════════════════════════════════════════════════════════════════════════════
// SYNC STATUS BANNER
// ═══════════════════════════════════════════════════════════════════════════════

export { SyncStatusBanner } from './SyncStatusBanner';

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL SYNC BANNER
// ═══════════════════════════════════════════════════════════════════════════════

export { EmailSyncBanner } from './EmailSyncBanner';

// ═══════════════════════════════════════════════════════════════════════════════
// CREDENTIAL EXPIRY BANNER
// ═══════════════════════════════════════════════════════════════════════════════

export { CredentialExpiryBanner } from './CredentialExpiryBanner';
