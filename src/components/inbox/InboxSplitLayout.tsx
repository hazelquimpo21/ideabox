/**
 * InboxSplitLayout — top-level split-panel inbox container.
 *
 * The main structural component for the redesigned inbox. Manages the
 * selectedEmailId state and coordinates the two panels:
 *
 *   ┌──────────────────┬──────────────────────────┐
 *   │  InboxListPanel  │    InboxDetailPanel       │
 *   │  (email list)    │    (selected email)       │
 *   │  ~420px fixed    │    flex-1 remaining       │
 *   └──────────────────┴──────────────────────────┘
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * RESPONSIVE BEHAVIOR
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *   Desktop (≥1024px):  Side-by-side, both panels visible
 *   Tablet (768–1023):  Side-by-side, list narrower (320px)
 *   Mobile (<768px):    Single column — list OR detail, toggled by selection
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * KEYBOARD SHORTCUTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *   j/k:     Navigate email list (next/prev)
 *   Enter:   Open focused email in detail panel
 *   e:       Archive focused/selected email
 *   s:       Star/unstar focused/selected email
 *   Escape:  Deselect email / mobile: back to list
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * URL CONTRACT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *   ?email=<id>  — deep-link to a specific email (read on mount, then cleared)
 *
 * @module components/inbox/InboxSplitLayout
 * @since March 2026 — Inbox Redesign v3 (Split Panel)
 */

'use client';

import * as React from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { createLogger } from '@/lib/utils/logger';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { cn } from '@/lib/utils/cn';

import { InboxListPanel } from './InboxListPanel';
import { InboxDetailPanel } from './InboxDetailPanel';

import type { Email } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('InboxSplitLayout');

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function InboxSplitLayout() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // ─── Core state ───────────────────────────────────────────────────────────

  const [selectedEmailId, setSelectedEmailId] = React.useState<string | null>(null);
  const [mobileView, setMobileView] = React.useState<'list' | 'detail'>('list');

  // ─── Deep-link: read ?email= on mount ─────────────────────────────────────

  const emailParam = searchParams.get('email');
  React.useEffect(() => {
    if (emailParam) {
      logger.debug('Deep-link: opening email from URL', { emailId: emailParam });
      setSelectedEmailId(emailParam);
      setMobileView('detail');

      // Clean the URL param to avoid re-triggering
      const params = new URLSearchParams(searchParams.toString());
      params.delete('email');
      const queryString = params.toString();
      const newUrl = queryString ? `${pathname}?${queryString}` : pathname;
      router.replace(newUrl, { scroll: false });
    }
  }, [emailParam]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Email selection handler ──────────────────────────────────────────────

  const handleEmailSelect = React.useCallback(
    (emailId: string, _category?: string | null) => {
      logger.info('Email selected', { emailId });
      setSelectedEmailId(emailId);
      setMobileView('detail');
    },
    [],
  );

  // ─── Email update handler (propagates optimistic updates between panels) ──

  const handleEmailUpdated = React.useCallback(
    (emailId: string, updates: Partial<Email>) => {
      logger.debug('Email updated from detail panel', { emailId, updates: Object.keys(updates) });
      // If archived, clear selection
      if (updates.is_archived) {
        setSelectedEmailId(null);
        setMobileView('list');
      }
    },
    [],
  );

  // ─── Mobile: back to list ─────────────────────────────────────────────────

  const handleMobileBack = React.useCallback(() => {
    logger.info('Mobile view switched', { view: 'list' });
    setMobileView('list');
    setSelectedEmailId(null);
  }, []);

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────

  const handleEscape = React.useCallback(() => {
    if (selectedEmailId) {
      setSelectedEmailId(null);
      setMobileView('list');
      logger.debug('Keyboard: deselected email');
    }
  }, [selectedEmailId]);

  // j/k navigation uses DOM query to find email rows
  const [focusedIndex, setFocusedIndex] = React.useState(-1);

  const getEmailRows = React.useCallback((): HTMLElement[] => {
    return Array.from(document.querySelectorAll<HTMLElement>('[data-email-row]'));
  }, []);

  const handleNextEmail = React.useCallback(() => {
    const rows = getEmailRows();
    if (rows.length === 0) return;
    const next = Math.min(focusedIndex + 1, rows.length - 1);
    setFocusedIndex(next);
    rows[next]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    rows[next]?.focus();
    logger.debug('Keyboard nav', { direction: 'next', index: next });
  }, [focusedIndex, getEmailRows]);

  const handlePrevEmail = React.useCallback(() => {
    const rows = getEmailRows();
    if (rows.length === 0) return;
    const prev = Math.max(focusedIndex - 1, 0);
    setFocusedIndex(prev);
    rows[prev]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    rows[prev]?.focus();
    logger.debug('Keyboard nav', { direction: 'prev', index: prev });
  }, [focusedIndex, getEmailRows]);

  const handleEnterEmail = React.useCallback(() => {
    const rows = getEmailRows();
    const row = rows[focusedIndex];
    if (row) {
      row.click();
      logger.debug('Keyboard: opened email', { index: focusedIndex });
    }
  }, [focusedIndex, getEmailRows]);

  const handleArchiveShortcut = React.useCallback(() => {
    const rows = getEmailRows();
    const row = rows[focusedIndex];
    if (!row) return;
    const archiveBtn = row.querySelector<HTMLButtonElement>('[aria-label="Archive"]');
    if (archiveBtn) archiveBtn.click();
  }, [focusedIndex, getEmailRows]);

  const handleStarShortcut = React.useCallback(() => {
    const rows = getEmailRows();
    const row = rows[focusedIndex];
    if (!row) return;
    const starBtn = row.querySelector<HTMLButtonElement>('[aria-label="Star"], [aria-label="Unstar"], [aria-label="Star email"]');
    if (starBtn) starBtn.click();
  }, [focusedIndex, getEmailRows]);

  useKeyboardShortcuts([
    { key: 'j', handler: handleNextEmail, description: 'Next email', view: 'inbox' },
    { key: 'k', handler: handlePrevEmail, description: 'Previous email', view: 'inbox' },
    { key: 'Enter', handler: handleEnterEmail, description: 'Open email', view: 'inbox' },
    { key: 'e', handler: handleArchiveShortcut, description: 'Archive email', view: 'inbox' },
    { key: 's', handler: handleStarShortcut, description: 'Star / unstar email', view: 'inbox' },
    { key: 'Escape', handler: handleEscape, description: 'Deselect email', view: 'inbox' },
  ]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* List panel */}
      <div
        className={cn(
          // Desktop: fixed width, always visible
          'w-full md:w-[380px] lg:w-[420px] shrink-0',
          // Mobile: full width, hidden when viewing detail
          mobileView === 'detail' && 'hidden md:flex md:flex-col',
          mobileView === 'list' && 'flex flex-col',
        )}
      >
        <InboxListPanel
          selectedEmailId={selectedEmailId}
          onEmailSelect={handleEmailSelect}
          onEmailUpdated={handleEmailUpdated}
        />
      </div>

      {/* Detail panel */}
      <div
        className={cn(
          // Desktop: flex-1, always visible
          'flex-1 min-w-0',
          // Mobile: full width, hidden when viewing list
          mobileView === 'list' && 'hidden md:flex md:flex-col',
          mobileView === 'detail' && 'flex flex-col',
        )}
      >
        <InboxDetailPanel
          selectedEmailId={selectedEmailId}
          onEmailUpdated={handleEmailUpdated}
          onClose={handleMobileBack}
        />
      </div>
    </div>
  );
}

export default InboxSplitLayout;
