/**
 * ContentDigestSection Component
 *
 * Renders the AI-generated content digest for an email: gist, key points,
 * and extracted links. Designed for use inside the EmailDetail analysis card.
 *
 * @module components/email/ContentDigestSection
 * @since February 2026
 */

'use client';

import * as React from 'react';
import { Badge } from '@/components/ui';
import { FileText, ExternalLink, Link2 } from 'lucide-react';
import type { ContentDigestResult } from '@/hooks/useEmailAnalysis';

// ═══════════════════════════════════════════════════════════════════════════════
// LINK TYPE STYLING
// ═══════════════════════════════════════════════════════════════════════════════

const LINK_TYPE_COLORS: Record<string, string> = {
  article: 'text-blue-600 bg-blue-50',
  registration: 'text-purple-600 bg-purple-50',
  document: 'text-amber-600 bg-amber-50',
  video: 'text-red-600 bg-red-50',
  product: 'text-emerald-600 bg-emerald-50',
  tool: 'text-cyan-600 bg-cyan-50',
  social: 'text-pink-600 bg-pink-50',
  unsubscribe: 'text-gray-400 bg-gray-50',
  other: 'text-gray-600 bg-gray-50',
};

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENT TYPE LABELS
// ═══════════════════════════════════════════════════════════════════════════════

const CONTENT_TYPE_LABELS: Record<string, string> = {
  single_topic: 'Single Topic',
  multi_topic_digest: 'Digest',
  curated_links: 'Curated Links',
  personal_update: 'Personal Update',
  transactional: 'Transactional',
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export interface ContentDigestSectionProps {
  digest: ContentDigestResult;
}

export function ContentDigestSection({ digest }: ContentDigestSectionProps) {
  const mainLinks = digest.links.filter(l => l.isMainContent && l.type !== 'unsubscribe');
  const otherLinks = digest.links.filter(l => !l.isMainContent && l.type !== 'unsubscribe');

  return (
    <div className="pt-3 border-t">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="h-4 w-4 text-blue-500" />
        <span className="text-sm font-medium">Content Digest</span>
        {digest.contentType && (
          <Badge variant="outline" className="text-xs">
            {CONTENT_TYPE_LABELS[digest.contentType] || digest.contentType}
          </Badge>
        )}
      </div>

      {/* Gist */}
      {digest.gist && (
        <p className="text-sm text-muted-foreground pl-6 mb-2 border-l-2 border-blue-200 ml-1">
          {digest.gist}
        </p>
      )}

      {/* Key Points */}
      {digest.keyPoints.length > 0 && (
        <div className="pl-6 mb-2">
          <ul className="space-y-1">
            {digest.keyPoints.map((kp, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-blue-400 mt-1 shrink-0">&#8226;</span>
                <div className="flex-1">
                  <span>{kp.point}</span>
                  {kp.relevance && (
                    <span className="text-xs text-muted-foreground ml-1">
                      &mdash; {kp.relevance}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Highlighted Topics */}
      {digest.topicsHighlighted && digest.topicsHighlighted.length > 0 && (
        <div className="flex flex-wrap gap-1 pl-6 mb-2">
          {digest.topicsHighlighted.map((topic, i) => (
            <span key={i} className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {topic}
            </span>
          ))}
        </div>
      )}

      {/* Main Content Links */}
      {mainLinks.length > 0 && (
        <div className="pl-6 space-y-1.5 mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Key Links</span>
          {mainLinks.map((link, i) => (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 p-1.5 rounded hover:bg-muted/50 transition-colors group"
            >
              <ExternalLink className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium group-hover:text-blue-600 transition-colors">
                  {link.title || link.url}
                </span>
                {link.description && (
                  <p className="text-xs text-muted-foreground truncate">{link.description}</p>
                )}
              </div>
              <Badge variant="outline" className={`text-[10px] shrink-0 ${LINK_TYPE_COLORS[link.type] || LINK_TYPE_COLORS.other}`}>
                {link.type}
              </Badge>
            </a>
          ))}
        </div>
      )}

      {/* Other Links (collapsed by default if many) */}
      {otherLinks.length > 0 && (
        <details className="pl-6">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors flex items-center gap-1">
            <Link2 className="h-3 w-3" />
            {otherLinks.length} more link{otherLinks.length > 1 ? 's' : ''}
          </summary>
          <div className="space-y-1 mt-1.5">
            {otherLinks.map((link, i) => (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-0.5"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span className="truncate">{link.title || link.url}</span>
                <Badge variant="outline" className={`text-[10px] shrink-0 ${LINK_TYPE_COLORS[link.type] || LINK_TYPE_COLORS.other}`}>
                  {link.type}
                </Badge>
              </a>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export default ContentDigestSection;
