'use client';

/**
 * Credential Expiry Banner
 *
 * Displays a prominent warning when one or more Gmail accounts have
 * expired or revoked OAuth credentials. Provides a direct link to
 * reconnect each affected account.
 *
 * @module components/layout/CredentialExpiryBanner
 * @since March 2026
 */

import * as React from 'react';
import { AlertTriangle, X, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui';
import { useSyncStatus } from '@/hooks';
import { useAuth } from '@/lib/auth';
import type { AccountAuthError } from '@/hooks/useSyncStatus';

/**
 * Banner that appears when Gmail account credentials have expired.
 * Shows which accounts need reconnection and provides action buttons.
 */
export function CredentialExpiryBanner() {
  const { accountsNeedingReauth } = useSyncStatus();
  const { connectAdditionalAccount } = useAuth();
  const [dismissed, setDismissed] = React.useState(false);
  const [reconnecting, setReconnecting] = React.useState<string | null>(null);

  // Reset dismissed state when the list of accounts changes
  React.useEffect(() => {
    if (accountsNeedingReauth.length > 0) {
      setDismissed(false);
    }
  }, [accountsNeedingReauth.length]);

  if (dismissed || accountsNeedingReauth.length === 0) {
    return null;
  }

  const handleReconnect = async () => {
    setReconnecting('all');
    try {
      await connectAdditionalAccount();
      // Will redirect to OAuth flow
    } catch {
      setReconnecting(null);
    }
  };

  const accountCount = accountsNeedingReauth.length;
  const emails = accountsNeedingReauth.map((a: AccountAuthError) => a.email);

  return (
    <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800">
      <div className="container max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              {accountCount === 1
                ? 'Gmail account credentials expired'
                : `${accountCount} Gmail account credentials expired`}
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-0.5">
              {accountCount === 1 ? (
                <>
                  <span className="font-medium">{emails[0]}</span> needs to be reconnected
                  to continue syncing new emails.
                </>
              ) : (
                <>
                  The following accounts need to be reconnected:{' '}
                  {emails.map((email: string, i: number) => (
                    <React.Fragment key={email}>
                      {i > 0 && ', '}
                      <span className="font-medium">{email}</span>
                    </React.Fragment>
                  ))}
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50"
              onClick={handleReconnect}
              disabled={reconnecting !== null}
            >
              {reconnecting ? (
                'Redirecting...'
              ) : (
                <>
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Reconnect
                </>
              )}
            </Button>
            <button
              onClick={() => setDismissed(true)}
              className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 p-1"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
