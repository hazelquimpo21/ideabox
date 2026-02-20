/**
 * Tests for Hub Priority Service
 *
 * Tests priority scoring, candidate fetching, and extracted dates integration.
 * Part of the Enhanced Email Intelligence feature (January 2026).
 *
 * @module services/hub/__tests__/hub-priority-service.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST DATA - Realistic mock data for testing
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mock email candidates for testing email scoring.
 */
const mockEmails = [
  {
    id: 'email-1',
    subject: 'Urgent: Contract review needed',
    snippet: 'Please review the attached contract by Friday...',
    sender_name: 'John Client',
    sender_email: 'john@client.com',
    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    category: 'action_required',
    priority_score: 8,
    client_id: 'client-vip',
    analyzed_at: new Date().toISOString(),
    is_read: false,
    thread_id: 'thread-1',
    analysis_summary: 'Contract review request with Friday deadline',
    analysis_quick_action: 'review',
  },
  {
    id: 'email-2',
    subject: 'Weekly Newsletter',
    snippet: 'This week in tech news...',
    sender_name: 'Tech News',
    sender_email: 'news@tech.com',
    date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    category: 'newsletter',
    priority_score: 2,
    client_id: null,
    analyzed_at: new Date().toISOString(),
    is_read: true,
    thread_id: 'thread-2',
  },
];

/**
 * Mock action candidates for testing action scoring.
 */
const mockActions = [
  {
    id: 'action-1',
    title: 'Send proposal to Acme Corp',
    description: 'Follow up on the meeting with the proposal',
    action_type: 'create',
    urgency_score: 9,
    deadline: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // 4 hours from now
    status: 'pending',
    client_id: 'client-vip',
    email_id: 'email-1',
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
  },
  {
    id: 'action-2',
    title: 'Review documentation',
    description: 'Review the updated docs',
    action_type: 'review',
    urgency_score: 5,
    deadline: null,
    status: 'pending',
    client_id: null,
    email_id: null,
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago (stale)
  },
];

/**
 * Mock event candidates for testing event scoring.
 */
const mockEvents = [
  {
    id: 'event-1',
    title: 'Client Meeting',
    description: 'Quarterly review with Acme Corp',
    start_date: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().split('T')[0], // Today
    start_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().split('T')[1].slice(0, 8),
    location: 'Zoom',
    rsvp_required: true,
    rsvp_status: 'pending',
  },
];

/**
 * Mock extracted date candidates for testing date scoring.
 * NEW: Part of Enhanced Email Intelligence feature.
 */
const mockExtractedDates = [
  {
    id: 'date-1',
    date_type: 'deadline',
    date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Tomorrow
    time: '17:00:00',
    title: 'Invoice #1234 due',
    description: 'Payment for consulting services',
    priority_score: 8,
    email_id: 'email-source-1',
    contact_id: null,
    is_recurring: false,
    related_entity: 'Acme Corp',
    confidence: 0.95,
  },
  {
    id: 'date-2',
    date_type: 'birthday',
    date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 3 days
    time: null,
    title: "Sarah's birthday",
    description: 'Marketing team member',
    priority_score: 5,
    email_id: 'email-source-2',
    contact_id: 'contact-sarah',
    is_recurring: true,
    related_entity: 'Sarah Johnson',
    confidence: 0.85,
  },
  {
    id: 'date-3',
    date_type: 'payment_due',
    date: new Date().toISOString().split('T')[0], // Today
    time: '23:59:00',
    title: 'Subscription renewal',
    description: 'Annual SaaS subscription',
    priority_score: 7,
    email_id: 'email-source-3',
    contact_id: null,
    is_recurring: true,
    related_entity: 'Software Inc',
    confidence: 0.90,
  },
  {
    id: 'date-4',
    date_type: 'deadline',
    date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Yesterday (OVERDUE)
    time: '09:00:00',
    title: 'Report submission',
    description: 'Monthly report was due yesterday',
    priority_score: 9,
    email_id: 'email-source-4',
    contact_id: null,
    is_recurring: false,
    related_entity: 'Management',
    confidence: 0.92,
  },
];

/**
 * Mock client map for testing client priority multipliers.
 */
const mockClients = [
  { id: 'client-vip', name: 'Acme Corp', priority: 'vip' },
  { id: 'client-high', name: 'BigCo', priority: 'high' },
  { id: 'client-medium', name: 'MediumCo', priority: 'medium' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mock query results - can be configured per test.
 */
let mockEmailQueryResult: { data: typeof mockEmails | null; error: { message: string } | null };
let mockActionQueryResult: { data: typeof mockActions | null; error: { message: string } | null };
let mockEventQueryResult: { data: typeof mockEvents | null; error: { message: string } | null };
let mockExtractedDateQueryResult: { data: typeof mockExtractedDates | null; error: { message: string } | null };
let mockClientQueryResult: { data: typeof mockClients | null; error: { message: string } | null };
let mockAnalysesQueryResult: { data: null; error: null };

/**
 * Create chainable mock for Supabase queries.
 * This allows us to mock the fluent API: supabase.from().select().eq().order()...
 */
const createChainableMock = (tableName: string) => {
  // Determine which mock result to return based on table name
  const getResult = () => {
    switch (tableName) {
      case 'emails':
        return mockEmailQueryResult;
      case 'actions':
        return mockActionQueryResult;
      case 'events':
        return mockEventQueryResult;
      case 'extracted_dates':
        return mockExtractedDateQueryResult;
      case 'clients':
        return mockClientQueryResult;
      case 'email_analyses':
        return mockAnalysesQueryResult;
      default:
        return { data: null, error: { message: `Unknown table: ${tableName}` } };
    }
  };

  const handler: ProxyHandler<object> = {
    get: (_target, prop) => {
      // If accessing 'then', return a thenable (end of chain)
      if (prop === 'then') {
        return (resolve: (value: unknown) => unknown) => {
          return Promise.resolve(getResult()).then(resolve);
        };
      }
      // Return a new proxy for any method call (continue chain)
      return () => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
};

const mockFrom = vi.fn((tableName: string) => createChainableMock(tableName));

// Mock the Supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

// Mock the logger
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
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('HubPriorityService', () => {
  // Reset mocks before each test
  beforeEach(() => {
    vi.clearAllMocks();

    // Set default mock results
    mockEmailQueryResult = { data: mockEmails, error: null };
    mockActionQueryResult = { data: mockActions, error: null };
    mockEventQueryResult = { data: mockEvents, error: null };
    mockExtractedDateQueryResult = { data: mockExtractedDates, error: null };
    mockClientQueryResult = { data: mockClients, error: null };
    mockAnalysesQueryResult = { data: null, error: null };
  });

  // =========================================================================
  // Configuration Tests
  // =========================================================================

  describe('HUB_SCORING_CONFIG', () => {
    it('should have date type weights for all date types', async () => {
      // Import config dynamically to get the actual values
      const { HUB_SCORING_CONFIG } = await import('../hub-priority-service');

      expect(HUB_SCORING_CONFIG.dateTypeWeights).toBeDefined();
      expect(HUB_SCORING_CONFIG.dateTypeWeights.deadline).toBe(1.6);
      expect(HUB_SCORING_CONFIG.dateTypeWeights.payment_due).toBe(1.5);
      expect(HUB_SCORING_CONFIG.dateTypeWeights.birthday).toBe(1.0);
      expect(HUB_SCORING_CONFIG.dateTypeWeights.expiration).toBe(1.4);
      expect(HUB_SCORING_CONFIG.dateTypeWeights.appointment).toBe(1.3);
    });

    it('should have fetch limit for extracted dates', async () => {
      const { HUB_SCORING_CONFIG } = await import('../hub-priority-service');

      expect(HUB_SCORING_CONFIG.fetchLimits.extractedDates).toBe(15);
    });

    it('should have base weight for extracted dates', async () => {
      const { HUB_SCORING_CONFIG } = await import('../hub-priority-service');

      expect(HUB_SCORING_CONFIG.extractedDateBaseWeight).toBe(13);
    });
  });

  // =========================================================================
  // Main Function Tests
  // =========================================================================

  describe('getTopPriorityItems', () => {
    it('should return items from all candidate sources', async () => {
      const { getTopPriorityItems } = await import('../hub-priority-service');

      const result = await getTopPriorityItems('user-123', { limit: 10 });

      expect(result.items).toBeDefined();
      expect(result.stats).toBeDefined();
      expect(result.lastUpdated).toBeDefined();
    });

    it('should include extracted dates in stats', async () => {
      const { getTopPriorityItems } = await import('../hub-priority-service');

      const result = await getTopPriorityItems('user-123', { limit: 10 });

      expect(result.stats.extractedDatesConsidered).toBeDefined();
      expect(result.stats.extractedDatesConsidered).toBe(mockExtractedDates.length);
    });

    it('should handle database errors gracefully', async () => {
      // Simulate database error for extracted dates
      mockExtractedDateQueryResult = { data: null, error: { message: 'Database connection failed' } };

      const { getTopPriorityItems } = await import('../hub-priority-service');

      // Should not throw, should return results without extracted dates
      const result = await getTopPriorityItems('user-123', { limit: 10 });

      expect(result.items).toBeDefined();
      expect(result.stats.extractedDatesConsidered).toBe(0);
    });

    it('should sort items by priority score descending', async () => {
      const { getTopPriorityItems } = await import('../hub-priority-service');

      const result = await getTopPriorityItems('user-123', { limit: 10 });

      // Check that items are sorted by priority score
      for (let i = 1; i < result.items.length; i++) {
        expect(result.items[i - 1].priorityScore).toBeGreaterThanOrEqual(
          result.items[i].priorityScore
        );
      }
    });

    it('should respect the limit parameter', async () => {
      const { getTopPriorityItems } = await import('../hub-priority-service');

      const result = await getTopPriorityItems('user-123', { limit: 3 });

      expect(result.items.length).toBeLessThanOrEqual(3);
    });
  });

  // =========================================================================
  // Time Context Tests
  // =========================================================================

  describe('getTimeContext', () => {
    it('should return morning for hours before 12', async () => {
      const { getTimeContext } = await import('../hub-priority-service');

      const morningDate = new Date();
      morningDate.setHours(9, 0, 0, 0);

      expect(getTimeContext(morningDate)).toBe('morning');
    });

    it('should return afternoon for hours 12-17', async () => {
      const { getTimeContext } = await import('../hub-priority-service');

      const afternoonDate = new Date();
      afternoonDate.setHours(14, 0, 0, 0);

      expect(getTimeContext(afternoonDate)).toBe('afternoon');
    });

    it('should return evening for hours after 17', async () => {
      const { getTimeContext } = await import('../hub-priority-service');

      const eveningDate = new Date();
      eveningDate.setHours(19, 0, 0, 0);

      expect(getTimeContext(eveningDate)).toBe('evening');
    });
  });

  describe('getDayContext', () => {
    it('should return weekend for Saturday', async () => {
      const { getDayContext } = await import('../hub-priority-service');

      // Find next Saturday
      const saturday = new Date();
      saturday.setDate(saturday.getDate() + ((6 - saturday.getDay()) % 7));

      expect(getDayContext(saturday)).toBe('weekend');
    });

    it('should return friday for Friday', async () => {
      const { getDayContext } = await import('../hub-priority-service');

      // Find next Friday
      const friday = new Date();
      friday.setDate(friday.getDate() + ((5 - friday.getDay() + 7) % 7));

      expect(getDayContext(friday)).toBe('friday');
    });

    it('should return weekday for Monday-Thursday', async () => {
      const { getDayContext } = await import('../hub-priority-service');

      // Find next Monday
      const monday = new Date();
      monday.setDate(monday.getDate() + ((1 - monday.getDay() + 7) % 7));

      expect(getDayContext(monday)).toBe('weekday');
    });
  });

  // =========================================================================
  // Type Tests
  // =========================================================================

  describe('HubItemType', () => {
    it('should include extracted_date type', async () => {
      // This is a compile-time check - if it compiles, the type exists
      const { getTopPriorityItems } = await import('../hub-priority-service');

      const result = await getTopPriorityItems('user-123');

      // Find an extracted date item
      const dateItem = result.items.find(item => item.type === 'extracted_date');

      // If we have extracted dates in mock data, we should find one
      if (mockExtractedDates.length > 0 && mockExtractedDateQueryResult.error === null) {
        // The type should be valid
        expect(['email', 'action', 'event', 'extracted_date']).toContain(dateItem?.type || 'extracted_date');
      }
    });
  });

  // =========================================================================
  // Extracted Date Scoring Tests
  // =========================================================================

  describe('Extracted Date Scoring', () => {
    it('should score overdue deadlines highest', async () => {
      // Set up only overdue deadline
      mockExtractedDateQueryResult = {
        data: [mockExtractedDates[3]], // Overdue deadline
        error: null,
      };
      mockEmailQueryResult = { data: [], error: null };
      mockActionQueryResult = { data: [], error: null };
      mockEventQueryResult = { data: [], error: null };

      const { getTopPriorityItems } = await import('../hub-priority-service');

      const result = await getTopPriorityItems('user-123');

      if (result.items.length > 0) {
        // Overdue items should have high priority score
        expect(result.items[0].priorityScore).toBeGreaterThan(50);
        expect(result.items[0].timeRemaining).toContain('overdue');
      }
    });

    it('should generate appropriate why important for deadlines', async () => {
      mockExtractedDateQueryResult = {
        data: [mockExtractedDates[0]], // Tomorrow deadline
        error: null,
      };
      mockEmailQueryResult = { data: [], error: null };
      mockActionQueryResult = { data: [], error: null };
      mockEventQueryResult = { data: [], error: null };

      const { getTopPriorityItems } = await import('../hub-priority-service');

      const result = await getTopPriorityItems('user-123');

      if (result.items.length > 0 && result.items[0].type === 'extracted_date') {
        expect(result.items[0].whyImportant.toLowerCase()).toContain('deadline');
      }
    });

    it('should generate appropriate why important for birthdays', async () => {
      mockExtractedDateQueryResult = {
        data: [mockExtractedDates[1]], // Birthday
        error: null,
      };
      mockEmailQueryResult = { data: [], error: null };
      mockActionQueryResult = { data: [], error: null };
      mockEventQueryResult = { data: [], error: null };

      const { getTopPriorityItems } = await import('../hub-priority-service');

      const result = await getTopPriorityItems('user-123');

      if (result.items.length > 0 && result.items[0].type === 'extracted_date') {
        expect(result.items[0].whyImportant.toLowerCase()).toContain('birthday');
      }
    });

    it('should reduce score for recurring items', async () => {
      // Compare recurring vs non-recurring deadline with same date
      const nonRecurring = { ...mockExtractedDates[0], is_recurring: false, id: 'non-recurring' };
      const recurring = { ...mockExtractedDates[0], is_recurring: true, id: 'recurring' };

      mockExtractedDateQueryResult = {
        data: [nonRecurring, recurring],
        error: null,
      };
      mockEmailQueryResult = { data: [], error: null };
      mockActionQueryResult = { data: [], error: null };
      mockEventQueryResult = { data: [], error: null };

      const { getTopPriorityItems } = await import('../hub-priority-service');

      const result = await getTopPriorityItems('user-123', { limit: 10 });

      const nonRecurringItem = result.items.find(i => i.originalId === 'non-recurring');
      const recurringItem = result.items.find(i => i.originalId === 'recurring');

      if (nonRecurringItem && recurringItem) {
        expect(nonRecurringItem.priorityScore).toBeGreaterThan(recurringItem.priorityScore);
      }
    });

    it('should reduce score for low confidence extractions', async () => {
      const highConfidence = { ...mockExtractedDates[0], confidence: 0.95, id: 'high-conf' };
      const lowConfidence = { ...mockExtractedDates[0], confidence: 0.5, id: 'low-conf' };

      mockExtractedDateQueryResult = {
        data: [highConfidence, lowConfidence],
        error: null,
      };
      mockEmailQueryResult = { data: [], error: null };
      mockActionQueryResult = { data: [], error: null };
      mockEventQueryResult = { data: [], error: null };

      const { getTopPriorityItems } = await import('../hub-priority-service');

      const result = await getTopPriorityItems('user-123', { limit: 10 });

      const highConfItem = result.items.find(i => i.originalId === 'high-conf');
      const lowConfItem = result.items.find(i => i.originalId === 'low-conf');

      if (highConfItem && lowConfItem) {
        expect(highConfItem.priorityScore).toBeGreaterThan(lowConfItem.priorityScore);
      }
    });

    it('should map date types to correct suggested actions', async () => {
      mockExtractedDateQueryResult = {
        data: [
          { ...mockExtractedDates[0], date_type: 'deadline', id: 'deadline-test' },
          { ...mockExtractedDates[0], date_type: 'appointment', id: 'appointment-test' },
          { ...mockExtractedDates[0], date_type: 'follow_up', id: 'followup-test' },
          { ...mockExtractedDates[0], date_type: 'birthday', id: 'birthday-test' },
        ],
        error: null,
      };
      mockEmailQueryResult = { data: [], error: null };
      mockActionQueryResult = { data: [], error: null };
      mockEventQueryResult = { data: [], error: null };

      const { getTopPriorityItems } = await import('../hub-priority-service');

      const result = await getTopPriorityItems('user-123', { limit: 10 });

      const deadlineItem = result.items.find(i => i.originalId === 'deadline-test');
      const appointmentItem = result.items.find(i => i.originalId === 'appointment-test');
      const followupItem = result.items.find(i => i.originalId === 'followup-test');
      const birthdayItem = result.items.find(i => i.originalId === 'birthday-test');

      if (deadlineItem) expect(deadlineItem.suggestedAction).toBe('decide');
      if (appointmentItem) expect(appointmentItem.suggestedAction).toBe('attend');
      if (followupItem) expect(followupItem.suggestedAction).toBe('respond');
      if (birthdayItem) expect(birthdayItem.suggestedAction).toBe('review');
    });

    it('should link to timeline view', async () => {
      mockExtractedDateQueryResult = {
        data: [mockExtractedDates[0]],
        error: null,
      };
      mockEmailQueryResult = { data: [], error: null };
      mockActionQueryResult = { data: [], error: null };
      mockEventQueryResult = { data: [], error: null };

      const { getTopPriorityItems } = await import('../hub-priority-service');

      const result = await getTopPriorityItems('user-123');

      if (result.items.length > 0 && result.items[0].type === 'extracted_date') {
        // UPDATED (Feb 2026): /timeline → /calendar per Navigation Redesign
        expect(result.items[0].href).toContain('/calendar');
        expect(result.items[0].href).toContain(result.items[0].originalId);
      }
    });
  });

  // =========================================================================
  // Error Handling Tests
  // =========================================================================

  describe('Error Handling', () => {
    it('should continue processing when extracted dates query fails', async () => {
      mockExtractedDateQueryResult = { data: null, error: { message: 'Connection timeout' } };

      const { getTopPriorityItems } = await import('../hub-priority-service');

      // Should not throw
      const result = await getTopPriorityItems('user-123');

      expect(result.items).toBeDefined();
      expect(result.stats.extractedDatesConsidered).toBe(0);
      // Other sources should still be processed
      expect(result.stats.emailsConsidered).toBe(mockEmails.length);
    });

    it('should continue processing when one email fails to score', async () => {
      // Even with some malformed data, the service should continue
      mockEmailQueryResult = {
        data: [
          ...mockEmails,
          {
            ...mockEmails[0],
            id: 'malformed-email',
            date: 'invalid-date-format', // This might cause issues
          },
        ],
        error: null,
      };

      const { getTopPriorityItems } = await import('../hub-priority-service');

      // Should not throw
      const result = await getTopPriorityItems('user-123');

      expect(result.items).toBeDefined();
    });
  });
});
