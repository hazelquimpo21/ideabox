/**
 * PriorityEmailList — emails grouped by reply_worthiness.
 * Implements §5d from VIEW_REDESIGN_PLAN.md.
 *
 * Groups emails into Must Reply / Should Reply / Optional using
 * CollapsibleSection. Each row shows a mini score breakdown on
 * hover (importance, action, missability) via preview-tier tooltip.
 *
 * @module components/inbox/PriorityEmailList
 * @since February 2026 — Inbox UI Redesign v2
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardContent, Button, Skeleton } from '@/components/ui';
import { AlertTriangle, RefreshCw, ArrowRight, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';
import { staggeredEntrance } from '@/lib/utils/animations';
import { CollapsibleSection } from '@/components/shared/CollapsibleSection';
import { Tooltip } from '@/components/ui/tooltip';
import { EmailHoverCard } from '@/components/email/EmailHoverCard';
import { SenderLogo } from './SenderLogo';
import type { Email } from '@/types/database';

const logger = createLogger('PriorityEmailList');

interface PriorityEmail {
  id: string;
  sender_name: string | null;
  sender_email: string;
  subject: string | null;
  category: string | null;
  priority_score: number | null;
  date: string;
  snippet: string | null;
  gist: string | null;
  reply_worthiness: string | null;
  importance_score: number | null;
  action_score: number | null;
  missability_score: number | null;
}

const MAX_EMAILS = 50;

/** Reply worthiness group config — order matters for display */
const REPLY_GROUPS = [
  { key: 'must_reply', label: 'Must Reply', accent: 'text-red-600 dark:text-red-400' },
  { key: 'should_reply', label: 'Should Reply', accent: 'text-amber-600 dark:text-amber-400' },
  { key: 'optional_reply', label: 'Optional', accent: 'text-muted-foreground' },
  { key: 'no_reply', label: 'No Reply Needed', accent: 'text-muted-foreground/60' },
] as const;

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Score breakdown bar for the hover tooltip */
function ScoreBar({ label, score }: { label: string; score: number | null }) {
  const pct = Math.round((score ?? 0) * 100);
  const filled = Math.round(pct / 20); // 0-5 blocks
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-muted-foreground">{label}</span>
      <div className="flex gap-px">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={cn('w-3 h-2 rounded-sm', i < filled ? 'bg-foreground/70' : 'bg-muted')} />
        ))}
      </div>
      <span className="text-muted-foreground tabular-nums w-8">{score != null ? score.toFixed(2) : '—'}</span>
    </div>
  );
}

const PriorityRow = React.memo(function PriorityRow({
  email,
  onEmailSelect,
}: {
  email: PriorityEmail;
  onEmailSelect?: (email: PriorityEmail) => void;
}) {
  const previewText = email.gist || email.snippet;

  const scoreTooltip = (
    <div className="space-y-1.5">
      <p className="text-xs font-medium mb-2">Score breakdown</p>
      <ScoreBar label="Importance" score={email.importance_score} />
      <ScoreBar label="Action" score={email.action_score} />
      <ScoreBar label="Missability" score={email.missability_score} />
    </div>
  );

  const content = (
    <div className="flex items-center gap-3 w-full">
      <SenderLogo senderEmail={email.sender_email} size={28} className="rounded-full shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-medium text-sm truncate">
            {email.sender_name || email.sender_email.split('@')[0]}
          </span>
          <span className="flex-1" />
          <span className="text-xs text-muted-foreground/70 shrink-0 tabular-nums">
            {formatRelativeDate(email.date)}
          </span>
        </div>
        <EmailHoverCard email={email as unknown as Email}>
          <p className="text-sm truncate">{email.subject || '(No subject)'}</p>
        </EmailHoverCard>
        {previewText && <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{previewText}</p>}
      </div>
      <Tooltip content={scoreTooltip} variant="preview">
        <span className="text-xs text-muted-foreground/50 shrink-0">
          {email.priority_score != null ? email.priority_score : '—'}
        </span>
      </Tooltip>
      <ArrowRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
    </div>
  );

  if (onEmailSelect) {
    return (
      <button type="button" onClick={() => onEmailSelect(email)}
        data-email-row data-email-id={email.id}
        className="flex items-center gap-3 p-3 border-b border-border/40 hover:bg-muted/30 transition-colors last:border-b-0 w-full text-left">
        {content}
      </button>
    );
  }

  return (
    <Link href={`/inbox/${email.category || 'personal'}/${email.id}?from=priority`}
      data-email-row data-email-id={email.id}
      className="flex items-center gap-3 p-3 border-b border-border/40 hover:bg-muted/30 transition-colors last:border-b-0">
      {content}
    </Link>
  );
});

export function PriorityEmailList({ onEmailSelect }: { onEmailSelect?: (email: PriorityEmail) => void } = {}) {
  const [emails, setEmails] = React.useState<PriorityEmail[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);
  const supabase = React.useMemo(() => createClient(), []);

  // Stagger animation guard — only animate on initial mount
  const hasMounted = React.useRef(false);
  React.useEffect(() => { hasMounted.current = true; }, []);

  const fetchEmails = React.useCallback(async () => {
    logger.start('Fetching priority-ranked emails', { limit: MAX_EMAILS });
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('emails')
        .select('id, sender_name, sender_email, subject, category, priority_score, date, snippet, gist, reply_worthiness, importance_score, action_score, missability_score')
        .not('priority_score', 'is', null)
        .order('priority_score', { ascending: false })
        .limit(MAX_EMAILS);
      if (queryError) throw new Error(queryError.message);
      const results = (data || []) as PriorityEmail[];
      setEmails(results);
      logger.success('Fetched priority emails', { count: results.length });
    } catch (err) {
      const fetchError = err instanceof Error ? err : new Error('Failed to fetch emails');
      logger.error('Failed to fetch priority emails', { error: fetchError.message });
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  React.useEffect(() => { fetchEmails(); }, [fetchEmails]);

  // Group emails by reply_worthiness
  const groups = React.useMemo(() => {
    const grouped: Record<string, PriorityEmail[]> = {};
    for (const email of emails) {
      const key = email.reply_worthiness || 'no_reply';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(email);
    }
    logger.debug('Priority groups', {
      must: grouped['must_reply']?.length ?? 0,
      should: grouped['should_reply']?.length ?? 0,
      optional: grouped['optional_reply']?.length ?? 0,
    });
    return grouped;
  }, [emails]);

  if (isLoading) {
    return (
      <div className="space-y-0">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 p-4 border-b border-border/40">
            <Skeleton className="h-7 w-7 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-3/4" />
            </div>
            <Skeleton className="h-4 w-14" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="py-6">
          <div className="flex items-center gap-2 text-destructive mb-2">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">Failed to load priority emails</span>
          </div>
          <p className="text-sm text-muted-foreground mb-3">{error.message}</p>
          <Button variant="outline" size="sm" onClick={fetchEmails} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Inbox className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">Nothing urgent</h3>
        <p className="text-muted-foreground max-w-sm">
          Emails will appear here once they have been analyzed and scored by AI.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">{emails.length}</span> emails by reply priority
        </p>
        <Button variant="outline" size="sm" onClick={fetchEmails} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="space-y-2">
        {REPLY_GROUPS.map(({ key, label, accent }, groupIdx) => {
          const groupEmails = groups[key];
          if (!groupEmails || groupEmails.length === 0) return null;
          const entrance = !hasMounted.current
            ? staggeredEntrance(groupIdx)
            : { className: '', style: {} as React.CSSProperties };
          return (
            <div key={key} className={entrance.className} style={entrance.style}>
              <CollapsibleSection
                title={label}
                count={groupEmails.length}
                defaultOpen={key === 'must_reply' || key === 'should_reply'}
                className={accent}
              >
                <Card className="overflow-hidden">
                  <CardContent className="p-0">
                    {groupEmails.map((email) => (
                      <PriorityRow key={email.id} email={email} onEmailSelect={onEmailSelect} />
                    ))}
                  </CardContent>
                </Card>
              </CollapsibleSection>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PriorityEmailList;
