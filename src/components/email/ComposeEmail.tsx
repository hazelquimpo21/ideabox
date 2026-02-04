/**
 * Compose Email Component
 *
 * A comprehensive email composition interface supporting:
 * - New emails and replies (with editable subject)
 * - Rich text HTML body
 * - To, CC, BCC recipients
 * - Email scheduling
 * - Template selection
 * - Tracking options
 * - Follow-up configuration
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```tsx
 * // New email
 * <ComposeEmail
 *   mode="new"
 *   onSend={handleSend}
 *   onClose={handleClose}
 * />
 *
 * // Reply to email
 * <ComposeEmail
 *   mode="reply"
 *   replyTo={originalEmail}
 *   onSend={handleSend}
 *   onClose={handleClose}
 * />
 * ```
 *
 * @module components/email/ComposeEmail
 * @see docs/GMAIL_SENDING_IMPLEMENTATION.md
 */

'use client';

import * as React from 'react';
import {
  Button,
  Input,
  Textarea,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Checkbox,
  Badge,
  useToast,
} from '@/components/ui';
import { createLogger } from '@/lib/utils/logger';
import {
  Send,
  Clock,
  X,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Loader2,
  FileText,
  Eye,
  EyeOff,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('ComposeEmail');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Email being replied to (for reply mode).
 */
export interface ReplyToEmail {
  id: string;
  gmailMessageId?: string;
  threadId?: string;
  subject: string;
  senderEmail: string;
  senderName?: string;
  bodyHtml?: string;
}

/**
 * Gmail account for sending.
 */
export interface GmailAccount {
  id: string;
  email: string;
  displayName?: string;
  hasSendScope: boolean;
}

/**
 * Email template.
 */
export interface EmailTemplate {
  id: string;
  name: string;
  category?: string;
  subjectTemplate: string;
  bodyHtmlTemplate: string;
  mergeFields: string[];
}

/**
 * Follow-up configuration.
 */
export interface FollowUpConfig {
  enabled: boolean;
  condition: 'no_open' | 'no_reply' | 'both';
  delayHours: number;
}

/**
 * Props for the ComposeEmail component.
 */
export interface ComposeEmailProps {
  /** Composition mode */
  mode: 'new' | 'reply' | 'forward';
  /** Original email for replies */
  replyTo?: ReplyToEmail;
  /** Available Gmail accounts */
  accounts?: GmailAccount[];
  /** Available templates */
  templates?: EmailTemplate[];
  /** Initial template to use */
  initialTemplate?: EmailTemplate;
  /** Called when email is sent/scheduled */
  onSend?: (result: { id: string; status: 'sent' | 'scheduled' }) => void;
  /** Called when dialog is closed */
  onClose?: () => void;
  /** Whether dialog is open (controlled) */
  open?: boolean;
  /** Called when open state changes */
  onOpenChange?: (open: boolean) => void;
}

/**
 * Internal form state.
 */
interface FormState {
  accountId: string;
  to: string;
  toName: string;
  cc: string;
  bcc: string;
  subject: string;
  bodyHtml: string;
  scheduledAt: string;
  trackingEnabled: boolean;
  followUp: FollowUpConfig;
  templateId: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_FOLLOW_UP: FollowUpConfig = {
  enabled: false,
  condition: 'no_reply',
  delayHours: 48,
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generates a reply subject line.
 */
function getReplySubject(originalSubject: string): string {
  if (originalSubject.toLowerCase().startsWith('re:')) {
    return originalSubject;
  }
  return `Re: ${originalSubject}`;
}

/**
 * Generates quoted reply body.
 */
function getReplyBody(original: ReplyToEmail): string {
  const senderInfo = original.senderName
    ? `${original.senderName} <${original.senderEmail}>`
    : original.senderEmail;

  return `
<br /><br />
<div style="border-left: 2px solid #ccc; padding-left: 12px; margin-left: 0; color: #666;">
  <p style="margin: 0 0 8px 0;">On ${new Date().toLocaleDateString()}, ${senderInfo} wrote:</p>
  ${original.bodyHtml || '<p>(No content)</p>'}
</div>
`;
}

/**
 * Formats a datetime-local input value for scheduling.
 */
function getMinScheduleTime(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 5); // At least 5 minutes in future
  return now.toISOString().slice(0, 16);
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Email composition component with full feature set.
 */
export function ComposeEmail({
  mode,
  replyTo,
  accounts = [],
  templates = [],
  initialTemplate,
  onSend,
  onClose,
  open,
  onOpenChange,
}: ComposeEmailProps) {
  const { toast } = useToast();

  // ─────────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────────

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [showSchedule, setShowSchedule] = React.useState(false);
  const [needsSendScope, setNeedsSendScope] = React.useState(false);

  // Form state
  const [form, setForm] = React.useState<FormState>(() => {
    const defaultAccountId = accounts.find((a) => a.hasSendScope)?.id || accounts[0]?.id || '';

    return {
      accountId: defaultAccountId,
      to: mode === 'reply' ? replyTo?.senderEmail || '' : '',
      toName: mode === 'reply' ? replyTo?.senderName || '' : '',
      cc: '',
      bcc: '',
      subject: mode === 'reply' && replyTo
        ? getReplySubject(replyTo.subject)
        : initialTemplate?.subjectTemplate || '',
      bodyHtml: mode === 'reply' && replyTo
        ? getReplyBody(replyTo)
        : initialTemplate?.bodyHtmlTemplate || '',
      scheduledAt: '',
      trackingEnabled: true,
      followUp: DEFAULT_FOLLOW_UP,
      templateId: initialTemplate?.id || '',
    };
  });

  // Check if selected account has send scope
  React.useEffect(() => {
    const account = accounts.find((a) => a.id === form.accountId);
    setNeedsSendScope(account ? !account.hasSendScope : false);

    logger.debug('Account selection changed', {
      accountId: form.accountId?.substring(0, 8),
      hasSendScope: account?.hasSendScope,
    });
  }, [form.accountId, accounts]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Form Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const updateForm = React.useCallback(<K extends keyof FormState>(
    field: K,
    value: FormState[K]
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleTemplateSelect = React.useCallback((templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    logger.info('Template selected', {
      templateId: templateId.substring(0, 8),
      name: template.name,
    });

    setForm((prev) => ({
      ...prev,
      templateId,
      subject: template.subjectTemplate,
      bodyHtml: template.bodyHtmlTemplate,
    }));
  }, [templates]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Submit Handler
  // ─────────────────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!form.to.trim()) {
      toast({
        title: 'Recipient required',
        description: 'Please enter a recipient email address.',
        variant: 'destructive',
      });
      return;
    }

    if (!form.subject.trim()) {
      toast({
        title: 'Subject required',
        description: 'Please enter an email subject.',
        variant: 'destructive',
      });
      return;
    }

    if (!form.bodyHtml.trim()) {
      toast({
        title: 'Message required',
        description: 'Please enter a message body.',
        variant: 'destructive',
      });
      return;
    }

    if (!form.accountId) {
      toast({
        title: 'Account required',
        description: 'Please select a Gmail account to send from.',
        variant: 'destructive',
      });
      return;
    }

    logger.info('Submitting email', {
      accountId: form.accountId.substring(0, 8),
      to: form.to,
      hasSchedule: !!form.scheduledAt,
      isReply: mode === 'reply',
    });

    setIsSubmitting(true);

    try {
      // Build request body
      const requestBody: Record<string, unknown> = {
        accountId: form.accountId,
        to: form.to.trim(),
        toName: form.toName.trim() || undefined,
        subject: form.subject.trim(),
        bodyHtml: form.bodyHtml,
        trackingEnabled: form.trackingEnabled,
      };

      // Add optional fields
      if (form.cc.trim()) {
        requestBody.cc = form.cc.split(',').map((e) => e.trim()).filter(Boolean);
      }
      if (form.bcc.trim()) {
        requestBody.bcc = form.bcc.split(',').map((e) => e.trim()).filter(Boolean);
      }
      if (form.scheduledAt) {
        requestBody.scheduledAt = new Date(form.scheduledAt).toISOString();
      }
      if (form.templateId) {
        requestBody.templateId = form.templateId;
      }
      if (form.followUp.enabled) {
        requestBody.followUp = form.followUp;
      }

      // Add reply threading info
      if (mode === 'reply' && replyTo) {
        if (replyTo.gmailMessageId) {
          requestBody.inReplyTo = replyTo.gmailMessageId;
        }
        if (replyTo.threadId) {
          requestBody.threadId = replyTo.threadId;
        }
      }

      // Send request
      const response = await fetch('/api/emails/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (!response.ok) {
        // Handle specific error codes
        if (result.code === 'SEND_SCOPE_REQUIRED') {
          setNeedsSendScope(true);
          toast({
            title: 'Permission Required',
            description: 'Please grant email sending permission to continue.',
            variant: 'destructive',
          });
          return;
        }

        if (result.code === 'QUOTA_EXCEEDED') {
          toast({
            title: 'Daily Limit Reached',
            description: 'You\'ve reached your daily email limit. Try again tomorrow.',
            variant: 'destructive',
          });
          return;
        }

        throw new Error(result.error || 'Failed to send email');
      }

      logger.success('Email sent/scheduled', {
        id: result.data?.id,
        status: result.data?.status,
      });

      toast({
        title: result.data?.status === 'scheduled' ? 'Email Scheduled' : 'Email Sent',
        description: result.data?.status === 'scheduled'
          ? `Your email will be sent at ${new Date(form.scheduledAt).toLocaleString()}`
          : 'Your email has been sent successfully.',
      });

      onSend?.(result.data);
      onOpenChange?.(false);
    } catch (error) {
      logger.error('Failed to send email', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      toast({
        title: 'Send Failed',
        description: error instanceof Error ? error.message : 'Failed to send email',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Request Send Scope
  // ─────────────────────────────────────────────────────────────────────────────

  const handleRequestSendScope = () => {
    logger.info('Redirecting to add send scope', {
      accountId: form.accountId?.substring(0, 8),
    });

    // Redirect to OAuth flow to add send scope
    window.location.href = `/api/auth/add-send-scope?returnTo=/discover&accountId=${form.accountId}`;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'reply' ? 'Reply' : mode === 'forward' ? 'Forward' : 'New Email'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Send Scope Warning */}
          {needsSendScope && (
            <div className="flex items-center gap-3 p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
              <div className="flex-1 text-sm">
                <p className="font-medium text-yellow-800 dark:text-yellow-200">
                  Permission Required
                </p>
                <p className="text-yellow-700 dark:text-yellow-300">
                  Grant email sending permission to send from this account.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleRequestSendScope}
              >
                Grant Access
              </Button>
            </div>
          )}

          {/* From (Account Selector) */}
          {accounts.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="account">From</Label>
              <Select value={form.accountId} onValueChange={(v) => updateForm('accountId', v)}>
                <SelectTrigger id="account">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      <span className="flex items-center gap-2">
                        {account.email}
                        {!account.hasSendScope && (
                          <Badge variant="outline" className="text-xs">
                            No Send Permission
                          </Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* To */}
          <div className="space-y-2">
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              type="email"
              placeholder="recipient@example.com"
              value={form.to}
              onChange={(e) => updateForm('to', e.target.value)}
              required
            />
          </div>

          {/* CC/BCC Toggle */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-muted-foreground"
            >
              {showAdvanced ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
              CC / BCC
            </Button>
          </div>

          {/* CC/BCC Fields */}
          {showAdvanced && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cc">CC</Label>
                <Input
                  id="cc"
                  type="text"
                  placeholder="cc@example.com"
                  value={form.cc}
                  onChange={(e) => updateForm('cc', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bcc">BCC</Label>
                <Input
                  id="bcc"
                  type="text"
                  placeholder="bcc@example.com"
                  value={form.bcc}
                  onChange={(e) => updateForm('bcc', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              type="text"
              placeholder="Email subject"
              value={form.subject}
              onChange={(e) => updateForm('subject', e.target.value)}
              required
            />
          </div>

          {/* Template Selector */}
          {templates.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="template">Template</Label>
              <Select value={form.templateId} onValueChange={handleTemplateSelect}>
                <SelectTrigger id="template">
                  <SelectValue placeholder="Use a template (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No template</SelectItem>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      <span className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        {template.name}
                        {template.category && (
                          <Badge variant="outline" className="text-xs">
                            {template.category}
                          </Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Body */}
          <div className="space-y-2">
            <Label htmlFor="body">Message</Label>
            <Textarea
              id="body"
              placeholder="Write your message..."
              value={form.bodyHtml}
              onChange={(e) => updateForm('bodyHtml', e.target.value)}
              rows={10}
              className="font-mono text-sm"
              required
            />
            <p className="text-xs text-muted-foreground">
              Supports HTML formatting. Use merge fields like {'{{first_name}}'} for templates.
            </p>
          </div>

          {/* Options Row */}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            {/* Tracking Toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={form.trackingEnabled}
                onCheckedChange={(checked) => updateForm('trackingEnabled', !!checked)}
              />
              <span className="text-sm flex items-center gap-1">
                {form.trackingEnabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                Track opens
              </span>
            </label>

            {/* Schedule Toggle */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowSchedule(!showSchedule)}
              className={showSchedule ? 'text-primary' : 'text-muted-foreground'}
            >
              <Clock className="h-4 w-4 mr-1" />
              Schedule
            </Button>
          </div>

          {/* Schedule Time */}
          {showSchedule && (
            <div className="space-y-2 p-3 bg-muted rounded-lg">
              <Label htmlFor="scheduledAt">Send at</Label>
              <Input
                id="scheduledAt"
                type="datetime-local"
                min={getMinScheduleTime()}
                value={form.scheduledAt}
                onChange={(e) => updateForm('scheduledAt', e.target.value)}
              />
              {form.scheduledAt && (
                <p className="text-sm text-muted-foreground">
                  Will send on {new Date(form.scheduledAt).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {/* Follow-up Options */}
          <div className="space-y-3 p-3 border rounded-lg">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={form.followUp.enabled}
                onCheckedChange={(checked) =>
                  updateForm('followUp', { ...form.followUp, enabled: !!checked })
                }
              />
              <span className="text-sm font-medium">Enable follow-up reminder</span>
            </label>

            {form.followUp.enabled && (
              <div className="grid grid-cols-2 gap-4 pl-6">
                <div className="space-y-2">
                  <Label htmlFor="followUpCondition">Follow up if</Label>
                  <Select
                    value={form.followUp.condition}
                    onValueChange={(v) =>
                      updateForm('followUp', {
                        ...form.followUp,
                        condition: v as FollowUpConfig['condition'],
                      })
                    }
                  >
                    <SelectTrigger id="followUpCondition">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no_reply">No reply received</SelectItem>
                      <SelectItem value="no_open">Email not opened</SelectItem>
                      <SelectItem value="both">No reply or open</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="followUpDelay">After</Label>
                  <Select
                    value={String(form.followUp.delayHours)}
                    onValueChange={(v) =>
                      updateForm('followUp', {
                        ...form.followUp,
                        delayHours: parseInt(v, 10),
                      })
                    }
                  >
                    <SelectTrigger id="followUpDelay">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24">24 hours</SelectItem>
                      <SelectItem value="48">48 hours</SelectItem>
                      <SelectItem value="72">3 days</SelectItem>
                      <SelectItem value="168">1 week</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange?.(false)}>
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || needsSendScope}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  {form.scheduledAt ? 'Scheduling...' : 'Sending...'}
                </>
              ) : (
                <>
                  {form.scheduledAt ? (
                    <>
                      <Clock className="h-4 w-4 mr-1" />
                      Schedule
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-1" />
                      Send
                    </>
                  )}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default ComposeEmail;
