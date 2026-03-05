/**
 * DiscoveryItem — unified display for insights, news, and links.
 * Implements §5f "Consolidated Discoveries" from VIEW_REDESIGN_PLAN.md.
 *
 * Replaces the separate InsightsFeed/NewsFeed/LinksFeed item renderers
 * with a single, consistent component that handles all discovery types.
 *
 * Each item shows: type icon, content, confidence badge (if low),
 * source attribution (clickable), and save/dismiss actions.
 *
 * @module components/inbox/DiscoveryItem
 * @since Phase 2 — March 2026
 */

'use client';

import * as React from 'react';
import { Brain, Newspaper, Link2, Bookmark, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';
import { Tooltip } from '@/components/ui/tooltip';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui';

const logger = createLogger('DiscoveryItem');

export interface DiscoveryItemProps {
  type: 'insight' | 'news' | 'link';
  title: string;
  content: string;
  confidence?: number;
  sourceEmail?: { sender: string; subject: string; id: string };
  onSave: () => void;
  onDismiss: () => void;
  className?: string;
}

const TYPE_CONFIG = {
  insight: { icon: Brain, label: 'Insight', color: 'text-violet-500' },
  news: { icon: Newspaper, label: 'News', color: 'text-blue-500' },
  link: { icon: Link2, label: 'Link', color: 'text-emerald-500' },
} as const;

export const DiscoveryItem = React.memo(function DiscoveryItem({
  type,
  title,
  content,
  confidence,
  sourceEmail,
  onSave,
  onDismiss,
  className,
}: DiscoveryItemProps) {
  const config = TYPE_CONFIG[type];
  const TypeIcon = config.icon;
  const isLowConfidence = confidence != null && confidence < 0.7;

  const handleSave = React.useCallback(() => {
    logger.info('Discovery item saved', { type, title: title.slice(0, 50) });
    onSave();
  }, [type, title, onSave]);

  const handleDismiss = React.useCallback(() => {
    logger.info('Discovery item dismissed', { type, title: title.slice(0, 50) });
    onDismiss();
  }, [type, title, onDismiss]);

  const emailPreview = sourceEmail ? (
    <div className="space-y-0.5">
      <p className="text-xs font-medium">{sourceEmail.sender}</p>
      <p className="text-xs text-muted-foreground truncate">{sourceEmail.subject}</p>
    </div>
  ) : null;

  return (
    <Card elevation="flat" className={cn('p-3', className)}>
      <div className="flex items-start gap-3">
        {/* Type icon */}
        <div className={cn('mt-0.5 shrink-0', config.color)}>
          <TypeIcon className="h-4 w-4" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title */}
          <div className="flex items-center gap-2 mb-0.5">
            <h4 className="text-sm font-medium truncate">{title}</h4>
            {isLowConfidence && (
              <span className="text-[10px] text-muted-foreground/60 shrink-0 px-1 py-0.5 rounded bg-muted/50">
                Low confidence
              </span>
            )}
          </div>

          {/* Body text */}
          <p className="text-xs text-muted-foreground line-clamp-3 mb-1.5">{content}</p>

          {/* Source attribution */}
          {sourceEmail && (
            <Tooltip content={emailPreview} variant="preview">
              <a
                href={`/inbox/${sourceEmail.id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-[10px] text-muted-foreground/60 hover:text-foreground/80 transition-colors truncate inline-block max-w-full"
              >
                From {sourceEmail.sender} · {sourceEmail.subject}
              </a>
            </Tooltip>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          <Tooltip content="Save" variant="info">
            <Button variant="ghost" size="sm" onClick={handleSave} className="h-7 w-7 p-0">
              <Bookmark className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </Tooltip>
          <Tooltip content="Dismiss" variant="info">
            <Button variant="ghost" size="sm" onClick={handleDismiss} className="h-7 w-7 p-0">
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </Tooltip>
        </div>
      </div>
    </Card>
  );
});

export default DiscoveryItem;
