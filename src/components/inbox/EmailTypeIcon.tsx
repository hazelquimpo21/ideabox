/**
 * EmailTypeIcon Component
 *
 * Small SVG icons representing the six email_type values.
 * These show the nature of the communication (orthogonal to category).
 *
 * | Type            | Icon          | Visual meaning               |
 * |-----------------|---------------|-------------------------------|
 * | needs_response  | Reply arrow   | Someone is waiting for you    |
 * | personal        | Person        | Direct human correspondence   |
 * | newsletter      | Book/letter   | Content delivery              |
 * | fyi             | Info circle   | For your information          |
 * | automated       | Gear          | Machine-generated             |
 * | marketing       | Megaphone     | Promotional / sales           |
 *
 * @module components/inbox/EmailTypeIcon
 * @since March 2026 — Taxonomy v2
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import type { EmailTypeDb } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface EmailTypeIconProps {
  /** The email type to render */
  emailType: EmailTypeDb | null | undefined;
  /** Icon size in pixels (default: 14) */
  size?: number;
  /** Additional className */
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COLOR MAP
// ═══════════════════════════════════════════════════════════════════════════════

const TYPE_COLORS: Record<EmailTypeDb, string> = {
  needs_response: 'text-blue-600 dark:text-blue-400',
  personal:       'text-pink-500 dark:text-pink-400',
  newsletter:     'text-emerald-500 dark:text-emerald-400',
  fyi:            'text-slate-500 dark:text-slate-400',
  automated:      'text-gray-400 dark:text-gray-500',
  marketing:      'text-orange-500 dark:text-orange-400',
};

const TYPE_LABELS: Record<EmailTypeDb, string> = {
  needs_response: 'Needs response',
  personal:       'Personal email',
  newsletter:     'Newsletter',
  fyi:            'FYI / informational',
  automated:      'Automated',
  marketing:      'Marketing / promo',
};

// ═══════════════════════════════════════════════════════════════════════════════
// SVG WRAPPER
// ═══════════════════════════════════════════════════════════════════════════════

function IconSvg({ children, size }: { children: React.ReactNode; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ICON DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/** Reply arrow — needs_response */
function ReplyIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <path d="M9 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5" />
      <path d="m9 13 3 3-3 3" />
    </IconSvg>
  );
}

/** Person silhouette — personal */
function PersonIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <circle cx="12" cy="8" r="4" />
      <path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
    </IconSvg>
  );
}

/** Open book — newsletter */
function BookIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2Z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7Z" />
    </IconSvg>
  );
}

/** Info circle — fyi */
function InfoIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </IconSvg>
  );
}

/** Gear — automated */
function GearIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
      <circle cx="12" cy="12" r="3" />
    </IconSvg>
  );
}

/** Megaphone — marketing */
function MegaphoneIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <path d="m3 11 18-5v12L3 13v-2Z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </IconSvg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ICON REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

const TYPE_ICONS: Record<EmailTypeDb, React.FC<{ size: number }>> = {
  needs_response: ReplyIcon,
  personal: PersonIcon,
  newsletter: BookIcon,
  fyi: InfoIcon,
  automated: GearIcon,
  marketing: MegaphoneIcon,
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const EmailTypeIcon = React.memo(function EmailTypeIcon({
  emailType,
  size = 14,
  className,
}: EmailTypeIconProps) {
  if (!emailType) return null;

  const IconComponent = TYPE_ICONS[emailType];
  const color = TYPE_COLORS[emailType];
  const label = TYPE_LABELS[emailType];

  if (!IconComponent) return null;

  return (
    <span
      className={cn('inline-flex items-center shrink-0', color, className)}
      title={label}
      aria-label={label}
    >
      <IconComponent size={size} />
    </span>
  );
});

export default EmailTypeIcon;
