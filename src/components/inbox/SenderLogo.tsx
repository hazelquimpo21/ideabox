/**
 * SenderLogo Component
 *
 * Fetches and displays a company logo for an email sender's domain.
 * Uses the Google favicon service (no API key needed) with graceful
 * fallback to null (caller decides what to show instead).
 *
 * Images are preloaded via JS Image() constructor to avoid 404 noise
 * in the browser console — the <img> element is only rendered after
 * the favicon loads successfully.
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

  const parts = domain.split('.');
  // Common transactional email subdomains that rarely have favicons
  if (parts.length > 2) {
    const sub = parts[0]!;
    if ([
      'mail', 'email', 'e', 'em', 'info', 'news', 'notify', 'noreply', 'service',
      'reminder', 'mail8', 'send', 'hello', 'marketing', 'orders', 'rewards',
      'enotify', 'shared1', 'mail-service', 'bounce', 'return', 'reply',
      'comms', 'mailer', 'updates', 'alerts', 'messages', 'system',
      'do-not-reply', 'donotreply', 'no-reply', 'notifications',
    ].includes(sub)) {
      return true;
    }
  }

  // Skip known bulk email / marketing platforms (subdomains never have favicons)
  const bulkSuffixes = [
    '.ccsend.com', '.mailchimpapp.com', '.constantcontact.com',
    '.myactivecampaign.com', '.yoursocial.team', '.sendgrid.net',
    '.mcsv.net', '.list-manage.com', '.mailgun.org', '.mandrillapp.com',
    '.postmarkapp.com', '.sparkpostmail.com', '.sailthru.com',
    '.getresponse.com', '.aweber.com', '.drip.com',
  ];
  for (const suffix of bulkSuffixes) {
    if (domain.endsWith(suffix)) return true;
  }

  // Skip numeric subdomains (e.g. "3328467.myactivecampaign.com" already caught above,
  // but also catch patterns like "12345.example.com")
  if (parts.length > 2 && /^\d+$/.test(parts[0]!)) {
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
 */
function getLogoUrl(domain: string, size: number): string {
  // Google's S2 favicon service — reliable, free, no API key
  if (size <= 32) {
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  }
  // For larger sizes, use the 64px variant
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

// Module-level cache for domains — prevents repeated attempts
const failedDomains = new Set<string>();
const loadedDomains = new Set<string>();

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const SenderLogo = React.memo(function SenderLogo({
  senderEmail,
  size = 20,
  className,
}: SenderLogoProps) {
  const [loaded, setLoaded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const domain = getDomain(senderEmail);

  // Skip personal email domains, transactional subdomains, and previously-failed domains
  const shouldSkip = !domain || shouldSkipDomain(domain) || failedDomains.has(domain);

  // Check if already loaded from cache
  const alreadyCached = domain ? loadedDomains.has(domain) : false;

  const logoUrl = domain ? getLogoUrl(domain, size) : '';

  // Preload the favicon via JS Image() to avoid 404 console noise.
  // Only rendered as <img> after successful load.
  React.useEffect(() => {
    if (shouldSkip || failed || alreadyCached) return;

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      // Always update module-level cache even if component unmounted (StrictMode)
      if (domain) loadedDomains.add(domain);
      if (!cancelled) setLoaded(true);
    };
    img.onerror = () => {
      if (domain) failedDomains.add(domain);
      if (!cancelled) setFailed(true);
    };
    img.src = logoUrl;

    return () => {
      cancelled = true;
    };
  }, [domain, logoUrl, shouldSkip, failed, alreadyCached]);

  if (shouldSkip || failed || (!loaded && !alreadyCached)) {
    return null;
  }

  return (
    <img
      src={logoUrl}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={cn('rounded-sm object-contain', className)}
      onError={(e) => {
        // Safety net: if the rendered img 404s (e.g. redirect chain changed),
        // hide it and cache the failure to prevent future attempts.
        (e.target as HTMLImageElement).style.display = 'none';
        if (domain) failedDomains.add(domain);
      }}
    />
  );
});

export default SenderLogo;
