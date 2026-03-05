/**
 * GlobalShortcuts — registers global keyboard shortcuts (e.g. `?` for help).
 * Renders the ShortcutsModal when triggered.
 *
 * Placed in the root layout so shortcuts work on every page.
 *
 * @module components/shared/GlobalShortcuts
 * @since Phase 4 — March 2026
 */

'use client';

import { useState, useCallback } from 'react';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { ShortcutsModal } from './ShortcutsModal';

export function GlobalShortcuts() {
  const [isOpen, setIsOpen] = useState(false);

  const toggleModal = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  useKeyboardShortcuts([
    {
      key: '?',
      handler: toggleModal,
      description: 'Show keyboard shortcuts',
      view: 'global',
    },
  ]);

  return <ShortcutsModal open={isOpen} onClose={closeModal} />;
}
