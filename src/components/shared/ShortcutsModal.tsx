/**
 * ShortcutsModal — help modal showing all available keyboard shortcuts.
 * Implements §7 from VIEW_REDESIGN_PLAN.md (Phase 4).
 *
 * Triggered by the `?` key globally. Uses Radix Dialog for accessibility
 * (focus trapping, Escape to close, backdrop click to close).
 *
 * @module components/shared/ShortcutsModal
 * @since Phase 4 — March 2026
 */

'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ShortcutHint } from './ShortcutHint';
import { getShortcutDefinitions } from '@/hooks/useKeyboardShortcuts';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DISPLAY HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Convert a shortcut config into display key labels for ShortcutHint. */
function toKeyLabels(
  key: string,
  modifiers?: ('meta' | 'ctrl' | 'shift' | 'alt')[],
): string[] {
  const labels: string[] = [];
  if (modifiers?.includes('meta')) labels.push('⌘');
  if (modifiers?.includes('ctrl')) labels.push('Ctrl');
  if (modifiers?.includes('shift')) labels.push('⇧');
  if (modifiers?.includes('alt')) labels.push('Alt');
  labels.push(key.toUpperCase());
  return labels;
}

/** View label for section headers */
const VIEW_LABELS: Record<string, string> = {
  home: 'Home',
  inbox: 'Inbox',
  calendar: 'Calendar',
  global: 'Global',
};

const VIEW_ORDER = ['home', 'inbox', 'calendar', 'global'] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  const definitions = getShortcutDefinitions();

  // Group shortcuts by view
  const groups = VIEW_ORDER.map((view) => ({
    view,
    label: VIEW_LABELS[view] ?? view,
    shortcuts: definitions.filter((d) => d.view === view),
  })).filter((g) => g.shortcuts.length > 0);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {groups.map(({ view, label, shortcuts }) => (
            <div key={view}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {label}
              </h3>
              <div className="space-y-1.5">
                {shortcuts.map((shortcut, i) => (
                  <div
                    key={`${shortcut.key}-${i}`}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-sm">{shortcut.description}</span>
                    <ShortcutHint
                      keys={toKeyLabels(shortcut.key, shortcut.modifiers)}
                      className="inline-flex"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
