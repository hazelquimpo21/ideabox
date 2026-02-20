/**
 * 📄 PageHeader Component for IdeaBox
 *
 * A consistent header component for page content areas.
 * Provides title, optional breadcrumbs, and action buttons.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Page title with optional description
 * - Breadcrumb navigation
 * - Action button slot (right side)
 * - Responsive design
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 * ```tsx
 * import { PageHeader } from '@/components/layout';
 *
 * // Simple usage
 * <PageHeader title="Inbox" />
 *
 * // With breadcrumbs and actions
 * <PageHeader
 *   title="Contact Details"
 *   description="View and manage contact information"
 *   breadcrumbs={[
 *     { label: 'Contacts', href: '/contacts' },
 *     { label: 'Acme Corp' },
 *   ]}
 *   actions={
 *     <Button>Edit Contact</Button>
 *   }
 * />
 * ```
 *
 * @module components/layout/PageHeader
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';

import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Breadcrumb item configuration.
 * Items with href are clickable links; the last item (without href) is current page.
 */
export interface BreadcrumbItem {
  /** Display text for the breadcrumb */
  label: string;
  /** Link destination (omit for current/last item) */
  href?: string;
}

/**
 * Props for the PageHeader component.
 */
export interface PageHeaderProps {
  /** Page title (required) */
  title: string;
  /** Optional description below title */
  description?: string;
  /** Breadcrumb navigation trail */
  breadcrumbs?: BreadcrumbItem[];
  /** Whether to show home icon in breadcrumbs (default: true) */
  showHomeInBreadcrumbs?: boolean;
  /** Action buttons or content for the right side */
  actions?: React.ReactNode;
  /** Optional badge/tag next to title */
  badge?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Additional CSS classes for the title */
  titleClassName?: string;
  /** Children rendered below the header */
  children?: React.ReactNode;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Breadcrumb navigation component.
 * Renders a horizontal trail of links with separators.
 */
function Breadcrumbs({
  items,
  showHome = true,
}: {
  items: BreadcrumbItem[];
  showHome?: boolean;
}) {
  // Prepend home if enabled
  // UPDATED (Feb 2026): Home breadcrumb links to /inbox (was /discover)
  const allItems = showHome
    ? [{ label: 'Home', href: '/inbox' }, ...items]
    : items;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center text-sm">
      <ol className="flex items-center gap-1">
        {allItems.map((item, index) => {
          const isLast = index === allItems.length - 1;
          const isHome = showHome && index === 0;

          return (
            <li key={index} className="flex items-center gap-1">
              {/* Separator (not before first item) */}
              {index > 0 && (
                <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              )}

              {/* Breadcrumb item */}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  {isHome && <Home className="h-3.5 w-3.5" />}
                  {!isHome && item.label}
                </Link>
              ) : (
                <span
                  className={cn(
                    'flex items-center gap-1',
                    isLast ? 'text-foreground font-medium' : 'text-muted-foreground'
                  )}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {isHome && <Home className="h-3.5 w-3.5" />}
                  {!isHome && item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Page header component for consistent page layouts.
 *
 * Provides a standardized header section with:
 * - Breadcrumb navigation (optional)
 * - Page title with optional badge
 * - Description text (optional)
 * - Action buttons slot (right-aligned)
 *
 * @example
 * ```tsx
 * // Basic usage
 * <PageHeader title="Inbox" />
 *
 * // Full featured
 * <PageHeader
 *   title="Acme Corp"
 *   description="Active contact since January 2024"
 *   breadcrumbs={[
 *     { label: 'Contacts', href: '/contacts' },
 *     { label: 'Acme Corp' },
 *   ]}
 *   badge={<Badge variant="secondary">Active</Badge>}
 *   actions={
 *     <div className="flex gap-2">
 *       <Button variant="outline">Export</Button>
 *       <Button>Edit</Button>
 *     </div>
 *   }
 * />
 *
 * // With children (e.g., tabs below header)
 * <PageHeader title="Settings">
 *   <Tabs defaultValue="general">
 *     <TabsList>
 *       <TabsTrigger value="general">General</TabsTrigger>
 *       <TabsTrigger value="accounts">Accounts</TabsTrigger>
 *     </TabsList>
 *   </Tabs>
 * </PageHeader>
 * ```
 */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  showHomeInBreadcrumbs = true,
  actions,
  badge,
  className,
  titleClassName,
  children,
}: PageHeaderProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumbs items={breadcrumbs} showHome={showHomeInBreadcrumbs} />
      )}

      {/* Header row: title + actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Title section */}
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1
              className={cn(
                'text-2xl font-bold tracking-tight text-foreground',
                titleClassName
              )}
            >
              {title}
            </h1>
            {badge}
          </div>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>

        {/* Actions */}
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
        )}
      </div>

      {/* Optional children (tabs, filters, etc.) */}
      {children}
    </div>
  );
}

export default PageHeader;
