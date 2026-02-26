/**
 * SenderLogo Component
 *
 * Fetches and displays a company logo for an email sender's domain.
 * Uses the Google favicon service (no API key needed) with graceful
 * fallback to null (caller decides what to show instead).
 *
 * @module components/inbox/SenderLogo
 * @since February 2026 — Inbox UI Redesign v2
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface SenderLogoProps {
  /** Sender email address — domain is extracted from this */
  senderEmail: string;
  /** Size in pixels */
  size?: number;
  /** Additional className */
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Domains that won't have useful logos — skip network request entirely */
const SKIP_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'me.com', 'mac.com', 'live.com', 'msn.com',
  'protonmail.com', 'proton.me', 'fastmail.com', 'zoho.com',
]);

/** Subdomains/patterns that are typically transactional/no-favicon — skip to reduce 404 noise */
function shouldSkipDomain(domain: string): boolean {
  if (SKIP_DOMAINS.has(domain)) return true;
  // Common transactional email subdomains that rarely have favicons
  const parts = domain.split('.');
  if (parts.length > 2) {
    const sub = parts[0]!;
    if ([
      'mail', 'email', 'e', 'info', 'news', 'notify', 'noreply', 'service',
      'reminder', 'mail8', 'send', 'hello', 'marketing', 'orders', 'rewards',
      'enotify', 'shared1', 'mail-service', 'bounce', 'return', 'reply',
    ].includes(sub)) {
      return true;
    }
  }
  // Skip known bulk email platforms (their subdomains never have favicons)
  if (domain.endsWith('.ccsend.com') || domain.endsWith('.mailchimpapp.com') || domain.endsWith('.constantcontact.com')) {
    return true;
  }
  return false;
}

/** Extract domain from an email address */
function getDomain(email: string): string | null {
  const parts = email.split('@');
  if (parts.length !== 2) return null;
  return parts[1]!.toLowerCase();
}

/**
 * Get the logo URL for a domain.
 * Uses Google's favicon service which returns 16/32/64px icons.
 * Falls back to a higher-res Clearbit-style logo if available.
 */
function getLogoUrl(domain: string, size: number): string {
  // Google's S2 favicon service — reliable, free, no API key
  if (size <= 32) {
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  }
  // For larger sizes, use the 64px variant
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

// Module-level cache for domains that failed to load — prevents repeated attempts
const failedDomains = new Set<string>();

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const SenderLogo = React.memo(function SenderLogo({
  senderEmail,
  size = 20,
  className,
}: SenderLogoProps) {
  const [hasError, setHasError] = React.useState(false);
  const domain = getDomain(senderEmail);

  // Skip personal email domains, transactional subdomains, and previously-failed domains
  if (!domain || shouldSkipDomain(domain) || failedDomains.has(domain) || hasError) {
    return null;
  }

  const logoUrl = getLogoUrl(domain, size);

  return (
    <img
      src={logoUrl}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={cn('rounded-sm object-contain', className)}
      onError={() => {
        failedDomains.add(domain);
        setHasError(true);
      }}
    />
  );
});

export default SenderLogo;
