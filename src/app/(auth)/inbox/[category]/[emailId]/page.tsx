/**
 * Inbox Email Detail Page — Single Email View
 *
 * Full-page view of a single email with AI analysis.
 * Route: /inbox/[category]/[emailId]
 *
 * @module app/(auth)/inbox/[category]/[emailId]/page
 */

'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Archive, Star, Mail, MailOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmailDetail } from '@/components/email/EmailDetail';
import { createClient } from '@/lib/supabase/client';
import { createLogger, logDiscover } from '@/lib/utils/logger';
import {
  type EmailCategory,
  CATEGORY_DISPLAY,
  EMAIL_CATEGORIES_SET,
} from '@/types/discovery';
import type { Email } from '@/types/database';

const logger = createLogger('InboxEmailDetailPage');

export default function InboxEmailDetailPage() {
  const router = useRouter();
  const params = useParams();
  const category = params.category as string;
  const emailId = params.emailId as string;
  const supabase = React.useMemo(() => createClient(), []);

  const isValidCategory = EMAIL_CATEGORIES_SET.has(category);
  const categoryDisplay = isValidCategory
    ? CATEGORY_DISPLAY[category as EmailCategory]
    : null;

  const [email, setEmail] = React.useState<Email | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);

  // ─── Fetch Email ────────────────────────────────────────────────────────────

  const fetchEmail = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);

    logger.start('Fetching email', { emailId, category });

    try {
      const { data, error: queryError } = await supabase
        .from('emails')
        .select('*')
        .eq('id', emailId)
        .single();

      if (queryError) {
        if (queryError.code === 'PGRST116') {
          throw new Error('Email not found');
        }
        throw new Error(queryError.message);
      }

      setEmail(data);

      if (data && !data.is_read) {
        await supabase
          .from('emails')
          .update({ is_read: true })
          .eq('id', emailId);
        setEmail(prev => prev ? { ...prev, is_read: true } : null);
      }

      logger.success('Email fetched', { emailId, subject: data?.subject });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load email';
      setError(message);
      logger.error('Failed to fetch email', { emailId, error: message });
    } finally {
      setIsLoading(false);
    }
  }, [emailId, category, supabase]);

  React.useEffect(() => {
    fetchEmail();
  }, [fetchEmail]);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleBack = () => {
    router.push('/inbox');
  };

  const handleStar = async () => {
    if (!email) return;

    const newStarred = !email.is_starred;
    setEmail(prev => prev ? { ...prev, is_starred: newStarred } : null);

    try {
      const { error: updateError } = await supabase
        .from('emails')
        .update({ is_starred: newStarred })
        .eq('id', emailId);

      if (updateError) throw updateError;

      logDiscover.emailAction({ category, emailId, action: newStarred ? 'star' : 'unstar' });
    } catch (err) {
      setEmail(prev => prev ? { ...prev, is_starred: !newStarred } : null);
      logger.error('Failed to toggle star', { error: String(err) });
    }
  };

  const handleArchive = async () => {
    if (!email) return;

    try {
      const { error: updateError } = await supabase
        .from('emails')
        .update({ is_archived: true })
        .eq('id', emailId);

      if (updateError) throw updateError;

      logDiscover.emailAction({ category, emailId, action: 'archive' });
      router.push('/inbox');
    } catch (err) {
      logger.error('Failed to archive', { error: String(err) });
    }
  };

  const handleToggleRead = async () => {
    if (!email) return;

    const newRead = !email.is_read;
    setEmail(prev => prev ? { ...prev, is_read: newRead } : null);

    try {
      const { error: updateError } = await supabase
        .from('emails')
        .update({ is_read: newRead })
        .eq('id', emailId);

      if (updateError) throw updateError;
    } catch (err) {
      setEmail(prev => prev ? { ...prev, is_read: !newRead } : null);
      logger.error('Failed to toggle read', { error: String(err) });
    }
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const response = await fetch(`/api/emails/${emailId}/analyze`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Analysis failed');
      }

      await fetchEmail();
    } catch (err) {
      logger.error('Failed to analyze', { error: String(err) });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ─── Loading State ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <div className="flex items-center gap-4 mb-6">
          <Skeleton className="h-10 w-10 rounded" />
          <div className="flex-1">
            <Skeleton className="h-6 w-48 mb-2" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="border rounded-lg p-6 space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-px w-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  // ─── Error State ────────────────────────────────────────────────────────────

  if (error || !email) {
    return (
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <h1 className="text-2xl font-bold mb-2">Email Not Found</h1>
          <p className="text-muted-foreground mb-6">
            {error || 'This email could not be loaded.'}
          </p>
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Inbox
          </Button>
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={handleBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2 flex-1">
          <span className="text-2xl">{categoryDisplay?.icon || '📧'}</span>
          <span className="text-sm text-muted-foreground">
            {categoryDisplay?.label || category}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleRead}
            title={email.is_read ? 'Mark as unread' : 'Mark as read'}
          >
            {email.is_read ? (
              <MailOpen className="h-5 w-5" />
            ) : (
              <Mail className="h-5 w-5 text-blue-500" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleStar}
            title={email.is_starred ? 'Remove star' : 'Star email'}
          >
            <Star
              className={`h-5 w-5 ${
                email.is_starred
                  ? 'fill-yellow-400 text-yellow-400'
                  : 'text-muted-foreground'
              }`}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleArchive}
            title="Archive email"
          >
            <Archive className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <EmailDetail
          email={email}
          onStar={handleStar}
          onArchive={handleArchive}
          onToggleRead={handleToggleRead}
          onAnalyze={handleAnalyze}
          isAnalyzing={isAnalyzing}
        />
      </div>

      <div className="flex justify-between items-center mt-6 pt-6 border-t">
        <Button variant="outline" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Inbox
        </Button>
      </div>
    </div>
  );
}
