/**
 * 📧 Accounts Step Component
 *
 * Second step of onboarding. Shows connected Gmail account(s)
 * and allows adding additional accounts.
 *
 * @module app/onboarding/components/AccountsStep
 */

'use client';

import * as React from 'react';
import { Button, useToast } from '@/components/ui';
import { Mail, Plus, Check, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';
import type { AuthUser } from '@/lib/auth';
import type { GmailAccount } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('AccountsStep');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Props for step components.
 */
export interface StepProps {
  user: AuthUser;
  onNext: () => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Accounts step - shows connected accounts and allows adding more.
 */
export function AccountsStep({ user, onNext, onBack }: StepProps) {
  const supabase = React.useMemo(() => createClient(), []);
  const { toast } = useToast();

  // State
  const [accounts, setAccounts] = React.useState<GmailAccount[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isAddingAccount, setIsAddingAccount] = React.useState(false);

  // ───────────────────────────────────────────────────────────────────────────
  // Fetch connected accounts
  // ───────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    async function fetchAccounts() {
      logger.start('Fetching connected Gmail accounts');

      try {
        const { data, error } = await supabase
          .from('gmail_accounts')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });

        if (error) {
          throw error;
        }

        setAccounts(data || []);
        logger.success('Fetched Gmail accounts', { count: data?.length || 0 });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to fetch Gmail accounts', { error: message });
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to load connected accounts.',
        });
      } finally {
        setIsLoading(false);
      }
    }

    fetchAccounts();
  }, [supabase, user.id, toast]);

  // ───────────────────────────────────────────────────────────────────────────
  // Handle adding another account
  // ───────────────────────────────────────────────────────────────────────────

  const handleAddAccount = async () => {
    setIsAddingAccount(true);
    logger.info('User initiated adding another Gmail account');

    // Redirect to the connect-account API route which handles OAuth
    // This will set a cookie with the current user ID and redirect to Google
    window.location.href = '/api/auth/connect-account';
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Render account card
  // ───────────────────────────────────────────────────────────────────────────

  const renderAccountCard = (account: GmailAccount) => (
    <div
      key={account.id}
      className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg border border-border/50"
    >
      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
        <Mail className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">
          {account.display_name || account.email}
        </p>
        <p className="text-sm text-muted-foreground truncate">
          {account.email}
        </p>
      </div>
      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
        <Check className="h-4 w-4" />
        <span className="text-sm font-medium">Connected</span>
      </div>
    </div>
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Render primary account (from auth)
  // ───────────────────────────────────────────────────────────────────────────

  const renderPrimaryAccount = () => (
    <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg border border-border/50">
      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
        <Mail className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">
          {user.name || 'Primary Account'}
        </p>
        <p className="text-sm text-muted-foreground truncate">
          {user.email}
        </p>
      </div>
      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
        <Check className="h-4 w-4" />
        <span className="text-sm font-medium">Connected</span>
      </div>
    </div>
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ─────────────────────────────────────────────────────────────────────
          Header
          ───────────────────────────────────────────────────────────────────── */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold mb-2">
          Your Email Accounts
        </h2>
        <p className="text-muted-foreground">
          IdeaBox can manage multiple Gmail accounts in one unified inbox.
        </p>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          Connected Accounts
          ───────────────────────────────────────────────────────────────────── */}
      <div className="space-y-3 mb-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : accounts.length > 0 ? (
          // Show accounts from database
          accounts.map(renderAccountCard)
        ) : (
          // Fall back to showing primary auth account
          renderPrimaryAccount()
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          Add Account Button
          ───────────────────────────────────────────────────────────────────── */}
      <Button
        variant="outline"
        onClick={handleAddAccount}
        disabled={isAddingAccount}
        className="w-full mb-8"
      >
        {isAddingAccount ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Plus className="h-4 w-4 mr-2" />
        )}
        Add Another Gmail Account
      </Button>

      {/* ─────────────────────────────────────────────────────────────────────
          Info Message
          ───────────────────────────────────────────────────────────────────── */}
      <p className="text-sm text-muted-foreground text-center mb-8">
        You can add up to 5 Gmail accounts. Each account&apos;s emails will be
        categorized and managed together in your unified inbox.
      </p>

      {/* ─────────────────────────────────────────────────────────────────────
          Navigation
          ───────────────────────────────────────────────────────────────────── */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={onBack}
          className="flex-1"
        >
          Back
        </Button>
        <Button
          onClick={onNext}
          className="flex-1"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
