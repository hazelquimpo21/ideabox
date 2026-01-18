/**
 * Tests for useActions Hook
 *
 * Tests action fetching, CRUD operations, and toggle functionality.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useActions } from '../useActions';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST DATA
// ═══════════════════════════════════════════════════════════════════════════════

const mockActions = [
  {
    id: '1',
    user_id: 'user-1',
    email_id: 'email-1',
    client_id: 'client-1',
    title: 'Review proposal',
    description: 'Review the Q4 budget proposal',
    action_type: 'review',
    priority: 'high',
    urgency_score: 8,
    deadline: '2026-01-20T17:00:00Z',
    estimated_minutes: 30,
    status: 'pending',
    completed_at: null,
    created_at: '2026-01-18T10:00:00Z',
    updated_at: '2026-01-18T10:00:00Z',
  },
  {
    id: '2',
    user_id: 'user-1',
    email_id: 'email-2',
    client_id: null,
    title: 'Reply to John',
    description: 'Follow up on meeting request',
    action_type: 'respond',
    priority: 'medium',
    urgency_score: 5,
    deadline: null,
    estimated_minutes: 10,
    status: 'in_progress',
    completed_at: null,
    created_at: '2026-01-17T10:00:00Z',
    updated_at: '2026-01-17T10:00:00Z',
  },
  {
    id: '3',
    user_id: 'user-1',
    email_id: null,
    client_id: null,
    title: 'Completed task',
    description: 'This one is done',
    action_type: 'create',
    priority: 'low',
    urgency_score: 2,
    deadline: null,
    estimated_minutes: 15,
    status: 'completed',
    completed_at: '2026-01-16T10:00:00Z',
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-01-16T10:00:00Z',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════════════════════

let mockQueryResult: { data: typeof mockActions | null; error: { message: string } | null };
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
      // 'single' returns the first item
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
  if (table === 'actions') {
    return {
      select: () => createChainableMock(),
      update: () => createChainableMock(true),
      insert: () => createChainableMock(),
      delete: () => createChainableMock(true),
    };
  }
  return createChainableMock();
});

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: mockFrom,
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
  mockQueryResult = { data: mockActions, error: null };
  mockMutationResult = { data: null, error: null };
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('useActions', () => {
  describe('initial fetch', () => {
    it('should start in loading state', () => {
      const { result } = renderHook(() => useActions());

      expect(result.current.isLoading).toBe(true);
      expect(result.current.actions).toEqual([]);
    });

    it('should fetch actions successfully', async () => {
      const { result } = renderHook(() => useActions());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.actions).toHaveLength(3);
      expect(result.current.error).toBeNull();
    });

    it('should calculate stats correctly', async () => {
      const { result } = renderHook(() => useActions());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.stats.total).toBe(3);
      expect(result.current.stats.pending).toBe(1);
      expect(result.current.stats.inProgress).toBe(1);
      expect(result.current.stats.completed).toBe(1);
    });

    it('should handle errors', async () => {
      mockQueryResult = { data: null, error: { message: 'Database error' } };

      const { result } = renderHook(() => useActions());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.error?.message).toBe('Database error');
    });
  });

  describe('toggleComplete', () => {
    it('should toggle pending action to completed', async () => {
      const { result } = renderHook(() => useActions());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.toggleComplete('1');
      });

      const updatedAction = result.current.actions.find((a) => a.id === '1');
      expect(updatedAction?.status).toBe('completed');
      expect(updatedAction?.completed_at).toBeTruthy();
    });

    it('should toggle completed action to pending', async () => {
      const { result } = renderHook(() => useActions());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.toggleComplete('3');
      });

      const updatedAction = result.current.actions.find((a) => a.id === '3');
      expect(updatedAction?.status).toBe('pending');
      expect(updatedAction?.completed_at).toBeNull();
    });
  });

  describe('updateAction', () => {
    it('should update action properties optimistically', async () => {
      const { result } = renderHook(() => useActions());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.updateAction('1', { priority: 'urgent' });
      });

      const updatedAction = result.current.actions.find((a) => a.id === '1');
      expect(updatedAction?.priority).toBe('urgent');
    });
  });

  describe('deleteAction', () => {
    it('should remove action from list', async () => {
      const { result } = renderHook(() => useActions());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialLength = result.current.actions.length;

      await act(async () => {
        await result.current.deleteAction('1');
      });

      expect(result.current.actions).toHaveLength(initialLength - 1);
      expect(result.current.actions.find((a) => a.id === '1')).toBeUndefined();
    });
  });

  describe('filtering', () => {
    it('should accept status filter', async () => {
      const { result } = renderHook(() => useActions({ status: 'pending' }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFrom).toHaveBeenCalledWith('actions');
    });

    it('should accept sortBy option', async () => {
      const { result } = renderHook(() => useActions({ sortBy: 'deadline' }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFrom).toHaveBeenCalledWith('actions');
    });
  });

  describe('refetch', () => {
    it('should have refetch function', async () => {
      const { result } = renderHook(() => useActions());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.refetch).toBe('function');
    });
  });
});
