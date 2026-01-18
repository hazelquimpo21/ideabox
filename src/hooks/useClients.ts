/**
 * 🏢 useClients Hook
 *
 * React hook for fetching, filtering, and managing client data from Supabase.
 * Provides CRUD operations for client management.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Fetches clients with status/priority filtering
 * - Provides email counts per client
 * - Supports optimistic updates for CRUD operations
 * - Auto-refreshes when clients are modified
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 * ```tsx
 * // Basic usage
 * const { clients, isLoading, createClient, updateClient } = useClients();
 *
 * // With status filter
 * const { clients } = useClients({ status: 'active' });
 *
 * // With priority filter
 * const { clients } = useClients({ priority: 'vip' });
 * ```
 *
 * @module hooks/useClients
 */

'use client';

import * as React from 'react';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';
import type { Client, ClientStatus, ClientPriority } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Default number of clients to fetch */
const DEFAULT_LIMIT = 100;

/** Logger instance for this hook */
const logger = createLogger('useClients');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Options for filtering clients.
 */
export interface UseClientsOptions {
  /** Filter by client status */
  status?: ClientStatus | 'all';
  /** Filter by priority level */
  priority?: ClientPriority;
  /** Maximum number of clients to fetch */
  limit?: number;
  /** Sort by name (default), priority, or email count */
  sortBy?: 'name' | 'priority' | 'created_at';
}

/**
 * Client with additional computed fields.
 */
export interface ClientWithStats extends Client {
  /** Number of emails associated with this client */
  emailCount?: number;
  /** Number of pending actions for this client */
  pendingActions?: number;
}

/**
 * Client statistics for dashboard display.
 */
export interface ClientStats {
  /** Total number of clients */
  total: number;
  /** Number of active clients */
  active: number;
  /** Number of inactive clients */
  inactive: number;
  /** Number of VIP clients */
  vip: number;
}

/**
 * Return value from the useClients hook.
 */
export interface UseClientsReturn {
  /** Array of client objects */
  clients: ClientWithStats[];
  /** Loading state */
  isLoading: boolean;
  /** Error object if fetch failed */
  error: Error | null;
  /** Refetch clients with current filters */
  refetch: () => Promise<void>;
  /** Create a new client */
  createClient: (client: Omit<Client, 'id' | 'created_at' | 'updated_at' | 'user_id'>) => Promise<Client | null>;
  /** Update an existing client */
  updateClient: (id: string, updates: Partial<Client>) => Promise<void>;
  /** Delete a client (marks as archived) */
  deleteClient: (id: string) => Promise<void>;
  /** Get a single client by ID */
  getClient: (id: string) => ClientWithStats | undefined;
  /** Client statistics */
  stats: ClientStats;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculates client statistics from an array of clients.
 */
function calculateStats(clients: Client[]): ClientStats {
  return {
    total: clients.length,
    active: clients.filter((c) => c.status === 'active').length,
    inactive: clients.filter((c) => c.status === 'inactive').length,
    vip: clients.filter((c) => c.priority === 'vip').length,
  };
}

/**
 * Priority order for sorting (higher = more important).
 */
const PRIORITY_ORDER: Record<ClientPriority, number> = {
  vip: 4,
  high: 3,
  medium: 2,
  low: 1,
};

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook for fetching and managing clients from Supabase.
 *
 * @param options - Filtering and sorting options
 * @returns Client data, loading state, and control functions
 *
 * @example
 * ```tsx
 * function ClientsPage() {
 *   const { clients, isLoading, createClient, stats } = useClients({
 *     status: 'active',
 *     sortBy: 'priority',
 *   });
 *
 *   const handleCreate = async () => {
 *     await createClient({
 *       name: 'Acme Corp',
 *       company: 'Acme Corporation',
 *       email: 'contact@acme.com',
 *     });
 *   };
 *
 *   return (
 *     <div>
 *       <StatsBar stats={stats} />
 *       <ClientList clients={clients} />
 *       <Button onClick={handleCreate}>Add Client</Button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useClients(options: UseClientsOptions = {}): UseClientsReturn {
  // ───────────────────────────────────────────────────────────────────────────
  // State
  // ───────────────────────────────────────────────────────────────────────────

  const [clients, setClients] = React.useState<ClientWithStats[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);
  const [stats, setStats] = React.useState<ClientStats>({
    total: 0,
    active: 0,
    inactive: 0,
    vip: 0,
  });

  // Memoize the Supabase client
  const supabase = React.useMemo(() => createSupabaseClient(), []);

  // Destructure options with defaults
  const {
    status = 'all',
    priority,
    limit = DEFAULT_LIMIT,
    sortBy = 'name',
  } = options;

  // ───────────────────────────────────────────────────────────────────────────
  // Fetch Clients
  // ───────────────────────────────────────────────────────────────────────────

  const fetchClients = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);

    logger.start('Fetching clients', { status, priority, limit, sortBy });

    try {
      // Build the base query
      let query = supabase.from('clients').select('*').limit(limit);

      // Apply status filter (exclude archived by default)
      if (status !== 'all') {
        query = query.eq('status', status);
      } else {
        // By default, don't show archived clients
        query = query.neq('status', 'archived');
      }

      // Apply priority filter
      if (priority) {
        query = query.eq('priority', priority);
      }

      // Apply sorting
      switch (sortBy) {
        case 'priority':
          // Sort by priority level descending, then by name
          query = query.order('priority', { ascending: false }).order('name');
          break;
        case 'created_at':
          query = query.order('created_at', { ascending: false });
          break;
        case 'name':
        default:
          query = query.order('name');
      }

      const { data, error: queryError } = await query;

      if (queryError) {
        throw new Error(queryError.message);
      }

      let fetchedClients = data || [];

      // Sort by priority order if sorting by priority
      if (sortBy === 'priority') {
        fetchedClients = fetchedClients.sort((a, b) => {
          const aOrder = PRIORITY_ORDER[a.priority as ClientPriority] || 0;
          const bOrder = PRIORITY_ORDER[b.priority as ClientPriority] || 0;
          return bOrder - aOrder;
        });
      }

      setClients(fetchedClients);
      setStats(calculateStats(fetchedClients));

      logger.success('Clients fetched', { count: fetchedClients.length });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to fetch clients', { error: errorMessage });
      setError(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setIsLoading(false);
    }
  }, [supabase, status, priority, limit, sortBy]);

  // ───────────────────────────────────────────────────────────────────────────
  // Create Client
  // ───────────────────────────────────────────────────────────────────────────

  const createNewClient = React.useCallback(
    async (
      newClient: Omit<Client, 'id' | 'created_at' | 'updated_at' | 'user_id'>
    ): Promise<Client | null> => {
      logger.start('Creating client', { name: newClient.name });

      try {
        // Get the current user ID
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          throw new Error('User not authenticated');
        }

        const clientData = {
          ...newClient,
          user_id: user.id,
          status: newClient.status || 'active',
          priority: newClient.priority || 'medium',
        };

        const { data, error: insertError } = await supabase
          .from('clients')
          .insert(clientData)
          .select()
          .single();

        if (insertError) {
          throw new Error(insertError.message);
        }

        // Add to local state
        if (data) {
          setClients((prev) => {
            const updated = [...prev, data];
            // Re-sort based on current sort option
            if (sortBy === 'name') {
              updated.sort((a, b) => a.name.localeCompare(b.name));
            }
            return updated;
          });
          setStats(() => calculateStats([...clients, data]));
        }

        logger.success('Client created', { id: data?.id, name: data?.name });
        return data;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Failed to create client', { error: errorMessage });
        setError(err instanceof Error ? err : new Error(errorMessage));
        return null;
      }
    },
    [supabase, clients, sortBy]
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Update Client
  // ───────────────────────────────────────────────────────────────────────────

  const updateClient = React.useCallback(
    async (id: string, updates: Partial<Client>) => {
      logger.start('Updating client', { id, updates });

      const originalClient = clients.find((c) => c.id === id);
      if (!originalClient) return;

      // Optimistic update
      setClients((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
      );

      try {
        const { error: updateError } = await supabase
          .from('clients')
          .update(updates)
          .eq('id', id);

        if (updateError) {
          throw new Error(updateError.message);
        }

        // Recalculate stats
        setStats(calculateStats(clients.map((c) => (c.id === id ? { ...c, ...updates } : c))));

        logger.success('Client updated', { id });
      } catch (err) {
        // Revert on error
        setClients((prev) =>
          prev.map((c) => (c.id === id ? originalClient : c))
        );

        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Failed to update client', { id, error: errorMessage });
        setError(err instanceof Error ? err : new Error(errorMessage));
      }
    },
    [supabase, clients]
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Delete Client (Archive)
  // ───────────────────────────────────────────────────────────────────────────

  const deleteClient = React.useCallback(
    async (id: string) => {
      logger.start('Archiving client', { id });

      const originalClients = [...clients];

      // Optimistic removal from list
      setClients((prev) => prev.filter((c) => c.id !== id));

      try {
        // Soft delete: mark as archived instead of hard delete
        const { error: updateError } = await supabase
          .from('clients')
          .update({ status: 'archived' as ClientStatus })
          .eq('id', id);

        if (updateError) {
          throw new Error(updateError.message);
        }

        // Update stats
        setStats(calculateStats(clients.filter((c) => c.id !== id)));

        logger.success('Client archived', { id });
      } catch (err) {
        // Revert on error
        setClients(originalClients);

        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Failed to archive client', { id, error: errorMessage });
        setError(err instanceof Error ? err : new Error(errorMessage));
      }
    },
    [supabase, clients]
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Get Single Client
  // ───────────────────────────────────────────────────────────────────────────

  const getClient = React.useCallback(
    (id: string): ClientWithStats | undefined => {
      return clients.find((c) => c.id === id);
    },
    [clients]
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Effects
  // ───────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // ───────────────────────────────────────────────────────────────────────────
  // Return
  // ───────────────────────────────────────────────────────────────────────────

  return {
    clients,
    isLoading,
    error,
    refetch: fetchClients,
    createClient: createNewClient,
    updateClient,
    deleteClient,
    getClient,
    stats,
  };
}

export default useClients;
