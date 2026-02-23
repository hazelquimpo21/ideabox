/**
 * Contact Import Step Component
 *
 * An optional step in the onboarding wizard that helps users quickly identify
 * their most important contacts (VIPs) using data from:
 * - Google Contacts (starred contacts, contact groups)
 * - Email communication patterns (most frequent contacts)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * WHY THIS STEP EXISTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Manually entering VIP email addresses during onboarding is tedious and
 * error-prone. This step provides smart suggestions based on:
 *
 * 1. GOOGLE STARRED: Contacts the user has already marked as important
 * 2. FREQUENT CONTACTS: People the user communicates with most
 * 3. GOOGLE LABELS: Contacts in "Work", "VIP", "Clients" groups
 *
 * This reduces friction and increases VIP completion rate.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USER FLOW
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Step loads and fetches VIP suggestions from API
 * 2. User sees suggestions with reasons ("Starred in Google", "50 emails", etc.)
 * 3. User toggles contacts they want as VIPs
 * 4. User clicks "Continue" - VIPs are saved
 * 5. User can also skip this step entirely
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * GOOGLE CONTACTS PERMISSION
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * If the user hasn't granted contacts permission:
 * - We show a button to grant access (re-OAuth with contacts scope)
 * - Suggestions are based on email patterns only
 * - The step is still useful without Google data
 *
 * @module app/onboarding/components/ContactImportStep
 * @since January 2026
 */

'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Button, Badge, Checkbox, useToast } from '@/components/ui';
import { createLogger } from '@/lib/utils/logger';
import type { AuthUser } from '@/lib/auth';
import {
  Users,
  Star,
  Mail,
  Building,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Check,
  RefreshCw,
  UserPlus,
  Sparkles,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('ContactImportStep');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ContactImportStepProps {
  /** Current authenticated user */
  user: AuthUser;
  /** Callback to proceed to next step */
  onNext: () => void;
  /** Callback to go back */
  onBack: () => void;
  /** Whether this is the first step */
  isFirstStep: boolean;
  /** Whether this is the last step */
  isLastStep: boolean;
}

/**
 * VIP suggestion from the API.
 */
interface VipSuggestion {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  emailCount: number;
  isGoogleStarred: boolean;
  googleLabels: string[];
  relationshipType: string | null;
  suggestionReason: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Avatar component that shows initials or image.
 */
function ContactAvatar({
  name,
  avatarUrl,
}: {
  name: string | null;
  avatarUrl: string | null;
}) {
  const initials = name
    ? name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name || 'Contact'}
        className="w-10 h-10 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
      {initials}
    </div>
  );
}

/**
 * Single contact suggestion card.
 * Wrapped in React.memo to avoid re-rendering all cards when parent state
 * changes (e.g. toggling a different card's checkbox).
 */
const SuggestionCard = React.memo(function SuggestionCard({
  suggestion,
  isSelected,
  onToggle,
}: {
  suggestion: VipSuggestion;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`
        flex items-center gap-3 p-3 rounded-lg border cursor-pointer
        transition-colors duration-150
        ${isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50 hover:bg-muted/50'
        }
      `}
      onClick={onToggle}
    >
      {/* Checkbox */}
      <Checkbox checked={isSelected} className="pointer-events-none" />

      {/* Avatar */}
      <ContactAvatar name={suggestion.name} avatarUrl={suggestion.avatarUrl} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">
            {suggestion.name || suggestion.email}
          </span>
          {suggestion.isGoogleStarred && (
            <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
          )}
        </div>
        {suggestion.name && (
          <p className="text-xs text-muted-foreground truncate">
            {suggestion.email}
          </p>
        )}
      </div>

      {/* Reason Badge */}
      <div className="flex-shrink-0">
        <Badge variant="secondary" className="text-xs whitespace-nowrap">
          {suggestion.suggestionReason}
        </Badge>
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ContactImportStep - Helps users identify VIPs from Google Contacts and email patterns.
 */
export function ContactImportStep({
  onNext,
  onBack,
  isFirstStep,
  isLastStep,
}: ContactImportStepProps) {
  // ─────────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────────

  const [suggestions, setSuggestions] = React.useState<VipSuggestion[]>([]);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);
  const [hasContactsPermission, setHasContactsPermission] = React.useState(false);
  const [importStatus, setImportStatus] = React.useState<string | null>(null);
  /** Tracks whether a Google import has completed at least once in this session */
  const [hasImported, setHasImported] = React.useState(false);
  const { toast } = useToast();

  // ─────────────────────────────────────────────────────────────────────────────
  // Load suggestions on mount (skip if we're about to auto-import)
  // ─────────────────────────────────────────────────────────────────────────────

  const searchParams = useSearchParams();
  const hasTriggeredImportRef = React.useRef(false);

  // When returning from OAuth with scope_added=true, the import handler will
  // call loadSuggestions() after the import finishes. Loading suggestions on
  // mount in that case is wasted work — the results are immediately invalidated
  // once the import completes. So we skip the initial fetch when scope_added
  // is present.
  React.useEffect(() => {
    const isScopeReturn = searchParams.get('scope_added') === 'true';
    if (!isScopeReturn) {
      loadSuggestions();
    } else {
      logger.info('Skipping initial loadSuggestions — scope_added=true, import will reload');
    }
  }, []);

  // Auto-trigger import when returning from OAuth with contacts scope granted
  React.useEffect(() => {
    if (searchParams.get('scope_added') === 'true' && !hasTriggeredImportRef.current) {
      hasTriggeredImportRef.current = true;
      logger.info('Returned from OAuth with contacts scope granted, auto-importing');
      handleImportFromGoogle();
    }
  }, [searchParams]);

  /**
   * Fetches VIP suggestions from the API.
   */
  const loadSuggestions = async () => {
    setIsLoading(true);
    logger.info('Loading VIP suggestions');

    try {
      const response = await fetch('/api/contacts/vip-suggestions');

      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || []);
        setHasContactsPermission(data.hasContactsPermission ?? false);

        // Pre-select starred contacts
        const starredIds = new Set(
          (data.suggestions || [])
            .filter((s: VipSuggestion) => s.isGoogleStarred)
            .map((s: VipSuggestion) => s.id)
        );
        setSelectedIds(starredIds);

        logger.info('VIP suggestions loaded', {
          count: data.suggestions?.length || 0,
          preSelected: starredIds.size,
          hasContactsPermission: data.hasContactsPermission,
        });
      } else {
        logger.warn('Failed to load VIP suggestions', {
          status: response.status,
        });
      }
    } catch (error) {
      logger.error('Error loading VIP suggestions', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Toggles a contact's selection.
   * Wrapped in useCallback so SuggestionCard (React.memo) gets stable references.
   */
  const handleToggle = React.useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  /**
   * Selects all suggestions.
   */
  const handleSelectAll = () => {
    setSelectedIds(new Set(suggestions.map((s) => s.id)));
  };

  /**
   * Deselects all suggestions.
   */
  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  /**
   * Imports contacts from Google.
   */
  const handleImportFromGoogle = async () => {
    setIsImporting(true);
    setImportStatus('Importing contacts from Google...');
    logger.info('Starting Google contacts import');

    try {
      const response = await fetch('/api/contacts/import-google', {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        const starredNote = data.starred > 0 ? `, ${data.starred} starred` : '';
        setImportStatus(`Found ${data.imported} contacts${starredNote}`);
        setHasContactsPermission(true);
        setHasImported(true);

        logger.info('Google contacts imported successfully', {
          imported: data.imported,
          starred: data.starred,
          skipped: data.skipped,
          errors: data.errors?.length ?? 0,
        });

        // Reload suggestions to include newly imported contacts
        await loadSuggestions();
      } else if (response.status === 403) {
        // Need to re-authorize with contacts scope
        logger.info('Contacts permission not granted, redirecting to auth');
        setImportStatus('Redirecting to grant permission...');

        // Redirect to OAuth with contacts scope — use pathname only (the
        // callback appends scope_added=true itself)
        window.location.href = '/api/auth/add-contacts-scope?returnTo=' + encodeURIComponent('/onboarding');
        return;
      } else {
        setImportStatus('Import failed. Try again later.');
        logger.warn('Google contacts import failed', {
          status: response.status,
        });
      }
    } catch (error) {
      setImportStatus('Import failed. Check your connection.');
      logger.error('Error importing Google contacts', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    } finally {
      setIsImporting(false);
      // Clear status after a delay
      setTimeout(() => setImportStatus(null), 3000);
    }
  };

  /**
   * Saves selected VIPs and continues.
   */
  const handleContinue = async () => {
    setIsSaving(true);

    try {
      if (selectedIds.size > 0) {
        logger.info('Saving VIP selections', { count: selectedIds.size });

        const response = await fetch('/api/contacts/mark-vip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contactIds: Array.from(selectedIds),
          }),
        });

        if (response.ok) {
          const data = await response.json();
          logger.success('VIPs saved', { marked: data.marked });
        } else {
          logger.warn('Failed to save VIPs', { status: response.status });
          toast({
            title: 'Could not save VIP selections',
            description: 'You can set VIPs later in Contacts settings.',
            variant: 'destructive',
          });
        }
      }

      onNext();
    } catch (error) {
      logger.error('Error saving VIPs', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      toast({
        title: 'Could not save VIP selections',
        description: 'You can set VIPs later in Contacts settings.',
        variant: 'destructive',
      });
      // Don't block onboarding on error
      onNext();
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Skips this step.
   */
  const handleSkip = () => {
    logger.info('User skipped Contact Import step');
    onNext();
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
          <Users className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Who matters most?</h2>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          Select contacts you want prioritized. We&apos;ll suggest people based on your
          Google Contacts and email patterns.
        </p>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading suggestions...</p>
        </div>
      )}

      {/* Content */}
      {!isLoading && (
        <div className="space-y-4">
          {/* ─── Google Contacts CTA ─────────────────────────────────────── */}
          {/* State 1: No contacts permission — explain why and redirect to OAuth */}
          {!hasContactsPermission && (
            <div className="rounded-lg border bg-card p-5 space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    Connect your Google Contacts
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    See your starred and important contacts here. This helps us
                    suggest the right VIPs based on your existing contact
                    organization. You&apos;ll be briefly redirected to Google to
                    grant access.
                  </p>
                </div>
              </div>
              <Button
                className="w-full"
                onClick={handleImportFromGoogle}
                disabled={isImporting}
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Connect Google Contacts
                  </>
                )}
              </Button>
            </div>
          )}

          {/* State 2: Permission granted but haven't imported yet — direct import */}
          {hasContactsPermission && !hasImported && !isImporting && suggestions.length === 0 && (
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                  <RefreshCw className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Google Contacts connected</p>
                  <p className="text-xs text-muted-foreground">
                    Import your contacts to see VIP suggestions
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleImportFromGoogle}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Import Contacts
                </Button>
              </div>
            </div>
          )}

          {/* Import Status — shows spinner while importing, check on success */}
          {importStatus && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              {isImporting ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <Check className="h-4 w-4 text-green-500" />
              )}
              {importStatus}
            </div>
          )}

          {/* Selection Controls */}
          {suggestions.length > 0 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {selectedIds.size} of {suggestions.length} selected
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectAll}
                  disabled={selectedIds.size === suggestions.length}
                >
                  Select all
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDeselectAll}
                  disabled={selectedIds.size === 0}
                >
                  Clear
                </Button>
              </div>
            </div>
          )}

          {/* Suggestions List */}
          {suggestions.length > 0 ? (
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {suggestions.map((suggestion) => {
                // Inline arrow closures in .map() create new references each render,
                // which defeats React.memo. Binding handleToggle to the id keeps
                // SuggestionCard from re-rendering unless its own props change.
                return (
                  <SuggestionCard
                    key={suggestion.id}
                    suggestion={suggestion}
                    isSelected={selectedIds.has(suggestion.id)}
                    onToggle={() => handleToggle(suggestion.id)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <Mail className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {hasImported
                  ? 'No VIP suggestions found. You can add VIPs later in Contacts.'
                  : hasContactsPermission
                    ? 'Import your contacts to see VIP suggestions.'
                    : 'Connect Google Contacts above or skip for now.'}
              </p>
            </div>
          )}

          {/* Tip */}
          {suggestions.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
              <Star className="h-3.5 w-3.5 mt-0.5 text-yellow-500" />
              <span>
                <strong>Tip:</strong> VIP emails appear at the top of your inbox with
                special highlighting. You can always add or remove VIPs later in Settings.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t">
        <Button
          variant="ghost"
          onClick={onBack}
          disabled={isFirstStep || isSaving}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <div className="flex gap-2">
          <Button variant="ghost" onClick={handleSkip} disabled={isSaving}>
            Skip for now
          </Button>
          <Button onClick={handleContinue} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                {isLastStep ? 'Finish' : 'Continue'}
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ContactImportStep;
