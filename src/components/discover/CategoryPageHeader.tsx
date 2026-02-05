/**
 * CategoryPageHeader Component
 *
 * Header for the category detail page with back button, title, and counts.
 *
 * @module components/discover/CategoryPageHeader
 * @since Jan 2026
 */

'use client';

import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { CategoryDisplay } from '@/types/discovery';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CategoryPageHeaderProps {
  /** Category display info (icon, label, description) */
  categoryDisplay: CategoryDisplay | null;
  /** Raw category slug (fallback if no display info) */
  category: string;
  /** Total number of emails */
  totalCount: number;
  /** Number of unread emails */
  unreadCount: number;
  /** Handler for back button */
  onBack: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function CategoryPageHeader({
  categoryDisplay,
  category,
  totalCount,
  unreadCount,
  onBack,
}: CategoryPageHeaderProps) {
  return (
    <div className="flex items-center gap-4 mb-6">
      <Button variant="ghost" size="icon" onClick={onBack}>
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <div className="flex items-center gap-3 flex-1">
        <span className="text-3xl">{categoryDisplay?.icon || '📧'}</span>
        <div>
          <h1 className="text-2xl font-bold">
            {categoryDisplay?.label || category}
          </h1>
          <p className="text-sm text-muted-foreground">
            {categoryDisplay?.description}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-lg px-3 py-1">
          {totalCount} emails
        </Badge>
        {unreadCount > 0 && (
          <Badge variant="default" className="bg-blue-500 text-lg px-3 py-1">
            {unreadCount} unread
          </Badge>
        )}
      </div>
    </div>
  );
}

export default CategoryPageHeader;
