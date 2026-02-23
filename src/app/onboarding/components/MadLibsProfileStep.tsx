/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type issues with profile_suggestions JSONB
/**
 * Mad Libs Profile Step Component
 *
 * Replaces the original AboutYouStep with an interactive "fill-in-the-blank"
 * card that pre-fills AI suggestions and lets users confirm/edit them
 * conversationally. This component is Phase 3 of the onboarding overhaul.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * HOW IT WORKS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. On mount, calls POST /api/onboarding/profile-suggestions to get AI data
 * 2. Renders a "Mad Libs" card with pre-filled blanks from suggestions
 * 3. Each blank is an inline-editable MadLibsField component
 * 4. VIP contacts are loaded from user_context.vip_emails (saved by mark-vip)
 * 5. On "Looks good!" click, saves confirmed values to user_context
 * 6. "Skip for now" advances without saving — all fields are optional
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CARD LAYOUT (what the user sees)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```
 * I'm a [__freelance designer__] working on [__my own__].
 * Right now I'm focused on [__landing new clients__] and [__finishing my portfolio__].
 * I usually work [Mon-Fri], [9am] to [5pm].
 * The people I care most about hearing from:
 *   [sarah@bigclient.co x] [mike@agency.com x] [+ add]
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DATA FLOW
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * AI Suggestions (Phase 2) -> Pre-fill blanks -> User edits -> Save to user_context
 *
 * Suggestions come from POST /api/onboarding/profile-suggestions which returns
 * the ProfileSuggestions type. Each field has { value, confidence, source }.
 * VIP contacts come from user_context.vip_emails (saved by mark-vip in the previous step).
 *
 * When the user confirms, ONLY fields with values are saved to user_context
 * via the /api/user/context PUT endpoint. This writes to the REAL user_context
 * fields (role, company, priorities, etc.) — not the profile_suggestions column.
 *
 * @module app/onboarding/components/MadLibsProfileStep
 * @since February 2026
 */

'use client';

import * as React from 'react';
import { Button, Skeleton } from '@/components/ui';
import { createLogger } from '@/lib/utils/logger';
import type { AuthUser } from '@/lib/auth';
import type { ProfileSuggestions } from '@/types/database';
import {
  ArrowRight,
  ArrowLeft,
  Sparkles,
  User,
} from 'lucide-react';
import { MadLibsField, formatDays } from './MadLibsField';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('MadLibsProfileStep');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface MadLibsProfileStepProps {
  /** Current authenticated user */
  user: AuthUser;
  /** Callback to proceed to next step */
  onNext: () => void;
  /** Callback to go back to previous step */
  onBack: () => void;
  /** Whether this is the first step in the wizard */
  isFirstStep?: boolean;
  /** Whether this is the last step in the wizard */
  isLastStep?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * MadLibsProfileStep — Interactive "fill-in-the-blank" profile card.
 *
 * This replaces the old AboutYouStep form with a conversational card that
 * pre-fills AI suggestions and lets users confirm or edit inline.
 */
export function MadLibsProfileStep({
  user,
  onNext,
  onBack,
  isFirstStep = false,
  isLastStep = false,
}: MadLibsProfileStepProps) {
  // ─────────────────────────────────────────────────────────────────────────────
  // State: AI suggestions (fetched on mount)
  // ─────────────────────────────────────────────────────────────────────────────

  const [suggestions, setSuggestions] = React.useState<ProfileSuggestions | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // State: User-editable values (initialized from suggestions)
  // ─────────────────────────────────────────────────────────────────────────────

  const [role, setRole] = React.useState('');
  const [company, setCompany] = React.useState('');
  const [priorities, setPriorities] = React.useState<string[]>([]);
  const [workStart, setWorkStart] = React.useState('09:00');
  const [workEnd, setWorkEnd] = React.useState('17:00');
  const [workDays, setWorkDays] = React.useState<number[]>([1, 2, 3, 4, 5]);
  const [vipEmails, setVipEmails] = React.useState<string[]>([]);

  // ─────────────────────────────────────────────────────────────────────────────
  // State: Track which fields the user has manually edited (vs AI-suggested)
  // ─────────────────────────────────────────────────────────────────────────────

  const [editedFields, setEditedFields] = React.useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = React.useState(false);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch AI suggestions on mount
  // ─────────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    let cancelled = false;

    async function fetchSuggestions() {
      logger.start('Fetching profile suggestions', { userId: user.id.substring(0, 8) });
      setFetchError(null);

      try {
        const response = await fetch('/api/onboarding/profile-suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          logger.warn('Profile suggestions API returned error', {
            status: response.status,
            error: errorText,
          });
          if (!cancelled) setFetchError(`Failed to load suggestions (${response.status})`);
          // Continue without suggestions — the card is still usable
          return;
        }

        const result = await response.json();
        const data = result.data as ProfileSuggestions;

        if (cancelled) return;

        logger.success('Profile suggestions loaded', {
          userId: user.id.substring(0, 8),
          emailsAnalyzed: data.meta?.emailsAnalyzed ?? 0,
          hasRole: !!data.role,
          hasCompany: !!data.company,
          priorityCount: data.priorities?.length ?? 0,
          hasWorkHours: !!data.workHours,
        });

        setSuggestions(data);

        // ─────────────────────────────────────────────────────────────────────
        // Pre-fill editable state from AI suggestions
        // ─────────────────────────────────────────────────────────────────────

        if (data.role?.value) {
          setRole(data.role.value);
          logger.debug('Pre-filled role', { value: data.role.value, confidence: data.role.confidence });
        }

        if (data.company?.value) {
          setCompany(data.company.value);
          logger.debug('Pre-filled company', { value: data.company.value, confidence: data.company.confidence });
        }

        if (data.priorities && data.priorities.length > 0) {
          // Take up to 2 highest-confidence priorities for the sentence blanks
          const topPriorities = data.priorities
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 2)
            .map((p) => p.label);
          setPriorities(topPriorities);
          logger.debug('Pre-filled priorities', { values: topPriorities });
        }

        if (data.workHours) {
          setWorkStart(data.workHours.start);
          setWorkEnd(data.workHours.end);
          if (data.workHours.days.length > 0) {
            setWorkDays(data.workHours.days);
          }
          logger.debug('Pre-filled work hours', {
            start: data.workHours.start,
            end: data.workHours.end,
            days: data.workHours.days,
          });
        }
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to fetch profile suggestions', { error: message });
        setFetchError(message);
        // Don't block the step — user can still fill in manually
      }
    }

    // Fetch VIP contacts selected in the previous step.
    // The mark-vip endpoint syncs selections to user_context.vip_emails,
    // so we read from there directly — no need for the vip-suggestions endpoint
    // which returns *suggestions*, not already-selected VIPs.
    async function fetchVipContacts() {
      logger.debug('Fetching VIP contacts from user context', { userId: user.id.substring(0, 8) });

      try {
        const contextResponse = await fetch('/api/user/context');
        if (!contextResponse.ok) {
          logger.warn('Failed to fetch user context for VIP emails', {
            status: contextResponse.status,
          });
          return;
        }

        if (cancelled) return;

        const contextData = await contextResponse.json();
        const existingVips: string[] = contextData.data?.vip_emails ?? contextData.vip_emails ?? [];
        if (existingVips.length > 0) {
          logger.debug('Found VIP emails in user context', {
            count: existingVips.length,
          });
          setVipEmails(existingVips);
        } else {
          logger.debug('No VIP emails found in user context');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.warn('Error fetching VIP contacts', { error: message });
        // Not critical — VIP chips section will just be empty
      }
    }

    // Fire both requests in parallel, only clear loading when BOTH complete.
    // This prevents the card from rendering with empty VIP chips that later
    // pop in, causing a visual flash.
    setLoading(true);
    Promise.all([fetchSuggestions(), fetchVipContacts()]).finally(() => {
      if (!cancelled) {
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [user.id]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Field change handlers (mark field as user-edited)
  // ─────────────────────────────────────────────────────────────────────────────

  const handleRoleChange = React.useCallback((newValue: string) => {
    setRole(newValue);
    setEditedFields((prev) => new Set(prev).add('role'));
    logger.debug('User edited role', { newValue });
  }, []);

  const handleCompanyChange = React.useCallback((newValue: string) => {
    setCompany(newValue);
    setEditedFields((prev) => new Set(prev).add('company'));
    logger.debug('User edited company', { newValue });
  }, []);

  const handlePriority1Change = React.useCallback((newValue: string) => {
    setPriorities((prev) => {
      const updated = [...prev];
      updated[0] = newValue;
      return updated.filter(Boolean); // Remove empty strings
    });
    setEditedFields((prev) => new Set(prev).add('priorities'));
    logger.debug('User edited priority 1', { newValue });
  }, []);

  const handlePriority2Change = React.useCallback((newValue: string) => {
    setPriorities((prev) => {
      const updated = [...prev];
      // Ensure at least 2 slots
      while (updated.length < 2) updated.push('');
      updated[1] = newValue;
      return updated.filter(Boolean);
    });
    setEditedFields((prev) => new Set(prev).add('priorities'));
    logger.debug('User edited priority 2', { newValue });
  }, []);

  const handleWorkStartChange = React.useCallback((newValue: string) => {
    setWorkStart(newValue);
    setEditedFields((prev) => new Set(prev).add('workStart'));
    logger.debug('User edited work start', { newValue });
  }, []);

  const handleWorkEndChange = React.useCallback((newValue: string) => {
    setWorkEnd(newValue);
    setEditedFields((prev) => new Set(prev).add('workEnd'));
    logger.debug('User edited work end', { newValue });
  }, []);

  const handleWorkDaysChange = React.useCallback((newDays: number[]) => {
    setWorkDays(newDays);
    setEditedFields((prev) => new Set(prev).add('workDays'));
    logger.debug('User edited work days', { newDays });
  }, []);

  const handleVipAdd = React.useCallback((email: string) => {
    setVipEmails((prev) => {
      if (prev.includes(email)) return prev;
      return [...prev, email];
    });
    setEditedFields((prev) => new Set(prev).add('vipEmails'));
    logger.debug('User added VIP email', { email });
  }, []);

  const handleVipRemove = React.useCallback((email: string) => {
    setVipEmails((prev) => prev.filter((e) => e !== email));
    setEditedFields((prev) => new Set(prev).add('vipEmails'));
    logger.debug('User removed VIP email', { email });
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Check if a field is still showing an AI suggestion (not user-edited)
  // ─────────────────────────────────────────────────────────────────────────────

  const isAiSuggested = React.useCallback(
    (fieldName: string): boolean => {
      if (!suggestions) return false;
      if (editedFields.has(fieldName)) return false;
      return true;
    },
    [suggestions, editedFields]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Save confirmed values to user_context
  // ─────────────────────────────────────────────────────────────────────────────

  const handleConfirm = async () => {
    setIsSaving(true);
    logger.start('Saving confirmed profile values', {
      userId: user.id.substring(0, 8),
      role: role || '(empty)',
      company: company || '(empty)',
      priorityCount: priorities.length,
      workStart,
      workEnd,
      workDays,
      vipCount: vipEmails.length,
      editedFieldCount: editedFields.size,
    });

    try {
      // Build the context update payload — only include fields that have values
      const contextData: Record<string, unknown> = {};

      if (role.trim()) {
        contextData.role = role.trim();
      }
      if (company.trim()) {
        contextData.company = company.trim();
      }
      if (priorities.length > 0) {
        contextData.priorities = priorities.filter(Boolean);
      }
      if (workStart) {
        contextData.work_hours_start = workStart;
      }
      if (workEnd) {
        contextData.work_hours_end = workEnd;
      }
      if (workDays.length > 0) {
        contextData.work_days = workDays;
      }
      if (vipEmails.length > 0) {
        contextData.vip_emails = vipEmails;
      }

      // Only make the API call if there's something to save
      if (Object.keys(contextData).length > 0) {
        logger.info('Saving user context', {
          fields: Object.keys(contextData),
          userId: user.id.substring(0, 8),
        });

        const response = await fetch('/api/user/context', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(contextData),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          logger.warn('Failed to save user context', {
            status: response.status,
            error: errorText,
          });
          // Don't block onboarding on save failure — proceed anyway
        } else {
          logger.success('User context saved from Mad Libs step', {
            userId: user.id.substring(0, 8),
            fieldsCount: Object.keys(contextData).length,
          });
        }
      } else {
        logger.info('No values to save — all fields empty');
      }

      onNext();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error saving confirmed profile values', { error: message });
      // Don't block onboarding — proceed even on error
      onNext();
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Skip this step entirely — no values saved.
   */
  const handleSkip = () => {
    logger.info('User skipped Mad Libs profile step', {
      userId: user.id.substring(0, 8),
    });
    onNext();
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: Loading skeleton
  // ─────────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
            <Sparkles className="h-6 w-6 text-primary animate-pulse" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Building your profile...</h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Analyzing your emails to pre-fill your profile. This only takes a moment.
          </p>
        </div>

        {/* Skeleton card that matches the final card shape */}
        <div className="bg-card border border-border/50 rounded-xl p-6 shadow-sm max-w-lg mx-auto space-y-4">
          {/* "I'm a [___] working on [___]." */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-muted-foreground">I&apos;m a</span>
            <Skeleton className="h-6 w-32 rounded" />
            <span className="text-muted-foreground">working on</span>
            <Skeleton className="h-6 w-28 rounded" />
          </div>

          {/* "Right now I'm focused on [___] and [___]." */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-muted-foreground">Right now I&apos;m focused on</span>
            <Skeleton className="h-6 w-36 rounded" />
            <span className="text-muted-foreground">and</span>
            <Skeleton className="h-6 w-40 rounded" />
          </div>

          {/* "I usually work [___], [___] to [___]." */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-muted-foreground">I usually work</span>
            <Skeleton className="h-6 w-24 rounded" />
            <span className="text-muted-foreground">,</span>
            <Skeleton className="h-6 w-16 rounded" />
            <span className="text-muted-foreground">to</span>
            <Skeleton className="h-6 w-16 rounded" />
          </div>

          {/* VIP section */}
          <div className="pt-2">
            <span className="text-muted-foreground">The people I care most about hearing from:</span>
            <div className="flex gap-2 mt-2">
              <Skeleton className="h-7 w-36 rounded-full" />
              <Skeleton className="h-7 w-32 rounded-full" />
            </div>
          </div>
        </div>

        {/* Actions skeleton */}
        <div className="flex items-center justify-between pt-4">
          <Skeleton className="h-10 w-20 rounded" />
          <div className="flex gap-3">
            <Skeleton className="h-10 w-28 rounded" />
            <Skeleton className="h-10 w-32 rounded" />
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: Main Mad Libs card
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
          <User className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Your profile</h2>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          {suggestions && suggestions.meta.emailsAnalyzed > 0
            ? 'We pre-filled some details from your emails. Click any blank to edit.'
            : 'Fill in the blanks to help AI understand your context. All fields are optional.'}
        </p>
        {fetchError && (
          <p className="text-xs text-amber-600 mt-1">
            Could not load AI suggestions — you can still fill in everything manually.
          </p>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* THE MAD LIBS CARD */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      <div className="bg-card border border-border/50 rounded-xl p-6 shadow-sm max-w-lg mx-auto">
        {/* Sentence 1: "I'm a [role] working on [company/my own]." */}
        <p className="text-base leading-relaxed mb-4">
          I&apos;m a{' '}
          <MadLibsField
            value={role}
            onChange={handleRoleChange}
            placeholder="your role"
            isAiSuggested={isAiSuggested('role') && !!role}
            confidence={suggestions?.role?.confidence}
            type="text"
          />{' '}
          working on{' '}
          <MadLibsField
            value={company}
            onChange={handleCompanyChange}
            placeholder="my own / at Company"
            isAiSuggested={isAiSuggested('company') && !!company}
            confidence={suggestions?.company?.confidence}
            type="text"
          />
          .
        </p>

        {/* Sentence 2: "Right now I'm focused on [priority1] and [priority2]." */}
        <p className="text-base leading-relaxed mb-4">
          Right now I&apos;m focused on{' '}
          <MadLibsField
            value={priorities[0] ?? ''}
            onChange={handlePriority1Change}
            placeholder="top priority"
            isAiSuggested={isAiSuggested('priorities') && !!(priorities[0])}
            confidence={
              suggestions?.priorities?.[0]?.confidence
            }
            type="text"
          />
          {' '}and{' '}
          <MadLibsField
            value={priorities[1] ?? ''}
            onChange={handlePriority2Change}
            placeholder="another focus"
            isAiSuggested={isAiSuggested('priorities') && !!(priorities[1])}
            confidence={
              suggestions?.priorities?.[1]?.confidence
            }
            type="text"
          />
          .
        </p>

        {/* Sentence 3: "I usually work [days], [start] to [end]." */}
        <p className="text-base leading-relaxed mb-4">
          I usually work{' '}
          <MadLibsField
            value={formatDays(workDays)}
            onChange={() => {}} // Days use their own toggle UI
            placeholder="select days"
            isAiSuggested={isAiSuggested('workDays') && workDays.length > 0}
            confidence={suggestions?.workHours?.confidence}
            type="days"
            selectedDays={workDays}
            onDaysChange={handleWorkDaysChange}
          />
          ,{' '}
          <MadLibsField
            value={workStart}
            onChange={handleWorkStartChange}
            placeholder="start time"
            isAiSuggested={isAiSuggested('workStart') && !!workStart}
            confidence={suggestions?.workHours?.confidence}
            type="time"
          />{' '}
          to{' '}
          <MadLibsField
            value={workEnd}
            onChange={handleWorkEndChange}
            placeholder="end time"
            isAiSuggested={isAiSuggested('workEnd') && !!workEnd}
            confidence={suggestions?.workHours?.confidence}
            type="time"
          />
          .
        </p>

        {/* Sentence 4: VIP contacts */}
        <div className="pt-2 border-t border-border/30">
          <p className="text-base leading-relaxed mb-2 text-muted-foreground">
            The people I care most about hearing from:
          </p>
          <MadLibsField
            value=""
            onChange={() => {}}
            type="chips"
            chipValues={vipEmails}
            onChipAdd={handleVipAdd}
            onChipRemove={handleVipRemove}
            isAiSuggested={!editedFields.has('vipEmails') && vipEmails.length > 0}
          />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* AI attribution (subtle) */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      {suggestions && suggestions.meta.emailsAnalyzed > 0 && (
        <p className="text-center text-xs text-muted-foreground/70">
          <Sparkles className="h-3 w-3 inline mr-1" />
          Pre-filled from {suggestions.meta.emailsAnalyzed} of your recent emails
        </p>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* Actions */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      <div className="flex items-center justify-between pt-4">
        <Button variant="ghost" onClick={onBack} disabled={isFirstStep}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={handleSkip} disabled={isSaving}>
            Skip for now
          </Button>
          <Button onClick={handleConfirm} disabled={isSaving}>
            {isSaving ? (
              <>
                <Sparkles className="h-4 w-4 mr-2 animate-pulse" />
                Saving...
              </>
            ) : (
              <>
                {isLastStep ? 'Finish Setup' : 'Looks good!'}
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default MadLibsProfileStep;
