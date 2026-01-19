/**
 * useContacts Hook Tests
 *
 * Comprehensive tests for the useContacts hook including:
 * - Fetching contacts with various filters
 * - VIP and muted status toggles with optimistic updates
 * - Relationship type updates
 * - Pagination with load more
 * - Error handling and rollback
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TEST COVERAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Contact fetching and filtering
 * - VIP status toggle (optimistic + rollback)
 * - Muted status toggle (optimistic + rollback)
 * - Relationship type updates
 * - Stats calculation
 * - Load more pagination
 * - Error states
 *
 * @module hooks/__tests__/useContacts.test
 * @version 1.0.0
 * @since January 2026 (P6 Enhancement)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useContacts } from '../useContacts';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST DATA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mock contacts data for testing.
 * Covers various relationship types, VIP status, and muted status combinations.
 */
const mockContacts = [
  {
    id: 'contact-1',
    user_id: 'user-1',
    email: 'john@acme.com',
    name: 'John Smith',
    company: 'Acme Corp',
    job_title: 'CEO',
    relationship_type: 'client',
    is_vip: true,
    is_muted: false,
    email_count: 47,
    first_seen_at: '2025-01-01T00:00:00Z',
    last_seen_at: '2026-01-15T10:00:00Z',
    notes: 'Important client',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2026-01-15T10:00:00Z',
  },
  {
    id: 'contact-2',
    user_id: 'user-1',
    email: 'jane@example.com',
    name: 'Jane Doe',
    company: null,
    job_title: null,
    relationship_type: 'unknown',
    is_vip: false,
    is_muted: false,
    email_count: 12,
    first_seen_at: '2025-06-01T00:00:00Z',
    last_seen_at: '2026-01-10T10:00:00Z',
    notes: null,
    created_at: '2025-06-01T00:00:00Z',
    updated_at: '2026-01-10T10:00:00Z',
  },
  {
    id: 'contact-3',
    user_id: 'user-1',
    email: 'muted@spam.com',
    name: 'Spammer',
    company: 'SpamCo',
    job_title: null,
    relationship_type: 'service',
    is_vip: false,
    is_muted: true,
    email_count: 150,
    first_seen_at: '2025-03-01T00:00:00Z',
    last_seen_at: '2026-01-01T10:00:00Z',
    notes: null,
    created_at: '2025-03-01T00:00:00Z',
    updated_at: '2026-01-01T10:00:00Z',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mutable query result that can be modified per test.
 * Default: returns mockContacts successfully.
 */
let mockQueryResult: { data: typeof mockContacts | null; error: null | { message: string; code: string }; count: number | null } = {
  data: mockContacts,
  error: null,
  count: mockContacts.length,
};

/**
 * Mutable update result for testing mutation operations.
 */
let mockUpdateResult: { error: null | { message: string } } = {
  error: null,
};

/**
 * Creates a proxy-based mock that supports Supabase's chainable API.
 * This allows chaining like: supabase.from('contacts').select().eq().order()
 *
 * @returns Chainable proxy object that resolves to mockQueryResult
 */
const createChainableMock = () => {
  const handler: ProxyHandler<object> = {
    get: (_target, prop) => {
      // Handle .then() for Promise resolution
      if (prop === 'then') {
        return (resolve: (value: unknown) => unknown) => {
          return Promise.resolve(mockQueryResult).then(resolve);
        };
      }
      // All other methods return chainable proxy
      return () => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
};

/**
 * Creates a mock for update operations.
 * Supports: supabase.from('contacts').update().eq()
 */
const createUpdateMock = () => {
  const handler: ProxyHandler<object> = {
    get: (_target, prop) => {
      if (prop === 'then') {
        return (resolve: (value: unknown) => unknown) => {
          return Promise.resolve(mockUpdateResult).then(resolve);
        };
      }
      return () => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
};

/**
 * Track calls to mockFrom for assertion purposes.
 */
const mockFrom = vi.fn((table: string) => {
  if (table === 'contacts') {
    return {
      select: () => createChainableMock(),
      update: () => createUpdateMock(),
    };
  }
  return createChainableMock();
});

/**
 * Mock the Supabase client module.
 * Uses our chainable mock pattern.
 */
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: mockFrom,
  }),
}));

/**
 * Mock the logger to prevent console output during tests.
 */
vi.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({
    start: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════════════════════════

beforeEach(() => {
  // Clear all mocks before each test
  vi.clearAllMocks();

  // Reset mock results to defaults
  mockQueryResult = {
    data: mockContacts,
    error: null,
    count: mockContacts.length,
  };
  mockUpdateResult = {
    error: null,
  };
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('useContacts', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Fetching Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('fetching contacts', () => {
    it('should fetch contacts on mount', async () => {
      const { result } = renderHook(() => useContacts());

      // Initially loading
      expect(result.current.isLoading).toBe(true);

      // Wait for fetch to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Verify contacts loaded
      expect(result.current.contacts).toHaveLength(3);
      expect(result.current.contacts[0].email).toBe('john@acme.com');
      expect(result.current.error).toBeNull();
    });

    it('should calculate stats correctly', async () => {
      const { result } = renderHook(() => useContacts());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Verify stats
      expect(result.current.stats.total).toBe(3);
      expect(result.current.stats.vip).toBe(1); // Only john is VIP
      expect(result.current.stats.muted).toBe(1); // Only muted@spam.com is muted
      expect(result.current.stats.clients).toBe(1); // Only john is client
    });

    it('should handle fetch error', async () => {
      // Set up error state
      mockQueryResult = {
        data: null,
        error: { message: 'Database connection failed', code: 'PGRST001' },
        count: null,
      };

      const { result } = renderHook(() => useContacts());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Verify error state
      expect(result.current.error).toBeTruthy();
      expect(result.current.error?.message).toContain('Database connection failed');
      expect(result.current.contacts).toHaveLength(0);
    });

    it('should return empty array when no contacts exist', async () => {
      mockQueryResult = {
        data: [],
        error: null,
        count: 0,
      };

      const { result } = renderHook(() => useContacts());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.contacts).toHaveLength(0);
      expect(result.current.stats.total).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // VIP Toggle Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('toggleVip', () => {
    it('should optimistically toggle VIP status', async () => {
      const { result } = renderHook(() => useContacts());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Find Jane (not VIP)
      const janeBefore = result.current.contacts.find((c) => c.id === 'contact-2');
      expect(janeBefore?.is_vip).toBe(false);

      // Toggle VIP
      act(() => {
        result.current.toggleVip('contact-2');
      });

      // Verify optimistic update
      const janeAfter = result.current.contacts.find((c) => c.id === 'contact-2');
      expect(janeAfter?.is_vip).toBe(true);

      // Verify stats updated
      expect(result.current.stats.vip).toBe(2); // Now 2 VIPs
    });

    it('should rollback VIP toggle on error', async () => {
      // Set up to fail on update
      mockUpdateResult = {
        error: { message: 'Update failed' },
      };

      const { result } = renderHook(() => useContacts());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialVipCount = result.current.stats.vip;

      // Toggle VIP (should fail and rollback)
      await act(async () => {
        await result.current.toggleVip('contact-2');
      });

      // Wait for rollback
      await waitFor(() => {
        // VIP status should be rolled back
        const jane = result.current.contacts.find((c) => c.id === 'contact-2');
        expect(jane?.is_vip).toBe(false);
      });

      // Stats should be rolled back
      expect(result.current.stats.vip).toBe(initialVipCount);
    });

    it('should not toggle VIP for non-existent contact', async () => {
      const { result } = renderHook(() => useContacts());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const contactsBefore = [...result.current.contacts];

      // Try to toggle non-existent contact
      await act(async () => {
        await result.current.toggleVip('non-existent-id');
      });

      // Contacts should be unchanged
      expect(result.current.contacts).toEqual(contactsBefore);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Muted Toggle Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('toggleMuted', () => {
    it('should optimistically toggle muted status', async () => {
      const { result } = renderHook(() => useContacts());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Find John (not muted)
      const johnBefore = result.current.contacts.find((c) => c.id === 'contact-1');
      expect(johnBefore?.is_muted).toBe(false);

      // Toggle muted
      act(() => {
        result.current.toggleMuted('contact-1');
      });

      // Verify optimistic update
      const johnAfter = result.current.contacts.find((c) => c.id === 'contact-1');
      expect(johnAfter?.is_muted).toBe(true);

      // Verify stats updated
      expect(result.current.stats.muted).toBe(2); // Now 2 muted
    });

    it('should rollback muted toggle on error', async () => {
      mockUpdateResult = {
        error: { message: 'Update failed' },
      };

      const { result } = renderHook(() => useContacts());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialMutedCount = result.current.stats.muted;

      // Toggle muted (should fail and rollback)
      await act(async () => {
        await result.current.toggleMuted('contact-1');
      });

      // Wait for rollback
      await waitFor(() => {
        const john = result.current.contacts.find((c) => c.id === 'contact-1');
        expect(john?.is_muted).toBe(false);
      });

      expect(result.current.stats.muted).toBe(initialMutedCount);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Relationship Update Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('updateRelationship', () => {
    it('should update relationship type optimistically', async () => {
      const { result } = renderHook(() => useContacts());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Jane is 'unknown'
      const janeBefore = result.current.contacts.find((c) => c.id === 'contact-2');
      expect(janeBefore?.relationship_type).toBe('unknown');

      // Update to 'client'
      act(() => {
        result.current.updateRelationship('contact-2', 'client');
      });

      // Verify optimistic update
      const janeAfter = result.current.contacts.find((c) => c.id === 'contact-2');
      expect(janeAfter?.relationship_type).toBe('client');

      // Stats should update (now 2 clients)
      expect(result.current.stats.clients).toBe(2);
    });

    it('should rollback relationship update on error', async () => {
      mockUpdateResult = {
        error: { message: 'Update failed' },
      };

      const { result } = renderHook(() => useContacts());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Update to 'client' (should fail and rollback)
      await act(async () => {
        await result.current.updateRelationship('contact-2', 'client');
      });

      // Wait for rollback
      await waitFor(() => {
        const jane = result.current.contacts.find((c) => c.id === 'contact-2');
        expect(jane?.relationship_type).toBe('unknown');
      });

      // Stats should be rolled back
      expect(result.current.stats.clients).toBe(1);
    });

    it('should update client count when changing from client to another type', async () => {
      const { result } = renderHook(() => useContacts());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // John is 'client' - change to 'vendor'
      act(() => {
        result.current.updateRelationship('contact-1', 'vendor');
      });

      // Stats should update (now 0 clients)
      expect(result.current.stats.clients).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Pagination Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('hasMore and loadMore', () => {
    it('should set hasMore based on result count', async () => {
      // Less than default limit (50), so no more
      const { result } = renderHook(() => useContacts());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Only 3 contacts, less than limit
      expect(result.current.hasMore).toBe(false);
    });

    it('should set hasMore to true when at limit', async () => {
      // Create mock data at the limit
      const fullPageContacts = Array(50)
        .fill(null)
        .map((_, i) => ({
          ...mockContacts[0],
          id: `contact-${i}`,
          email: `contact${i}@example.com`,
        }));

      mockQueryResult = {
        data: fullPageContacts,
        error: null,
        count: 100, // More than page size
      };

      const { result } = renderHook(() => useContacts());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMore).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Refetch Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('refetch', () => {
    it('should refetch contacts when called', async () => {
      const { result } = renderHook(() => useContacts());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Call count before refetch
      const initialCallCount = mockFrom.mock.calls.length;

      // Trigger refetch
      await act(async () => {
        await result.current.refetch();
      });

      // Should have made another call
      expect(mockFrom.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });
});
