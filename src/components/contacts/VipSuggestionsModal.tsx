/**
 * VIP Suggestions Modal Component
 *
 * A reusable modal that displays VIP contact suggestions from Google Contacts
 * and email communication patterns. Can be triggered from:
 * - Onboarding flow (ContactImportStep)
 * - Settings page (About Me tab)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```tsx
 * import { VipSuggestionsModal } from '@/components/contacts/VipSuggestionsModal';
 *
 * // In your component:
 * const [isOpen, setIsOpen] = useState(false);
 *
 * <Button onClick={() => setIsOpen(true)}>Import VIPs</Button>
 * <VipSuggestionsModal
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   onVipsSelected={(count) => {
 *     toast({ title: `Added ${count} VIPs` });
 *   }}
 * />
 * ```
 *
 * @module components/contacts/VipSuggestionsModal
 * @since January 2026
 */

'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Button,
  Badge,
  Checkbox,
} from '@/components/ui';
import {
  Users,
  Star,
  Loader2,
  Check,
  UserPlus,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('VipSuggestionsModal');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface VipSuggestionsModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Callback when VIPs are saved (passes count of VIPs marked) */
  onVipsSelected?: (count: number) => void;
}

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
 * Avatar component with initials fallback.
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
        className="w-9 h-9 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
      {initials}
    </div>
  );
}

/**
 * Single suggestion row.
 */
function SuggestionRow({
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
        flex items-center gap-3 p-2.5 rounded-md cursor-pointer
        transition-colors duration-100
        ${isSelected
          ? 'bg-primary/5 border border-primary/30'
          : 'hover:bg-muted/50 border border-transparent'
        }
      `}
      onClick={onToggle}
    >
      <Checkbox checked={isSelected} className="pointer-events-none" />
      <ContactAvatar name={suggestion.name} avatarUrl={suggestion.avatarUrl} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-sm truncate">
            {suggestion.name || suggestion.email}
          </span>
          {suggestion.isGoogleStarred && (
            <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 flex-shrink-0" />
          )}
        </div>
        {suggestion.name && (
          <p className="text-xs text-muted-foreground truncate">
            {suggestion.email}
          </p>
        )}
      </div>
      <Badge variant="secondary" className="text-xs flex-shrink-0">
        {suggestion.suggestionReason}
      </Badge>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function VipSuggestionsModal({
  isOpen,
  onClose,
  onVipsSelected,
}: VipSuggestionsModalProps) {
  // ─────────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────────

  const [suggestions, setSuggestions] = React.useState<VipSuggestion[]>([]);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);
  const [hasContactsPermission, setHasContactsPermission] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // Load suggestions when modal opens
  // ─────────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (isOpen) {
      loadSuggestions();
    }
  }, [isOpen]);

  const loadSuggestions = async () => {
    setIsLoading(true);
    setStatusMessage(null);
    logger.info('Loading VIP suggestions');

    try {
      const response = await fetch('/api/contacts/vip-suggestions?limit=20');

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

  const handleToggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(suggestions.map((s) => s.id)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleImportFromGoogle = async () => {
    setIsImporting(true);
    setStatusMessage('Importing contacts from Google...');
    logger.info('Starting Google contacts import from settings');

    try {
      const response = await fetch('/api/contacts/import-google', {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        setStatusMessage(`Imported ${data.imported} contacts (${data.starred} starred)`);
        setHasContactsPermission(true);

        // Reload suggestions
        setTimeout(() => {
          setStatusMessage(null);
          loadSuggestions();
        }, 1500);
      } else if (response.status === 403) {
        setStatusMessage('Contacts permission needed. Redirecting...');
        setTimeout(() => {
          window.location.href = '/api/auth/google?scope=contacts';
        }, 1000);
      } else {
        setStatusMessage('Import failed. Please try again.');
      }
    } catch (error) {
      setStatusMessage('Import failed. Check your connection.');
      logger.error('Error importing Google contacts', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    } finally {
      setIsImporting(false);
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  const handleSave = async () => {
    if (selectedIds.size === 0) {
      onClose();
      return;
    }

    setIsSaving(true);
    logger.info('Saving VIP selections', { count: selectedIds.size });

    try {
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
        onVipsSelected?.(data.marked);
      }

      onClose();
    } catch (error) {
      logger.error('Error saving VIPs', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Smart VIP Import
          </DialogTitle>
          <DialogDescription>
            Select contacts to mark as VIPs. VIP emails are prioritized in your inbox.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4 py-2">
          {/* Google Import Banner */}
          {!hasContactsPermission && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-dashed">
              <UserPlus className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Import from Google</p>
                <p className="text-xs text-muted-foreground">
                  Get starred contacts and photos
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleImportFromGoogle}
                disabled={isImporting}
              >
                {isImporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          )}

          {/* Status Message */}
          {statusMessage && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Check className="h-4 w-4 text-green-500" />
              {statusMessage}
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading suggestions...</p>
            </div>
          )}

          {/* Suggestions List */}
          {!isLoading && suggestions.length > 0 && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {selectedIds.size} of {suggestions.length} selected
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSelectAll}
                    disabled={selectedIds.size === suggestions.length}
                    className="h-7 text-xs"
                  >
                    Select all
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDeselectAll}
                    disabled={selectedIds.size === 0}
                    className="h-7 text-xs"
                  >
                    Clear
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadSuggestions}
                    disabled={isLoading}
                    className="h-7 text-xs"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-1 pr-1 max-h-[300px]">
                {suggestions.map((suggestion) => (
                  <SuggestionRow
                    key={suggestion.id}
                    suggestion={suggestion}
                    isSelected={selectedIds.has(suggestion.id)}
                    onToggle={() => handleToggle(suggestion.id)}
                  />
                ))}
              </div>
            </>
          )}

          {/* Empty State */}
          {!isLoading && suggestions.length === 0 && (
            <div className="text-center py-8">
              <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No suggestions yet. Sync some emails or import from Google.
              </p>
              {!hasContactsPermission && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleImportFromGoogle}
                  disabled={isImporting}
                  className="mt-3"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                      Import from Google
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-4 border-t">
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : selectedIds.size > 0 ? (
              `Add ${selectedIds.size} VIPs`
            ) : (
              'Done'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default VipSuggestionsModal;
