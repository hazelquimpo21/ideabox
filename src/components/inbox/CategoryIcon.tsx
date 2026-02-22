/**
 * CategoryIcon Component
 *
 * Custom SVG icons for each of the 12 email categories.
 * Replaces the old single-letter avatar bubbles with instantly
 * recognizable, category-themed icons.
 *
 * Each icon is hand-crafted to be legible at small sizes (16-36px)
 * and pairs with the category accent color system from discovery.ts.
 *
 * @module components/inbox/CategoryIcon
 * @since February 2026 — Inbox UI Redesign v2
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
// CATEGORY COLORS — bg + icon fill pairs
// ═══════════════════════════════════════════════════════════════════════════════

const CATEGORY_ICON_COLORS: Record<EmailCategory, { bg: string; fg: string }> = {
  client_pipeline:           { bg: 'bg-blue-100 dark:bg-blue-900/40',    fg: 'text-blue-600 dark:text-blue-300' },
  business_work_general:     { bg: 'bg-violet-100 dark:bg-violet-900/40', fg: 'text-violet-600 dark:text-violet-300' },
  personal_friends_family:   { bg: 'bg-pink-100 dark:bg-pink-900/40',    fg: 'text-pink-600 dark:text-pink-300' },
  family_kids_school:        { bg: 'bg-amber-100 dark:bg-amber-900/40',  fg: 'text-amber-600 dark:text-amber-300' },
  family_health_appointments:{ bg: 'bg-rose-100 dark:bg-rose-900/40',    fg: 'text-rose-600 dark:text-rose-300' },
  finance:                   { bg: 'bg-green-100 dark:bg-green-900/40',  fg: 'text-green-600 dark:text-green-300' },
  travel:                    { bg: 'bg-sky-100 dark:bg-sky-900/40',      fg: 'text-sky-600 dark:text-sky-300' },
  shopping:                  { bg: 'bg-orange-100 dark:bg-orange-900/40', fg: 'text-orange-600 dark:text-orange-300' },
  local:                     { bg: 'bg-teal-100 dark:bg-teal-900/40',    fg: 'text-teal-600 dark:text-teal-300' },
  newsletters_general:       { bg: 'bg-emerald-100 dark:bg-emerald-900/40', fg: 'text-emerald-600 dark:text-emerald-300' },
  news_politics:             { bg: 'bg-slate-200 dark:bg-slate-800/60',  fg: 'text-slate-600 dark:text-slate-300' },
  product_updates:           { bg: 'bg-indigo-100 dark:bg-indigo-900/40', fg: 'text-indigo-600 dark:text-indigo-300' },
};

const FALLBACK_COLORS = { bg: 'bg-gray-100 dark:bg-gray-800/40', fg: 'text-gray-500 dark:text-gray-400' };

// ═══════════════════════════════════════════════════════════════════════════════
// SVG ICON PATHS — each icon is a simple, legible shape
// ═══════════════════════════════════════════════════════════════════════════════

/** All SVG icons render in a 24x24 viewBox */
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

/** Briefcase — client_pipeline */
function BriefcaseIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      <path d="M12 12v.01" />
    </IconSvg>
  );
}

/** Building — business_work_general */
function BuildingIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22V12h6v10" />
      <path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01" />
    </IconSvg>
  );
}

/** Heart with people — personal_friends_family */
function PeopleHeartIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <path d="M16 8a4 4 0 1 0-8 0c0 4 4 8 4 8s4-4 4-8Z" />
      <circle cx="8" cy="18" r="2" />
      <circle cx="16" cy="18" r="2" />
      <path d="M12 16v-2" />
    </IconSvg>
  );
}

/** Backpack — family_kids_school */
function BackpackIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <path d="M4 10a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <path d="M9 8V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4" />
      <path d="M9 14h6" />
      <path d="M9 18h6" />
    </IconSvg>
  );
}

/** Medical cross — family_health_appointments */
function MedicalIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </IconSvg>
  );
}

/** Dollar/Coin — finance */
function FinanceIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <circle cx="12" cy="12" r="9" />
      <path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5 1-2.5 2.25s1 2.25 2.5 2.25c1.5 0 2.5 1 2.5 2.25S13.5 17 12 17c-1 0-2-.5-2.5-1.5" />
      <path d="M12 6v1.5M12 16.5V18" />
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

/** Map pin — local */
function LocalIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </IconSvg>
  );
}

/** Newspaper — newsletters_general */
function NewsletterIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
      <path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6Z" />
    </IconSvg>
  );
}

/** Globe/News — news_politics */
function GlobeNewsIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
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
// ICON REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

const CATEGORY_ICONS: Record<EmailCategory, React.FC<{ size: number }>> = {
  client_pipeline: BriefcaseIcon,
  business_work_general: BuildingIcon,
  personal_friends_family: PeopleHeartIcon,
  family_kids_school: BackpackIcon,
  family_health_appointments: MedicalIcon,
  finance: FinanceIcon,
  travel: TravelIcon,
  shopping: ShoppingIcon,
  local: LocalIcon,
  newsletters_general: NewsletterIcon,
  news_politics: GlobeNewsIcon,
  product_updates: PackageIcon,
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
