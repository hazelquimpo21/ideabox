/**
 * VIP Suggestions Modal Component
 *
 * A reusable modal that displays VIP contact suggestions from Google Contacts
 * and email communication patterns. Can be triggered from:
 * - Onboarding flow (ContactImportStep)
 * - Settings page (About Me tab)
 *
 * Features a tabbed interface for:
 * - Suggested: AI-suggested contacts based on email frequency and Google starred
 * - All Contacts: Browse all imported contacts
 * - Search/filter functionality
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
  Input,
} from '@/components/ui';
import {
  Users,
  Star,
  Loader2,
  Check,
  UserPlus,
  Sparkles,
  RefreshCw,
  Search,
  List,
  Zap,
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

/** Tab types for the modal view */
type ViewTab = 'suggested' | 'all';

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
  showReason = true,
}: {
  suggestion: VipSuggestion;
  isSelected: boolean;
  onToggle: () => void;
  showReason?: boolean;
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
      {showReason && suggestion.suggestionReason && (
        <Badge variant="secondary" className="text-xs flex-shrink-0">
          {suggestion.suggestionReason}
        </Badge>
      )}
      {!showReason && suggestion.emailCount > 0 && (
        <span className="text-xs text-muted-foreground flex-shrink-0">
          {suggestion.emailCount} emails
        </span>
      )}
    </div>
  );
}

/**
 * Filter contacts by search query.
 */
function filterContacts(contacts: VipSuggestion[], query: string): VipSuggestion[] {
  if (!query.trim()) return contacts;
  const lower = query.toLowerCase();
  return contacts.filter(
    (c) =>
      c.email.toLowerCase().includes(lower) ||
      (c.name && c.name.toLowerCase().includes(lower))
  );
}

/**
 * Suggested tab content.
 */
function SuggestedTabContent({
  suggestions,
  selectedIds,
  isLoading,
  searchQuery,
  hasContactsPermission,
  isImporting,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onImportFromGoogle,
}: {
  suggestions: VipSuggestion[];
  selectedIds: Set<string>;
  isLoading: boolean;
  searchQuery: string;
  hasContactsPermission: boolean;
  isImporting: boolean;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onImportFromGoogle: () => void;
}) {
  const filteredSuggestions = filterContacts(suggestions, searchQuery);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading suggestions...</p>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="text-center py-8">
        <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          No suggestions yet. Sync some emails or import from Google.
        </p>
        {!hasContactsPermission && (
          <Button
            variant="outline"
            size="sm"
            onClick={onImportFromGoogle}
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
    );
  }

  if (filteredSuggestions.length === 0) {
    return (
      <div className="text-center py-8">
        <Search className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          No contacts match &quot;{searchQuery}&quot;
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {selectedIds.size} selected
          {searchQuery && ` (showing ${filteredSuggestions.length} of ${suggestions.length})`}
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onSelectAll}
            className="h-7 text-xs"
          >
            Select all
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDeselectAll}
            disabled={selectedIds.size === 0}
            className="h-7 text-xs"
          >
            Clear
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 pr-1 max-h-[280px]">
        {filteredSuggestions.map((suggestion) => (
          <SuggestionRow
            key={suggestion.id}
            suggestion={suggestion}
            isSelected={selectedIds.has(suggestion.id)}
            onToggle={() => onToggle(suggestion.id)}
          />
        ))}
      </div>
    </>
  );
}

/**
 * All contacts tab content.
 */
function AllContactsTabContent({
  contacts,
  selectedIds,
  isLoading,
  searchQuery,
  onToggle,
  onSelectAll,
  onDeselectAll,
}: {
  contacts: VipSuggestion[];
  selectedIds: Set<string>;
  isLoading: boolean;
  searchQuery: string;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}) {
  const filteredContacts = filterContacts(contacts, searchQuery);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading all contacts...</p>
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="text-center py-8">
        <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          No contacts found. Import from Google or sync emails first.
        </p>
      </div>
    );
  }

  if (filteredContacts.length === 0) {
    return (
      <div className="text-center py-8">
        <Search className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          No contacts match &quot;{searchQuery}&quot;
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {selectedIds.size} selected
          {searchQuery && ` (showing ${filteredContacts.length} of ${contacts.length})`}
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onSelectAll}
            className="h-7 text-xs"
          >
            Select all{searchQuery ? ' visible' : ''}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDeselectAll}
            disabled={selectedIds.size === 0}
            className="h-7 text-xs"
          >
            Clear
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 pr-1 max-h-[280px]">
        {filteredContacts.map((contact) => (
          <SuggestionRow
            key={contact.id}
            suggestion={contact}
            isSelected={selectedIds.has(contact.id)}
            onToggle={() => onToggle(contact.id)}
            showReason={false}
          />
        ))}
      </div>
    </>
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
  const [allContacts, setAllContacts] = React.useState<VipSuggestion[]>([]);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = React.useState(false);
  const [isLoadingAll, setIsLoadingAll] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);
  const [hasContactsPermission, setHasContactsPermission] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<ViewTab>('suggested');
  const [searchQuery, setSearchQuery] = React.useState('');

  // ─────────────────────────────────────────────────────────────────────────────
  // Load suggestions when modal opens
  // ─────────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (isOpen) {
      loadSuggestions();
    }
  }, [isOpen]);

  // Load all contacts when switching to "all" tab
  React.useEffect(() => {
    if (isOpen && activeTab === 'all' && allContacts.length === 0) {
      loadAllContacts();
    }
  }, [isOpen, activeTab, allContacts.length]);

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

  const loadAllContacts = async () => {
    setIsLoadingAll(true);
    logger.info('Loading all contacts');

    try {
      const response = await fetch('/api/contacts/vip-suggestions?limit=100&includeAll=true');

      if (response.ok) {
        const data = await response.json();
        setAllContacts(data.suggestions || []);

        logger.info('All contacts loaded', {
          count: data.suggestions?.length || 0,
        });
      }
    } catch (error) {
      logger.error('Error loading all contacts', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    } finally {
      setIsLoadingAll(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const handleToggle = (id: string) => {
    setSelectedIds((prev: Set<string>) => {
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
    // Select all from the currently active tab (filtered by search)
    const currentList = activeTab === 'suggested' ? suggestions : allContacts;
    const filtered = filterContacts(currentList, searchQuery);
    setSelectedIds((prev: Set<string>) => {
      const next = new Set(prev);
      filtered.forEach((c) => next.add(c.id));
      return next;
    });
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
    <Dialog open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
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

        <div className="flex-1 overflow-hidden flex flex-col gap-3 py-2">
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

          {/* Tabs and Search */}
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border p-0.5 bg-muted/30">
              <button
                onClick={() => setActiveTab('suggested')}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors
                  ${activeTab === 'suggested'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                  }
                `}
              >
                <Zap className="h-3 w-3" />
                Suggested
              </button>
              <button
                onClick={() => setActiveTab('all')}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors
                  ${activeTab === 'all'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                  }
                `}
              >
                <List className="h-3 w-3" />
                All Contacts
              </button>
            </div>
            <div className="flex-1 relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => activeTab === 'suggested' ? loadSuggestions() : loadAllContacts()}
              disabled={isLoading || isLoadingAll}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${(isLoading || isLoadingAll) ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {/* Content based on active tab */}
          {activeTab === 'suggested' ? (
            <SuggestedTabContent
              suggestions={suggestions}
              selectedIds={selectedIds}
              isLoading={isLoading}
              searchQuery={searchQuery}
              hasContactsPermission={hasContactsPermission}
              isImporting={isImporting}
              onToggle={handleToggle}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
              onImportFromGoogle={handleImportFromGoogle}
            />
          ) : (
            <AllContactsTabContent
              contacts={allContacts}
              selectedIds={selectedIds}
              isLoading={isLoadingAll}
              searchQuery={searchQuery}
              onToggle={handleToggle}
              onSelectAll={() => {
                const filtered = filterContacts(allContacts, searchQuery);
                setSelectedIds(new Set(filtered.map((c) => c.id)));
              }}
              onDeselectAll={handleDeselectAll}
            />
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
