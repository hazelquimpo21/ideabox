/**
 * ClientInsights Component
 *
 * Displays detected and suggested clients from email analysis.
 * Shows email counts, action items, and relationship signals.
 *
 * @module components/discover/ClientInsights
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ClientInsight, RelationshipSignal } from '@/types/discovery';

// =============================================================================
// TYPES
// =============================================================================

export interface ClientInsightsProps {
  /** Array of client insights */
  insights: ClientInsight[];
  /** Callback when "Add as client" is clicked */
  onAddClient?: (clientName: string) => void;
  /** Maximum clients to show before "show more" */
  maxVisible?: number;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get display properties for relationship signal.
 */
function getSignalDisplay(signal: RelationshipSignal): {
  icon: string;
  label: string;
  color: string;
} {
  switch (signal) {
    case 'positive':
      return { icon: '😊', label: 'Positive', color: 'text-green-600' };
    case 'negative':
      return { icon: '😟', label: 'Needs attention', color: 'text-red-600' };
    case 'neutral':
      return { icon: '😐', label: 'Neutral', color: 'text-gray-600' };
    default:
      return { icon: '❓', label: 'Unknown', color: 'text-gray-400' };
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Displays client insights with add-client functionality.
 *
 * @example
 * ```tsx
 * <ClientInsights
 *   insights={result.clientInsights}
 *   onAddClient={(name) => openAddClientModal(name)}
 * />
 * ```
 */
export function ClientInsights({
  insights,
  onAddClient,
  maxVisible = 5,
}: ClientInsightsProps) {
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);

  // Separate known clients from suggestions
  const knownClients = insights.filter((c) => !c.isNewSuggestion);
  const suggestedClients = insights.filter((c) => c.isNewSuggestion);

  // Determine visible items
  const visibleKnown = showAll
    ? knownClients
    : knownClients.slice(0, maxVisible);
  const visibleSuggested = showAll
    ? suggestedClients
    : suggestedClients.slice(0, Math.max(0, maxVisible - visibleKnown.length));

  const hasMore =
    knownClients.length + suggestedClients.length > maxVisible;

  // ───────────────────────────────────────────────────────────────────────────
  // Empty State
  // ───────────────────────────────────────────────────────────────────────────

  if (insights.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <span>🏢</span>
            Client Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            No client emails detected. Add clients in settings to start tracking.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Render Client Row
  // ───────────────────────────────────────────────────────────────────────────

  const renderClientRow = (client: ClientInsight) => {
    const signal = getSignalDisplay(client.relationshipSignal);

    return (
      <div
        key={client.clientId || client.clientName}
        className={`
          flex items-center justify-between p-3 rounded-lg
          ${client.isNewSuggestion ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}
          hover:bg-gray-100 transition-colors cursor-pointer
        `}
        onClick={() => {
          if (client.clientId) {
            // UPDATED (Feb 2026): /clients/[id] → /contacts/[id] per Navigation Redesign
            router.push(`/contacts/${client.clientId}`);
          }
        }}
      >
        <div className="flex-1 min-w-0">
          {/* Client name with new badge */}
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{client.clientName}</span>
            {client.isNewSuggestion && (
              <Badge variant="outline" className="text-xs bg-amber-100 border-amber-300">
                Suggested
              </Badge>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span>{client.emailCount} emails</span>
            {client.actionRequiredCount > 0 && (
              <span className="text-red-600">
                {client.actionRequiredCount} need response
              </span>
            )}
            <span className={signal.color} title={signal.label}>
              {signal.icon}
            </span>
          </div>

          {/* Sample subject */}
          <p className="text-xs text-muted-foreground mt-1 truncate">
            &ldquo;{client.sampleSubject}&rdquo;
          </p>
        </div>

        {/* Add client button for suggestions */}
        {client.isNewSuggestion && onAddClient && (
          <Button
            variant="outline"
            size="sm"
            className="ml-2 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onAddClient(client.clientName);
            }}
          >
            + Add
          </Button>
        )}
      </div>
    );
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <span>🏢</span>
          Client Insights
          <Badge variant="secondary" className="ml-2">
            {insights.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Known Clients Section */}
        {visibleKnown.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Your Clients
            </h4>
            {visibleKnown.map(renderClientRow)}
          </div>
        )}

        {/* Suggested Clients Section */}
        {visibleSuggested.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <span>💡</span>
              Potential New Clients
            </h4>
            {visibleSuggested.map(renderClientRow)}
          </div>
        )}

        {/* Show More Button */}
        {hasMore && !showAll && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => setShowAll(true)}
          >
            Show all {insights.length} clients
          </Button>
        )}

        {showAll && hasMore && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => setShowAll(false)}
          >
            Show less
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// EXPORTS
// =============================================================================

export default ClientInsights;
