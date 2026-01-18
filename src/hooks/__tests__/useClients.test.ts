/**
 * Tests for useClients Hook
 *
 * Tests client fetching, CRUD operations, and filtering.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useClients } from '../useClients';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST DATA
// ═══════════════════════════════════════════════════════════════════════════════

const mockClients = [
  {
    id: '1',
    user_id: 'user-1',
    name: 'Acme Corp',
    company: 'Acme Corporation',
    email: 'contact@acme.com',
    status: 'active',
    priority: 'vip',
    email_domains: ['@acme.com'],
    keywords: ['project', 'timeline'],
    notes: 'Key enterprise client',
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-15T10:00:00Z',
  },
  {
    id: '2',
    user_id: 'user-1',
    name: 'StartupXYZ',
    company: 'XYZ Ventures',
    email: 'hello@xyz.io',
    status: 'active',
    priority: 'high',
    email_domains: ['@xyz.io'],
    keywords: ['mvp', 'funding'],
    notes: null,
    created_at: '2026-01-05T10:00:00Z',
    updated_at: '2026-01-10T10:00:00Z',
  },
  {
    id: '3',
    user_id: 'user-1',
    name: 'Old Client',
    company: 'Legacy Inc',
    email: 'info@legacy.com',
    status: 'inactive',
    priority: 'low',
    email_domains: ['@legacy.com'],
    keywords: null,
    notes: 'Project completed',
    created_at: '2025-06-01T10:00:00Z',
    updated_at: '2025-12-01T10:00:00Z',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════════════════════

let mockQueryResult: { data: typeof mockClients | null; error: { message: string } | null };
let mockMutationResult: { data: unknown; error: { message: string } | null };

// Create a proxy-based chainable mock
const createChainableMock = (isMutation = false) => {
  const handler: ProxyHandler<object> = {
    get: (_target, prop) => {
      if (prop === 'then') {
        return (resolve: (value: unknown) => unknown) => {
          const result = isMutation ? mockMutationResult : mockQueryResult;
          return Promise.resolve(result).then(resolve);
        };
      }
      if (prop === 'single') {
        return () => ({
          then: (resolve: (value: unknown) => unknown) => {
            const firstItem = mockQueryResult.data?.[0] || null;
            return Promise.resolve({ data: firstItem, error: mockQueryResult.error }).then(resolve);
          },
        });
      }
      return () => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
};

const mockFrom = vi.fn((table: string) => {
  if (table === 'clients') {
    return {
      select: () => createChainableMock(),
      update: () => createChainableMock(true),
      insert: () => createChainableMock(),
    };
  }
  return createChainableMock();
});

const mockGetUser = vi.fn(() =>
  Promise.resolve({ data: { user: { id: 'user-1' } }, error: null })
);

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: mockFrom,
    auth: {
      getUser: mockGetUser,
    },
  }),
}));

// Mock logger
vi.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({
    start: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════════════════════════

beforeEach(() => {
  vi.clearAllMocks();
  mockQueryResult = { data: mockClients, error: null };
  mockMutationResult = { data: null, error: null };
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('useClients', () => {
  describe('initial fetch', () => {
    it('should start in loading state', () => {
      const { result } = renderHook(() => useClients());

      expect(result.current.isLoading).toBe(true);
      expect(result.current.clients).toEqual([]);
    });

    it('should fetch clients successfully', async () => {
      const { result } = renderHook(() => useClients());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.clients.length).toBeGreaterThan(0);
      expect(result.current.error).toBeNull();
    });

    it('should calculate stats correctly', async () => {
      const { result } = renderHook(() => useClients());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.stats.total).toBe(3);
      expect(result.current.stats.active).toBe(2);
      expect(result.current.stats.inactive).toBe(1);
      expect(result.current.stats.vip).toBe(1);
    });

    it('should handle errors', async () => {
      mockQueryResult = { data: null, error: { message: 'Database error' } };

      const { result } = renderHook(() => useClients());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.error?.message).toBe('Database error');
    });
  });

  describe('filtering', () => {
    it('should accept status filter', async () => {
      const { result } = renderHook(() => useClients({ status: 'active' }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFrom).toHaveBeenCalledWith('clients');
    });

    it('should accept priority filter', async () => {
      const { result } = renderHook(() => useClients({ priority: 'vip' }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFrom).toHaveBeenCalledWith('clients');
    });
  });

  describe('getClient', () => {
    it('should return a specific client by ID', async () => {
      const { result } = renderHook(() => useClients());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const client = result.current.getClient('1');
      expect(client).toBeDefined();
      expect(client?.name).toBe('Acme Corp');
    });

    it('should return undefined for non-existent client', async () => {
      const { result } = renderHook(() => useClients());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const client = result.current.getClient('non-existent');
      expect(client).toBeUndefined();
    });
  });

  describe('updateClient', () => {
    it('should update client properties optimistically', async () => {
      const { result } = renderHook(() => useClients());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.updateClient('1', { priority: 'high' });
      });

      const updatedClient = result.current.clients.find((c) => c.id === '1');
      expect(updatedClient?.priority).toBe('high');
    });
  });

  describe('deleteClient', () => {
    it('should remove client from list (soft delete)', async () => {
      const { result } = renderHook(() => useClients());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialLength = result.current.clients.length;

      await act(async () => {
        await result.current.deleteClient('1');
      });

      expect(result.current.clients).toHaveLength(initialLength - 1);
      expect(result.current.clients.find((c) => c.id === '1')).toBeUndefined();
    });
  });

  describe('refetch', () => {
    it('should have refetch function', async () => {
      const { result } = renderHook(() => useClients());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.refetch).toBe('function');
    });
  });
});
