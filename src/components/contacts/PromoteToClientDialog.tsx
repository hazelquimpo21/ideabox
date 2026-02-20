/**
 * Promote to Client Dialog
 *
 * A dialog form that promotes a contact to client status.
 * Collects client-specific fields: status, priority, email domains, and keywords.
 * Calls the `promoteToClient()` function from the useContacts hook.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```tsx
 * <PromoteToClientDialog
 *   open={dialogOpen}
 *   onOpenChange={setDialogOpen}
 *   contactId={selectedContactId}
 *   contactName={selectedContactName}
 *   onPromote={handlePromote}
 * />
 * ```
 *
 * @module components/contacts/PromoteToClientDialog
 * @since February 2026 — Phase 3 Navigation Redesign
 */

'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { Building2, Loader2 } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('PromoteToClientDialog');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Data collected by the promote-to-client form.
 */
export interface PromoteToClientData {
  clientStatus: 'active' | 'inactive' | 'archived';
  clientPriority: 'vip' | 'high' | 'medium' | 'low';
  emailDomains?: string[];
  keywords?: string[];
}

/**
 * Props for the PromoteToClientDialog component.
 */
export interface PromoteToClientDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback to change open state */
  onOpenChange: (open: boolean) => void;
  /** ID of the contact being promoted */
  contactId: string;
  /** Display name of the contact (for the dialog title) */
  contactName?: string | null;
  /** Callback when promotion is submitted */
  onPromote: (contactId: string, data: PromoteToClientData) => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * PromoteToClientDialog — form dialog for promoting a contact to client status.
 *
 * Provides fields for:
 * - Client status (active/inactive/archived)
 * - Client priority (vip/high/medium/low)
 * - Email domains (comma-separated)
 * - Keywords (comma-separated)
 *
 * @param props - Component props
 */
export function PromoteToClientDialog({
  open,
  onOpenChange,
  contactId,
  contactName,
  onPromote,
}: PromoteToClientDialogProps) {
  // ─── Form State ──────────────────────────────────────────────────────────────
  const [clientStatus, setClientStatus] = React.useState<'active' | 'inactive' | 'archived'>('active');
  const [clientPriority, setClientPriority] = React.useState<'vip' | 'high' | 'medium' | 'low'>('medium');
  const [emailDomainsInput, setEmailDomainsInput] = React.useState('');
  const [keywordsInput, setKeywordsInput] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // ─── Reset form when dialog opens ────────────────────────────────────────────
  React.useEffect(() => {
    if (open) {
      setClientStatus('active');
      setClientPriority('medium');
      setEmailDomainsInput('');
      setKeywordsInput('');
      logger.debug('Dialog opened for contact', {
        contactId: contactId.substring(0, 8),
        contactName,
      });
    }
  }, [open, contactId, contactName]);

  /**
   * Handle form submission.
   * Parses comma-separated fields and calls the onPromote callback.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    logger.start('Submitting promote-to-client', {
      contactId: contactId.substring(0, 8),
      clientStatus,
      clientPriority,
    });

    try {
      const data: PromoteToClientData = {
        clientStatus,
        clientPriority,
      };

      // Parse comma-separated email domains
      const domains = emailDomainsInput
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean);
      if (domains.length > 0) {
        data.emailDomains = domains;
      }

      // Parse comma-separated keywords
      const kw = keywordsInput
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      if (kw.length > 0) {
        data.keywords = kw;
      }

      await onPromote(contactId, data);

      logger.success('Contact promoted to client', {
        contactId: contactId.substring(0, 8),
      });

      onOpenChange(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to promote contact', { error: errorMessage });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <DialogTitle>Promote to Client</DialogTitle>
          </div>
          <DialogDescription>
            {contactName
              ? `Promote "${contactName}" to a client for enhanced tracking and priority.`
              : 'Promote this contact to a client for enhanced tracking and priority.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ─── Status ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="clientStatus">Status</Label>
              <Select
                value={clientStatus}
                onValueChange={(v) => setClientStatus(v as typeof clientStatus)}
              >
                <SelectTrigger id="clientStatus">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* ─── Priority ────────────────────────────────────────────── */}
            <div className="space-y-2">
              <Label htmlFor="clientPriority">Priority</Label>
              <Select
                value={clientPriority}
                onValueChange={(v) => setClientPriority(v as typeof clientPriority)}
              >
                <SelectTrigger id="clientPriority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vip">VIP</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ─── Email Domains ────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label htmlFor="emailDomains">Email Domains</Label>
            <Input
              id="emailDomains"
              value={emailDomainsInput}
              onChange={(e) => setEmailDomainsInput(e.target.value)}
              placeholder="example.com, example.org"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated list. Emails from these domains will auto-link to this client.
            </p>
          </div>

          {/* ─── Keywords ─────────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label htmlFor="keywords">Keywords</Label>
            <Input
              id="keywords"
              value={keywordsInput}
              onChange={(e) => setKeywordsInput(e.target.value)}
              placeholder="project-x, acme-corp"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated tags for categorizing this client&apos;s emails.
            </p>
          </div>

          {/* ─── Actions ──────────────────────────────────────────────── */}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Promote to Client
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default PromoteToClientDialog;
