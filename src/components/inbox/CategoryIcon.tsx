/**
 * CategoryIcon Component
 *
 * Custom SVG icons for all 20 email categories (Taxonomy v2).
 * Each icon is hand-crafted to be legible at small sizes (14–24px)
 * and pairs with the category accent color system from discovery.ts.
 *
 * EXPANDED (Mar 2026 — Taxonomy v2): 12 → 20 icons.
 * New: job_search, parenting, health, billing, deals, civic, sports,
 *      news, politics, newsletters, notifications.
 * Renamed: personal_friends_family → personal
 * Merged: newsletters_creator + newsletters_industry → newsletters
 *
 * @module components/inbox/CategoryIcon
 * @since February 2026 — Inbox UI Redesign v2
 * @updated March 2026 — Taxonomy v2 (20 categories)
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import type { EmailCategory } from '@/types/discovery';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CategoryIconProps {
  /** The email category to render an icon for */
  category: EmailCategory | null | undefined;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional className for the outer container */
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ICON SIZE MAP
// ═══════════════════════════════════════════════════════════════════════════════

const SIZE_CONFIG = {
  sm: { container: 'w-7 h-7', icon: 14 },
  md: { container: 'w-9 h-9', icon: 18 },
  lg: { container: 'w-12 h-12', icon: 24 },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY COLORS — bg + icon fill pairs (20 categories)
// ═══════════════════════════════════════════════════════════════════════════════

const CATEGORY_ICON_COLORS: Record<EmailCategory, { bg: string; fg: string }> = {
  // Work & Professional
  clients:         { bg: 'bg-blue-100 dark:bg-blue-900/40',     fg: 'text-blue-600 dark:text-blue-300' },
  work:            { bg: 'bg-violet-100 dark:bg-violet-900/40', fg: 'text-violet-600 dark:text-violet-300' },
  job_search:      { bg: 'bg-lime-100 dark:bg-lime-900/40',     fg: 'text-lime-600 dark:text-lime-300' },
  // People & Relationships
  personal:        { bg: 'bg-pink-100 dark:bg-pink-900/40',     fg: 'text-pink-600 dark:text-pink-300' },
  family:          { bg: 'bg-amber-100 dark:bg-amber-900/40',   fg: 'text-amber-600 dark:text-amber-300' },
  parenting:       { bg: 'bg-rose-100 dark:bg-rose-900/40',     fg: 'text-rose-600 dark:text-rose-300' },
  // Life Admin
  health:          { bg: 'bg-red-100 dark:bg-red-900/40',       fg: 'text-red-600 dark:text-red-300' },
  finance:         { bg: 'bg-green-100 dark:bg-green-900/40',   fg: 'text-green-600 dark:text-green-300' },
  billing:         { bg: 'bg-emerald-100 dark:bg-emerald-900/40', fg: 'text-emerald-600 dark:text-emerald-300' },
  travel:          { bg: 'bg-sky-100 dark:bg-sky-900/40',       fg: 'text-sky-600 dark:text-sky-300' },
  shopping:        { bg: 'bg-orange-100 dark:bg-orange-900/40', fg: 'text-orange-600 dark:text-orange-300' },
  deals:           { bg: 'bg-fuchsia-100 dark:bg-fuchsia-900/40', fg: 'text-fuchsia-600 dark:text-fuchsia-300' },
  // Community & Civic
  local:           { bg: 'bg-teal-100 dark:bg-teal-900/40',     fg: 'text-teal-600 dark:text-teal-300' },
  civic:           { bg: 'bg-stone-200 dark:bg-stone-800/60',   fg: 'text-stone-600 dark:text-stone-300' },
  sports:          { bg: 'bg-yellow-100 dark:bg-yellow-900/40', fg: 'text-yellow-600 dark:text-yellow-300' },
  // Information
  news:            { bg: 'bg-slate-200 dark:bg-slate-800/60',   fg: 'text-slate-600 dark:text-slate-300' },
  politics:        { bg: 'bg-zinc-200 dark:bg-zinc-800/60',     fg: 'text-zinc-600 dark:text-zinc-300' },
  newsletters:     { bg: 'bg-emerald-100 dark:bg-emerald-900/40', fg: 'text-emerald-600 dark:text-emerald-300' },
  product_updates: { bg: 'bg-indigo-100 dark:bg-indigo-900/40', fg: 'text-indigo-600 dark:text-indigo-300' },
  // System
  notifications:   { bg: 'bg-gray-100 dark:bg-gray-800/40',    fg: 'text-gray-500 dark:text-gray-400' },
};

const FALLBACK_COLORS = { bg: 'bg-gray-100 dark:bg-gray-800/40', fg: 'text-gray-500 dark:text-gray-400' };

// ═══════════════════════════════════════════════════════════════════════════════
// SVG ICON PATHS — each icon is a simple, legible shape in 24x24 viewBox
// ═══════════════════════════════════════════════════════════════════════════════

/** Shared SVG wrapper — all icons render in a 24x24 viewBox */
function IconSvg({ children, size }: { children: React.ReactNode; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Briefcase — clients */
function BriefcaseIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      <path d="M12 12v.01" />
    </IconSvg>
  );
}

/** Building — work */
function BuildingIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22V12h6v10" />
      <path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01" />
    </IconSvg>
  );
}

/** Magnifying glass + person — job_search */
function JobSearchIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <circle cx="10" cy="10" r="7" />
      <path d="m21 21-4.35-4.35" />
      <circle cx="10" cy="8" r="2" />
      <path d="M7 13a3 3 0 0 1 6 0" />
    </IconSvg>
  );
}

/** Two people — personal */
function PeopleIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <circle cx="9" cy="7" r="3" />
      <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
      <circle cx="17" cy="8" r="2.5" />
      <path d="M21 21v-1.5a3 3 0 0 0-2-2.83" />
    </IconSvg>
  );
}

/** House — family */
function FamilyIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" />
      <path d="M9 21v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6" />
    </IconSvg>
  );
}

/** Parent holding child's hand — parenting */
function ParentingIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <circle cx="9" cy="5" r="3" />
      <path d="M9 8v6" />
      <path d="M6 14h6" />
      <path d="M9 14v7" />
      <circle cx="17" cy="10" r="2" />
      <path d="M17 12v5" />
      <path d="M15 17h4" />
    </IconSvg>
  );
}

/** Heart with pulse line — health */
function HealthIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <path d="M19.5 12.572l-7.5 7.428-7.5-7.428A5 5 0 1 1 12 6.006a5 5 0 1 1 7.5 6.572" />
      <path d="M4 12h3l2-3 3 6 2-3h6" />
    </IconSvg>
  );
}

/** Chart trending up — finance */
function FinanceIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </IconSvg>
  );
}

/** Receipt with dollar — billing */
function BillingIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M14 8h-4M14 12h-4M10 16h2" />
    </IconSvg>
  );
}

/** Airplane — travel */
function TravelIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2Z" />
    </IconSvg>
  );
}

/** Shopping bag — shopping */
function ShoppingIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </IconSvg>
  );
}

/** Price tag with percent — deals */
function DealsIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </IconSvg>
  );
}

/** Map pin — local */
function LocalIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </IconSvg>
  );
}

/** Classical columns — civic */
function CivicIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <path d="M3 21h18" />
      <path d="M5 21V7" />
      <path d="M19 21V7" />
      <path d="M9 21V7" />
      <path d="M15 21V7" />
      <path d="M12 21V7" />
      <path d="M3 7l9-5 9 5" />
    </IconSvg>
  );
}

/** Trophy — sports */
function SportsIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M6 4h12v5a6 6 0 0 1-12 0V4Z" />
      <path d="M12 15v3" />
      <path d="M8 21h8" />
      <path d="M10 18h4" />
    </IconSvg>
  );
}

/** Newspaper — news */
function NewsIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
      <path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6Z" />
    </IconSvg>
  );
}

/** Ballot box with checkmark — politics */
function PoliticsIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      <path d="M9 16l2 2 4-4" />
    </IconSvg>
  );
}

/** Open book/letter — newsletters */
function NewsletterIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2Z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7Z" />
    </IconSvg>
  );
}

/** Box/Package — product_updates */
function PackageIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
    </IconSvg>
  );
}

/** Bell — notifications */
function BellIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </IconSvg>
  );
}

/** Fallback — generic mail icon */
function MailFallbackIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </IconSvg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ICON REGISTRY — maps every category to its icon component
// ═══════════════════════════════════════════════════════════════════════════════

const CATEGORY_ICONS: Record<EmailCategory, React.FC<{ size: number }>> = {
  clients: BriefcaseIcon,
  work: BuildingIcon,
  job_search: JobSearchIcon,
  personal: PeopleIcon,
  family: FamilyIcon,
  parenting: ParentingIcon,
  health: HealthIcon,
  finance: FinanceIcon,
  billing: BillingIcon,
  travel: TravelIcon,
  shopping: ShoppingIcon,
  deals: DealsIcon,
  local: LocalIcon,
  civic: CivicIcon,
  sports: SportsIcon,
  news: NewsIcon,
  politics: PoliticsIcon,
  newsletters: NewsletterIcon,
  product_updates: PackageIcon,
  notifications: BellIcon,
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const CategoryIcon = React.memo(function CategoryIcon({
  category,
  size = 'md',
  className,
}: CategoryIconProps) {
  const sizeConfig = SIZE_CONFIG[size];
  const colors = category ? CATEGORY_ICON_COLORS[category] || FALLBACK_COLORS : FALLBACK_COLORS;
  const IconComponent = category ? CATEGORY_ICONS[category] || MailFallbackIcon : MailFallbackIcon;

  return (
    <div
      className={cn(
        'shrink-0 rounded-full flex items-center justify-center',
        sizeConfig.container,
        colors.bg,
        colors.fg,
        className,
      )}
      aria-hidden="true"
    >
      <IconComponent size={sizeConfig.icon} />
    </div>
  );
});

export default CategoryIcon;
