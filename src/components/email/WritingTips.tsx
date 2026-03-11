/**
 * WritingTips — AI-generated writing suggestions for email compose.
 *
 * Shows collapsible writing tips from email_style_ideas analysis data
 * when replying to emails. Tips include subject line suggestions,
 * tone recommendations, and CTA ideas.
 *
 * Dismissible per-email via localStorage to avoid repeat showing.
 *
 * @module components/email/WritingTips
 * @since March 2026 — Phase 2 Compose Flow Enhancement
 */

'use client';

import * as React from 'react';
import { Sparkles, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('WritingTips');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Structure of email_style_ideas from analysis */
export interface EmailStyleIdeas {
  subject_line_suggestions?: string[];
  tone_tips?: string[];
  cta_ideas?: string[];
  writing_style?: string;
}

export interface WritingTipsProps {
  /** Style ideas from email analysis */
  styleIdeas: EmailStyleIdeas;
  /** Email ID for dismiss state persistence */
  emailId: string;
  /** Whether this is a reply (affects tip copy) */
  isReply?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DISMISS PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════════

const DISMISS_KEY_PREFIX = 'ideabox:writing-tips-dismissed:';

function isDismissed(emailId: string): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(`${DISMISS_KEY_PREFIX}${emailId}`) === 'true';
}

function setDismissed(emailId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`${DISMISS_KEY_PREFIX}${emailId}`, 'true');
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function WritingTips({ styleIdeas, emailId, isReply = false }: WritingTipsProps) {
  const [isOpen, setIsOpen] = React.useState(true);
  const [hidden, setHidden] = React.useState(false);

  // Check if previously dismissed on mount
  React.useEffect(() => {
    if (isDismissed(emailId)) {
      setHidden(true);
    }
  }, [emailId]);

  // Build tips list from available data
  const tips = React.useMemo(() => {
    const result: Array<{ label: string; text: string }> = [];

    // Subject line suggestion
    if (styleIdeas.subject_line_suggestions?.length) {
      const suggestion = styleIdeas.subject_line_suggestions[0]!;
      result.push({
        label: isReply ? 'Subject idea' : 'Subject',
        text: isReply ? `Consider: ${suggestion}` : suggestion,
      });
    }

    // Tone tip
    if (styleIdeas.tone_tips?.length) {
      result.push({
        label: 'Tone',
        text: styleIdeas.tone_tips[0]!,
      });
    }

    // CTA idea
    if (styleIdeas.cta_ideas?.length) {
      result.push({
        label: 'Call to action',
        text: styleIdeas.cta_ideas[0]!,
      });
    }

    return result.slice(0, 3); // Max 3 tips
  }, [styleIdeas, isReply]);

  // Don't render if dismissed, hidden, or no tips
  if (hidden || tips.length === 0) return null;

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    logger.info('Writing tips dismissed', { emailId: emailId.substring(0, 8) });
    setDismissed(emailId);
    setHidden(true);
  };

  return (
    <div className="border border-border/50 rounded-lg bg-muted/20 overflow-hidden">
      {/* Header — click to toggle */}
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        <span className="text-xs font-medium text-muted-foreground">
          Writing tips
        </span>
        <span className="flex-1" />
        {/* Dismiss button */}
        <button
          type="button"
          className="p-0.5 rounded hover:bg-muted transition-colors"
          onClick={handleDismiss}
          aria-label="Dismiss writing tips"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      {/* Tips content — collapsible */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-2.5 space-y-1.5">
            {tips.map((tip, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wide shrink-0 mt-0.5 w-16">
                  {tip.label}
                </span>
                <p className="text-xs text-muted-foreground">{tip.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
