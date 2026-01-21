/**
 * Email Detail Page
 *
 * Displays a single email by ID with full detail view.
 * Used when navigating directly to an email (e.g., from contact detail page).
 *
 * @module app/(auth)/inbox/[id]/page
 */

'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button, Card, CardContent } from '@/components/ui';
import { EmailDetail } from '@/components/email';
import { createLogger } from '@/lib/utils/logger';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { Email } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('EmailDetailPage');

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function EmailDetailPage() {
  const params = useParams();
  const router = useRouter();
  const emailId = params.id as string;
  const supabase = createClient();

  const [email, setEmail] = React.useState<Email | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch Email
  // ─────────────────────────────────────────────────────────────────────────────

  const fetchEmail = React.useCallback(async () => {
    logger.start('Fetching email', { emailId });
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/emails/${emailId}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Email not found');
        }
        throw new Error('Failed to load email');
      }

      const result = await response.json();
      const emailData = result.data || result;
      setEmail(emailData);

      // Mark as read if not already
      if (!emailData.is_read) {
        await fetch(`/api/emails/${emailId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_read: true }),
        });
      }

      logger.success('Email loaded', { emailId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to load email', { error: message });
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [emailId]);

  React.useEffect(() => {
    if (emailId) {
      fetchEmail();
    }
  }, [emailId, fetchEmail]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Action Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const handleStar = async (id: string) => {
    if (!email) return;

    const newStarred = !email.is_starred;
    setEmail({ ...email, is_starred: newStarred });

    try {
      await fetch(`/api/emails/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_starred: newStarred }),
      });
      toast.success(newStarred ? 'Email starred' : 'Star removed');
    } catch {
      setEmail({ ...email, is_starred: !newStarred });
      toast.error('Failed to update star');
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await fetch(`/api/emails/${id}`, {
        method: 'DELETE',
      });
      toast.success('Email archived');
      router.push('/inbox');
    } catch {
      toast.error('Failed to archive email');
    }
  };

  const handleToggleRead = async (id: string) => {
    if (!email) return;

    const newRead = !email.is_read;
    setEmail({ ...email, is_read: newRead });

    try {
      await fetch(`/api/emails/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_read: newRead }),
      });
      toast.success(newRead ? 'Marked as read' : 'Marked as unread');
    } catch {
      setEmail({ ...email, is_read: !newRead });
      toast.error('Failed to update read status');
    }
  };

  const handleAnalyze = async (id: string) => {
    setIsAnalyzing(true);
    try {
      const response = await fetch(`/api/emails/${id}/analyze`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Analysis failed');
      }

      toast.success('Email analyzed successfully');
      // Refresh email to get analysis data
      await fetchEmail();
    } catch {
      toast.error('Failed to analyze email');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: Loading State
  // ─────────────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="container max-w-4xl py-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-muted-foreground">Loading email...</span>
        </div>
        <Card>
          <CardContent className="py-12 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: Error State
  // ─────────────────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="container max-w-4xl py-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </div>
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center gap-4">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <h2 className="text-lg font-medium">{error}</h2>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                {error === 'Email not found'
                  ? 'This email may have been deleted or you may not have permission to view it.'
                  : 'An error occurred while loading the email. Please try again.'}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => router.back()}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Go Back
                </Button>
                <Button onClick={fetchEmail}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: No Email
  // ─────────────────────────────────────────────────────────────────────────────

  if (!email) {
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: Email Detail
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="container max-w-4xl py-6">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          <span className="sr-only">Go back</span>
        </Button>
        <h1 className="text-lg font-medium truncate flex-1">
          {email.subject || '(No subject)'}
        </h1>
      </div>
      <Card>
        <EmailDetail
          email={email}
          onStar={handleStar}
          onArchive={handleArchive}
          onToggleRead={handleToggleRead}
          onAnalyze={handleAnalyze}
          isAnalyzing={isAnalyzing}
        />
      </Card>
    </div>
  );
}
