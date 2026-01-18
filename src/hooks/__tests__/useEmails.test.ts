/**
 * Tests for useEmails Hook
 *
 * Tests email fetching, filtering, and optimistic updates.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useEmails } from '../useEmails';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST DATA
// ═══════════════════════════════════════════════════════════════════════════════

const mockEmails = [
  {
    id: '1',
    user_id: 'user-1',
    gmail_account_id: 'gmail-1',
    gmail_id: 'gmail-msg-1',
    thread_id: 'thread-1',
    subject: 'Test Email 1',
    sender_email: 'sender@test.com',
    sender_name: 'Test Sender',
    date: '2026-01-18T10:00:00Z',
    snippet: 'This is a test email',
    category: 'action_required',
    is_read: false,
    is_starred: true,
    is_archived: false,
    priority_score: 8,
    client_id: null,
    created_at: '2026-01-18T10:00:00Z',
    updated_at: '2026-01-18T10:00:00Z',
  },
  {
    id: '2',
    user_id: 'user-1',
    gmail_account_id: 'gmail-1',
    gmail_id: 'gmail-msg-2',
    thread_id: 'thread-2',
    subject: 'Test Email 2',
    sender_email: 'newsletter@test.com',
    sender_name: 'Newsletter',
    date: '2026-01-17T10:00:00Z',
    snippet: 'Newsletter content',
    category: 'newsletter',
    is_read: true,
    is_starred: false,
    is_archived: false,
    priority_score: 3,
    client_id: 'client-1',
    created_at: '2026-01-17T10:00:00Z',
    updated_at: '2026-01-17T10:00:00Z',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════════════════════

let mockQueryResult: { data: typeof mockEmails | null; error: { message: string } | null; count: number | null };

// Create a proxy-based chainable mock
const createChainableMock = () => {
  const handler: ProxyHandler<object> = {
    get: (_target, prop) => {
      // If accessing 'then', return a thenable
      if (prop === 'then') {
        return (resolve: (value: unknown) => unknown) => {
          return Promise.resolve(mockQueryResult).then(resolve);
        };
      }
      // Return a new proxy for any method call
      return () => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
};

const mockFrom = vi.fn(() => createChainableMock());

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
  mockQueryResult = { data: mockEmails, error: null, count: mockEmails.length };
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('useEmails', () => {
  describe('initial fetch', () => {
    it('should start in loading state', () => {
      const { result } = renderHook(() => useEmails());

      expect(result.current.isLoading).toBe(true);
      expect(result.current.emails).toEqual([]);
      expect(result.current.error).toBeNull();
    });

    it('should fetch emails successfully', async () => {
      const { result } = renderHook(() => useEmails());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.emails).toHaveLength(2);
      expect(result.current.error).toBeNull();
    });

    it('should calculate stats correctly', async () => {
      const { result } = renderHook(() => useEmails());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.stats.total).toBe(2);
      expect(result.current.stats.unread).toBe(1);
      expect(result.current.stats.starred).toBe(1);
      expect(result.current.stats.actionRequired).toBe(1);
    });

    it('should handle errors', async () => {
      mockQueryResult = { data: null, error: { message: 'Database error' }, count: null };

      const { result } = renderHook(() => useEmails());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.error?.message).toBe('Database error');
    });
  });

  describe('filtering', () => {
    it('should call from with emails table', async () => {
      const { result } = renderHook(() => useEmails({ category: 'action_required' }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFrom).toHaveBeenCalledWith('emails');
    });

    it('should accept clientId filter option', async () => {
      const { result } = renderHook(() => useEmails({ clientId: 'client-123' }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFrom).toHaveBeenCalledWith('emails');
    });

    it('should accept clients category filter', async () => {
      const { result } = renderHook(() => useEmails({ category: 'clients' }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFrom).toHaveBeenCalledWith('emails');
    });
  });

  describe('optimistic updates', () => {
    it('should update email locally', async () => {
      const { result } = renderHook(() => useEmails());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.updateEmail('1', { is_read: true });
      });

      const updatedEmail = result.current.emails.find((e) => e.id === '1');
      expect(updatedEmail?.is_read).toBe(true);
    });

    it('should update starred status', async () => {
      const { result } = renderHook(() => useEmails());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.updateEmail('2', { is_starred: true });
      });

      const updatedEmail = result.current.emails.find((e) => e.id === '2');
      expect(updatedEmail?.is_starred).toBe(true);
    });
  });

  describe('hasMore', () => {
    it('should indicate when more emails are available', async () => {
      const { result } = renderHook(() => useEmails({ limit: 2 }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMore).toBe(true);
    });
  });

  describe('refetch', () => {
    it('should have a refetch function', async () => {
      const { result } = renderHook(() => useEmails());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.refetch).toBe('function');
    });

    it('should refetch emails when called', async () => {
      const { result } = renderHook(() => useEmails());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      vi.clearAllMocks();

      await act(async () => {
        await result.current.refetch();
      });

      expect(mockFrom).toHaveBeenCalledWith('emails');
    });
  });
});
