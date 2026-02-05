/**
 * ModalEmailItem Component
 *
 * Email card wrapper for CategoryModal with hover archive button.
 * Wraps the EmailCard with an overlay archive action.
 *
 * @module components/discover/ModalEmailItem
 * @since Jan 2026 - Extracted from CategoryModal
 */

'use client';

import { Archive } from 'lucide-react';
import { EmailCard } from '@/components/categories/EmailCard';
import type { Email } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ModalEmailItemProps {
  /** The email to display */
  email: Email;
  /** Handler when the email card is clicked */
  onClick: () => void;
  /** Handler when the star is toggled */
  onToggleStar: () => void;
  /** Handler when the archive button is clicked */
  onArchive: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Email item with hover archive button for modal view.
 *
 * @example
 * ```tsx
 * <ModalEmailItem
 *   email={email}
 *   onClick={() => handleEmailClick(email)}
 *   onToggleStar={() => handleToggleStar(email)}
 *   onArchive={() => handleArchiveEmail(email)}
 * />
 * ```
 */
export function ModalEmailItem({
  email,
  onClick,
  onToggleStar,
  onArchive,
}: ModalEmailItemProps) {
  return (
    <div className="relative group">
      <EmailCard
        email={email}
        onClick={onClick}
        onToggleStar={onToggleStar}
        enhanced
      />
      {/* Quick archive button on hover */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onArchive();
        }}
        className="absolute top-2 right-10 p-1.5 rounded-md bg-background/80 border opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
        title="Archive"
      >
        <Archive className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}

export default ModalEmailItem;
