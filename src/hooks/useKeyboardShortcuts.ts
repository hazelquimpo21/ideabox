/**
 * useKeyboardShortcuts — global keyboard shortcut manager.
 * Implements §7 "Keyboard Shortcuts" from VIEW_REDESIGN_PLAN.md (Phase 4).
 *
 * Registers a single `keydown` listener on `document` (not per-shortcut).
 * Ignores shortcuts when focus is inside form elements to prevent conflicts.
 *
 * @module hooks/useKeyboardShortcuts
 * @since Phase 4 — March 2026
 */

'use client';

import { useEffect, useRef } from 'react';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('KeyboardShortcuts');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ShortcutConfig {
  /** The key to listen for, e.g. 'k', 'n', 'j', '?' */
  key: string;
  /** Modifier keys required (metaKey, ctrlKey, shiftKey, altKey) */
  modifiers?: ('meta' | 'ctrl' | 'shift' | 'alt')[];
  /** Handler function to call when shortcut is triggered */
  handler: () => void;
  /** Human-readable description for the help modal */
  description: string;
  /** Which view this shortcut belongs to */
  view?: 'home' | 'inbox' | 'calendar' | 'global';
  /** Whether the shortcut is currently enabled (default: true) */
  enabled?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Elements where keyboard shortcuts should be suppressed. */
const FORM_ELEMENTS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isFormElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  if (FORM_ELEMENTS.has(target.tagName)) return true;
  if (target.isContentEditable) return true;
  return false;
}

function matchesModifiers(
  event: KeyboardEvent,
  modifiers: ('meta' | 'ctrl' | 'shift' | 'alt')[] | undefined,
): boolean {
  const required = new Set(modifiers ?? []);
  if (required.has('meta') !== event.metaKey) return false;
  if (required.has('ctrl') !== event.ctrlKey) return false;
  if (required.has('shift') !== event.shiftKey) return false;
  if (required.has('alt') !== event.altKey) return false;
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Registers keyboard shortcuts with a single document-level listener.
 * Handlers should be wrapped in useCallback by the consumer.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]): void {
  // Store shortcuts in a ref to avoid re-registering the listener on every render
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isFormElement(event.target)) return;

      for (const shortcut of shortcutsRef.current) {
        if (shortcut.enabled === false) continue;

        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
        if (!keyMatch) continue;
        if (!matchesModifiers(event, shortcut.modifiers)) continue;

        event.preventDefault();
        logger.info('Shortcut activated', {
          key: shortcut.key,
          view: shortcut.view ?? 'global',
        });
        shortcut.handler();
        return;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []); // Empty deps — ref pattern keeps handlers current without re-registering
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHORTCUT DEFINITIONS (for help modal)
// ═══════════════════════════════════════════════════════════════════════════════

/** Static list of all available shortcuts, used by ShortcutsModal. */
export function getShortcutDefinitions(): Omit<ShortcutConfig, 'handler'>[] {
  return [
    { key: 'n', description: 'Act on top priority', view: 'home' },
    {
      key: 'k',
      modifiers: ['meta'],
      description: 'Focus search',
      view: 'inbox',
    },
    { key: 'j', description: 'Next item', view: 'inbox' },
    { key: 'k', description: 'Previous item', view: 'inbox' },
    { key: 'e', description: 'Archive email', view: 'inbox' },
    { key: 's', description: 'Star / unstar email', view: 'inbox' },
    { key: 'j', description: 'Next item', view: 'calendar' },
    { key: 'k', description: 'Previous item', view: 'calendar' },
    { key: '?', description: 'Show keyboard shortcuts', view: 'global' },
  ];
}
