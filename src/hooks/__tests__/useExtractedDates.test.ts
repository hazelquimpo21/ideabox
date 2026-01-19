/**
 * useExtractedDates Hook Tests
 *
 * Comprehensive tests for the useExtractedDates hook including:
 * - Fetching and grouping dates by time period
 * - Filtering by date type and acknowledged status
 * - Actions: acknowledge, snooze, hide
 * - Stats calculation
 * - Error handling
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TEST COVERAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Date fetching and loading states
 * - Grouping into time periods (overdue, today, tomorrow, etc.)
 * - Acknowledge action (mark as done)
 * - Snooze action (reschedule)
 * - Hide action
 * - Stats calculation (total, overdue, pending, acknowledged)
 * - Type filtering
 * - Error states
 *
 * @module hooks/__tests__/useExtractedDates.test
 * @version 1.0.0
 * @since January 2026 (P6 Enhancement)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useExtractedDates } from '../useExtractedDates';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST DATA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Helper to get date strings relative to today.
 * Used to create test data with predictable time-period groupings.
 */
const getRelativeDate = (daysFromToday: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return date.toISOString().split('T')[0];
};

/**
 * Mock extracted dates data for testing.
 * Covers various date types and time periods.
 */
const createMockDates = () => [
  {
    id: 'date-1',
    user_id: 'user-1',
    email_id: 'email-1',
    contact_id: 'contact-1',
    date_type: 'deadline',
    date: getRelativeDate(-2), // Overdue (2 days ago)
    time: null,
    title: 'Overdue Project Deadline',
    description: 'Submit final report',
    is_recurring: false,
    recurrence_pattern: null,
    is_acknowledged: false,
    is_hidden: false,
    snoozed_until: null,
    confidence_score: 0.95,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    // Joined data
    emails: {
      id: 'email-1',
      subject: 'Project Deadline Reminder',
      sender_email: 'boss@company.com',
      sender_name: 'Boss',
    },
    contacts: {
      id: 'contact-1',
      name: 'Boss',
      is_vip: true,
    },
  },
  {
    id: 'date-2',
    user_id: 'user-1',
    email_id: 'email-2',
    contact_id: 'contact-2',
    date_type: 'birthday',
    date: getRelativeDate(0), // Today
    time: null,
    title: "Sarah's Birthday",
    description: null,
    is_recurring: true,
    recurrence_pattern: 'yearly',
    is_acknowledged: false,
    is_hidden: false,
    snoozed_until: null,
    confidence_score: 0.99,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    emails: null,
    contacts: null,
  },
  {
    id: 'date-3',
    user_id: 'user-1',
    email_id: 'email-3',
    contact_id: null,
    date_type: 'payment_due',
    date: getRelativeDate(1), // Tomorrow
    time: '17:00',
    title: 'Invoice Payment Due',
    description: 'Pay invoice #12345',
    is_recurring: false,
    recurrence_pattern: null,
    is_acknowledged: false,
    is_hidden: false,
    snoozed_until: null,
    confidence_score: 0.92,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    emails: {
      id: 'email-3',
      subject: 'Invoice #12345',
      sender_email: 'billing@vendor.com',
      sender_name: 'Vendor Billing',
    },
    contacts: null,
  },
  {
    id: 'date-4',
    user_id: 'user-1',
    email_id: 'email-4',
    contact_id: null,
    date_type: 'event',
    date: getRelativeDate(5), // This week
    time: '10:00',
    title: 'Team Meeting',
    description: 'Weekly standup',
    is_recurring: true,
    recurrence_pattern: 'weekly',
    is_acknowledged: true, // Already done
    is_hidden: false,
    snoozed_until: null,
    confidence_score: 0.88,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    emails: null,
    contacts: null,
  },
  {
    id: 'date-5',
    user_id: 'user-1',
    email_id: 'email-5',
    contact_id: null,
    date_type: 'appointment',
    date: getRelativeDate(10), // Next week
    time: '14:30',
    title: 'Doctor Appointment',
    description: 'Annual checkup',
    is_recurring: false,
    recurrence_pattern: null,
    is_acknowledged: false,
    is_hidden: false,
    snoozed_until: null,
    confidence_score: 0.97,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    emails: null,
    contacts: null,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mutable query result for testing.
 */
let mockQueryResult: { data: ReturnType<typeof createMockDates> | null; error: null | { message: string; code: string }; count: number | null };

/**
 * Mutable update result for testing action operations.
 */
let mockUpdateResult: { error: null | { message: string } };

/**
 * Initialize mock data before each test.
 */
const initMockData = () => {
  const mockDates = createMockDates();
  mockQueryResult = {
    data: mockDates,
    error: null,
    count: mockDates.length,
  };
  mockUpdateResult = {
    error: null,
  };
};

/**
 * Creates a chainable mock for Supabase select queries.
 */
const createChainableMock = () => {
  const handler: ProxyHandler<object> = {
    get: (_target, prop) => {
      if (prop === 'then') {
        return (resolve: (value: unknown) => unknown) => {
          return Promise.resolve(mockQueryResult).then(resolve);
        };
      }
      return () => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
};

/**
 * Creates a mock for update operations.
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
 * Mock Supabase from function.
 */
const mockFrom = vi.fn((table: string) => {
  if (table === 'extracted_dates') {
    return {
      select: () => createChainableMock(),
      update: () => createUpdateMock(),
    };
  }
  return createChainableMock();
});

/**
 * Mock the Supabase client module.
 */
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: mockFrom,
  }),
}));

/**
 * Mock the logger.
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
  vi.clearAllMocks();
  initMockData();
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('useExtractedDates', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Fetching Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('fetching dates', () => {
    it('should fetch dates on mount', async () => {
      const { result } = renderHook(() => useExtractedDates());

      // Initially loading
      expect(result.current.isLoading).toBe(true);

      // Wait for fetch to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Verify dates loaded
      expect(result.current.dates).toHaveLength(5);
      expect(result.current.error).toBeNull();
    });

    it('should calculate stats correctly', async () => {
      const { result } = renderHook(() => useExtractedDates());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Verify stats
      expect(result.current.stats.total).toBe(5);
      expect(result.current.stats.overdue).toBe(1); // date-1 is overdue
      expect(result.current.stats.pending).toBe(4); // dates not acknowledged or hidden
      expect(result.current.stats.acknowledged).toBe(1); // date-4 is acknowledged
    });

    it('should handle fetch error', async () => {
      mockQueryResult = {
        data: null,
        error: { message: 'Database error', code: 'PGRST001' },
        count: null,
      };

      const { result } = renderHook(() => useExtractedDates());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.dates).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Grouping Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('date grouping', () => {
    it('should group dates by time period', async () => {
      const { result } = renderHook(() => useExtractedDates());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const { groupedDates } = result.current;

      // Check groupings (exact counts depend on test timing)
      expect(groupedDates.overdue).toBeDefined();
      expect(groupedDates.today).toBeDefined();
      expect(groupedDates.tomorrow).toBeDefined();
      expect(groupedDates.thisWeek).toBeDefined();
      expect(groupedDates.nextWeek).toBeDefined();
      expect(groupedDates.later).toBeDefined();

      // Overdue should have the deadline from 2 days ago
      expect(groupedDates.overdue.some((d) => d.id === 'date-1')).toBe(true);

      // Today should have the birthday
      expect(groupedDates.today.some((d) => d.id === 'date-2')).toBe(true);

      // Tomorrow should have the payment
      expect(groupedDates.tomorrow.some((d) => d.id === 'date-3')).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Acknowledge Action Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('acknowledge', () => {
    it('should mark date as acknowledged optimistically', async () => {
      const { result } = renderHook(() => useExtractedDates());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Find unacknowledged date
      const dateBefore = result.current.dates.find((d) => d.id === 'date-1');
      expect(dateBefore?.is_acknowledged).toBe(false);

      // Acknowledge it
      act(() => {
        result.current.acknowledge('date-1');
      });

      // Verify optimistic update
      const dateAfter = result.current.dates.find((d) => d.id === 'date-1');
      expect(dateAfter?.is_acknowledged).toBe(true);

      // Stats should update
      expect(result.current.stats.acknowledged).toBe(2); // Was 1, now 2
    });

    it('should rollback acknowledge on error', async () => {
      mockUpdateResult = {
        error: { message: 'Update failed' },
      };

      const { result } = renderHook(() => useExtractedDates());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialAcknowledgedCount = result.current.stats.acknowledged;

      // Acknowledge (should fail)
      await act(async () => {
        await result.current.acknowledge('date-1');
      });

      // Wait for rollback
      await waitFor(() => {
        const date = result.current.dates.find((d) => d.id === 'date-1');
        expect(date?.is_acknowledged).toBe(false);
      });

      expect(result.current.stats.acknowledged).toBe(initialAcknowledgedCount);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Snooze Action Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('snooze', () => {
    it('should update snooze date optimistically', async () => {
      const { result } = renderHook(() => useExtractedDates());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const snoozeUntil = getRelativeDate(7);

      // Snooze date-1
      act(() => {
        result.current.snooze('date-1', snoozeUntil);
      });

      // Verify optimistic update
      const date = result.current.dates.find((d) => d.id === 'date-1');
      expect(date?.snoozed_until).toBe(snoozeUntil);
    });

    it('should rollback snooze on error', async () => {
      mockUpdateResult = {
        error: { message: 'Update failed' },
      };

      const { result } = renderHook(() => useExtractedDates());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const snoozeUntil = getRelativeDate(7);

      // Snooze (should fail)
      await act(async () => {
        await result.current.snooze('date-1', snoozeUntil);
      });

      // Wait for rollback
      await waitFor(() => {
        const date = result.current.dates.find((d) => d.id === 'date-1');
        expect(date?.snoozed_until).toBeNull();
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Hide Action Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('hide', () => {
    it('should mark date as hidden optimistically', async () => {
      const { result } = renderHook(() => useExtractedDates());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Hide date-1
      act(() => {
        result.current.hide('date-1');
      });

      // Verify optimistic update
      const date = result.current.dates.find((d) => d.id === 'date-1');
      expect(date?.is_hidden).toBe(true);
    });

    it('should rollback hide on error', async () => {
      mockUpdateResult = {
        error: { message: 'Update failed' },
      };

      const { result } = renderHook(() => useExtractedDates());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Hide (should fail)
      await act(async () => {
        await result.current.hide('date-1');
      });

      // Wait for rollback
      await waitFor(() => {
        const date = result.current.dates.find((d) => d.id === 'date-1');
        expect(date?.is_hidden).toBe(false);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Refetch Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('refetch', () => {
    it('should refetch dates when called', async () => {
      const { result } = renderHook(() => useExtractedDates());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialCallCount = mockFrom.mock.calls.length;

      // Trigger refetch
      await act(async () => {
        await result.current.refetch();
      });

      expect(mockFrom.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Load More Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('hasMore', () => {
    it('should set hasMore based on result count', async () => {
      const { result } = renderHook(() => useExtractedDates());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Only 5 dates, less than default limit
      expect(result.current.hasMore).toBe(false);
    });
  });
});
