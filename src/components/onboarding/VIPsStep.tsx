/**
 * VIPs Step Component
 *
 * Step 4 of 7 in the user context onboarding wizard.
 * Collects user's VIP (Very Important Person) contacts.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * PURPOSE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * VIP contacts receive special treatment:
 * - Emails from VIPs are prioritized higher in inbox
 * - VIP emails get the 'from_vip' label
 * - Quick actions and notifications are triggered for VIP emails
 * - Hub "Next 3-5 Things" surfaces VIP emails first
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * INPUT TYPES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Users can add VIPs in two ways:
 * 1. Email address: exact match (e.g., boss@company.com)
 * 2. Domain: all emails from domain (e.g., @importantclient.com)
 *
 * @module components/onboarding/VIPsStep
 * @version 1.0.0
 * @since January 2026
 */

'use client';

import * as React from 'react';
import { Button, Input, Label, Badge } from '@/components/ui';
import { Star, Plus, X, Mail, Globe } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('VIPsStep');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Props for the VIPsStep component.
 */
export interface VIPsStepProps {
  /** VIP email addresses */
  vipEmails: string[];
  /** VIP domains (start with @) */
  vipDomains: string[];
  /** Callback when VIPs change */
  onDataChange: (data: { vipEmails: string[]; vipDomains: string[] }) => void;
  /** Callback to proceed to next step */
  onNext: () => void;
  /** Callback to go back to previous step */
  onBack: () => void;
  /** Whether this is the first step */
  isFirstStep: boolean;
  /** Whether this is the last step */
  isLastStep: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maximum VIP emails allowed.
 */
const MAX_VIP_EMAILS = 50;

/**
 * Maximum VIP domains allowed.
 */
const MAX_VIP_DOMAINS = 20;

/**
 * Email validation regex.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Domain validation regex (must start with @).
 */
const DOMAIN_REGEX = /^@[a-zA-Z0-9][a-zA-Z0-9-]*(\.[a-zA-Z0-9][a-zA-Z0-9-]*)+$/;

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * VIPsStep - Collects VIP contact emails and domains.
 *
 * @example
 * ```tsx
 * <VIPsStep
 *   vipEmails={data.vipEmails}
 *   vipDomains={data.vipDomains}
 *   onDataChange={(d) => setData(prev => ({ ...prev, ...d }))}
 *   onNext={handleNext}
 *   onBack={handleBack}
 *   isFirstStep={false}
 *   isLastStep={false}
 * />
 * ```
 */
export function VIPsStep({
  vipEmails,
  vipDomains,
  onDataChange,
  onNext,
  onBack,
  isFirstStep,
  isLastStep,
}: VIPsStepProps) {
  // ─────────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────────
  const [inputValue, setInputValue] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  // Total VIP count for display
  const totalVips = vipEmails.length + vipDomains.length;

  // ─────────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Determines if input is an email or domain, validates, and adds it.
   */
  const handleAddVip = React.useCallback(() => {
    const trimmed = inputValue.trim().toLowerCase();

    // Clear any previous errors
    setError(null);

    if (!trimmed) {
      logger.debug('Empty VIP input, ignoring');
      return;
    }

    // Determine type: domain starts with @, otherwise treat as email
    const isDomain = trimmed.startsWith('@');

    if (isDomain) {
      // ───── Domain Validation ─────
      if (!DOMAIN_REGEX.test(trimmed)) {
        setError('Invalid domain format. Use format: @company.com');
        logger.warn('Invalid domain format', { input: trimmed });
        return;
      }

      if (vipDomains.length >= MAX_VIP_DOMAINS) {
        setError(`Maximum ${MAX_VIP_DOMAINS} VIP domains allowed`);
        logger.warn('Max VIP domains reached');
        return;
      }

      // Check for duplicates
      if (vipDomains.includes(trimmed)) {
        setError('This domain is already in your VIP list');
        logger.debug('Duplicate VIP domain', { domain: trimmed });
        return;
      }

      // Add domain
      const newDomains = [...vipDomains, trimmed];
      logger.debug('VIP domain added', { domain: trimmed, total: newDomains.length });
      onDataChange({ vipEmails, vipDomains: newDomains });
    } else {
      // ───── Email Validation ─────
      if (!EMAIL_REGEX.test(trimmed)) {
        setError('Invalid email format. Use format: name@company.com');
        logger.warn('Invalid email format', { input: trimmed });
        return;
      }

      if (vipEmails.length >= MAX_VIP_EMAILS) {
        setError(`Maximum ${MAX_VIP_EMAILS} VIP emails allowed`);
        logger.warn('Max VIP emails reached');
        return;
      }

      // Check for duplicates
      if (vipEmails.includes(trimmed)) {
        setError('This email is already in your VIP list');
        logger.debug('Duplicate VIP email', { email: trimmed });
        return;
      }

      // Add email
      const newEmails = [...vipEmails, trimmed];
      logger.debug('VIP email added', { email: trimmed, total: newEmails.length });
      onDataChange({ vipEmails: newEmails, vipDomains });
    }

    setInputValue('');
  }, [inputValue, vipEmails, vipDomains, onDataChange]);

  /**
   * Handles keyboard events in the input field.
   */
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddVip();
      }
    },
    [handleAddVip]
  );

  /**
   * Handles input value change.
   */
  const handleInputChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
      if (error) {
        setError(null);
      }
    },
    [error]
  );

  /**
   * Removes a VIP email from the list.
   */
  const handleRemoveEmail = React.useCallback(
    (email: string) => {
      const newEmails = vipEmails.filter((e) => e !== email);
      logger.debug('VIP email removed', { email, remaining: newEmails.length });
      onDataChange({ vipEmails: newEmails, vipDomains });
    },
    [vipEmails, vipDomains, onDataChange]
  );

  /**
   * Removes a VIP domain from the list.
   */
  const handleRemoveDomain = React.useCallback(
    (domain: string) => {
      const newDomains = vipDomains.filter((d) => d !== domain);
      logger.debug('VIP domain removed', { domain, remaining: newDomains.length });
      onDataChange({ vipEmails, vipDomains: newDomains });
    },
    [vipEmails, vipDomains, onDataChange]
  );

  /**
   * Handles continue button click.
   */
  const handleContinue = React.useCallback(() => {
    logger.info('VIPsStep completed', {
      emailCount: vipEmails.length,
      domainCount: vipDomains.length,
    });
    onNext();
  }, [vipEmails.length, vipDomains.length, onNext]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────────────────────────────────────
          Header
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="text-center space-y-2">
        <div className="w-12 h-12 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
          <Star className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Who are your VIPs?</h2>
        <p className="text-muted-foreground">
          Add important contacts whose emails should be prioritized.
          <br />
          <span className="text-sm">This step is optional.</span>
        </p>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          VIP Input
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <Label htmlFor="vip-input" className="text-base">
          Add email address or domain
        </Label>

        <div className="flex gap-2">
          <Input
            id="vip-input"
            type="text"
            placeholder="boss@company.com or @importantclient.com"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            className={error ? 'border-destructive' : ''}
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleAddVip}
            disabled={!inputValue.trim()}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>

        {/* Error message */}
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {/* Helper text */}
        <p className="text-xs text-muted-foreground">
          Use @domain.com to mark all emails from a domain as VIP.
        </p>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          VIP Lists
          ───────────────────────────────────────────────────────────────────────── */}
      {totalVips > 0 && (
        <div className="space-y-4">
          <Label className="text-base">
            Your VIPs ({totalVips})
          </Label>

          {/* Email VIPs */}
          {vipEmails.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <Mail className="h-4 w-4" />
                Email addresses
              </p>
              <div className="flex flex-wrap gap-2">
                {vipEmails.map((email) => (
                  <Badge
                    key={email}
                    variant="secondary"
                    className="text-sm py-1.5 px-3 flex items-center gap-2"
                  >
                    {email}
                    <button
                      type="button"
                      onClick={() => handleRemoveEmail(email)}
                      className="ml-1 hover:text-destructive transition-colors"
                      aria-label={`Remove ${email}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Domain VIPs */}
          {vipDomains.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <Globe className="h-4 w-4" />
                Domains (all emails from these domains)
              </p>
              <div className="flex flex-wrap gap-2">
                {vipDomains.map((domain) => (
                  <Badge
                    key={domain}
                    variant="outline"
                    className="text-sm py-1.5 px-3 flex items-center gap-2 border-amber-500/50 bg-amber-500/10"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    {domain}
                    <button
                      type="button"
                      onClick={() => handleRemoveDomain(domain)}
                      className="ml-1 hover:text-destructive transition-colors"
                      aria-label={`Remove ${domain}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          Empty State
          ───────────────────────────────────────────────────────────────────────── */}
      {totalVips === 0 && (
        <div className="text-center py-6 bg-muted/30 rounded-lg">
          <Star className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No VIPs added yet. Add your boss, key clients, or important contacts!
          </p>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          Navigation
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="flex justify-between pt-4">
        {!isFirstStep ? (
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
        ) : (
          <div />
        )}
        <div className="flex gap-2">
          {totalVips === 0 && (
            <Button variant="ghost" onClick={handleContinue}>
              Skip
            </Button>
          )}
          <Button onClick={handleContinue}>
            {isLastStep ? 'Finish' : 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default VIPsStep;
