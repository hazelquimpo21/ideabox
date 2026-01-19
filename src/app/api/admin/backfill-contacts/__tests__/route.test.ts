/**
 * Tests for Backfill Contacts API Route
 *
 * Tests the admin endpoint for backfilling contacts from existing emails.
 * Part of the Enhanced Email Intelligence feature (January 2026).
 *
 * @module api/admin/backfill-contacts/__tests__/route.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '../route';

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════════════════════════════════════════

const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
};

// ═══════════════════════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════════════════════

let mockAuthError: { message: string; code: string } | null = null;
let mockAuthUser: typeof mockUser | null = mockUser;
let mockRpcResult: { data: number | null; error: { message: string; code: string; details: string; hint: string } | null } = {
  data: 42,
  error: null,
};

// Mock Supabase client
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({
        data: { user: mockAuthUser },
        error: mockAuthError,
      })),
    },
    rpc: vi.fn(() => mockRpcResult),
  })),
}));

// Mock logger to prevent console noise in tests
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
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a mock NextRequest for testing.
 *
 * @param body - Request body (will be JSON stringified)
 * @returns NextRequest instance
 */
function createMockRequest(body?: object): NextRequest {
  const request = new NextRequest('http://localhost/api/admin/backfill-contacts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return request;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Backfill Contacts API', () => {
  // Reset mocks before each test
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset to default values
    mockAuthError = null;
    mockAuthUser = mockUser;
    mockRpcResult = { data: 42, error: null };
  });

  // =========================================================================
  // GET Handler Tests
  // =========================================================================

  describe('GET /api/admin/backfill-contacts', () => {
    it('should return usage instructions', async () => {
      const response = await GET();

      expect(response.status).toBe(200);

      const data = await response.json();

      expect(data.endpoint).toBe('/api/admin/backfill-contacts');
      expect(data.method).toBe('POST');
      expect(data.description).toBeDefined();
      expect(data.usage).toBeDefined();
      expect(data.notes).toBeInstanceOf(Array);
    });
  });

  // =========================================================================
  // POST Handler - Authentication Tests
  // =========================================================================

  describe('POST /api/admin/backfill-contacts - Authentication', () => {
    it('should return 401 when authentication fails', async () => {
      mockAuthError = { message: 'Invalid token', code: 'invalid_token' };
      mockAuthUser = null;

      const request = createMockRequest({});
      const response = await POST(request);

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Authentication failed');
    });

    it('should return 401 when no user is found', async () => {
      mockAuthError = null;
      mockAuthUser = null;

      const request = createMockRequest({});
      const response = await POST(request);

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Unauthorized');
    });
  });

  // =========================================================================
  // POST Handler - Authorization Tests
  // =========================================================================

  describe('POST /api/admin/backfill-contacts - Authorization', () => {
    it('should allow users to backfill their own contacts', async () => {
      const request = createMockRequest({ userId: mockUser.id });
      const response = await POST(request);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('should reject attempts to backfill another users contacts', async () => {
      const request = createMockRequest({ userId: 'different-user-id' });
      const response = await POST(request);

      expect(response.status).toBe(403);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('only backfill your own');
    });
  });

  // =========================================================================
  // POST Handler - Successful Backfill Tests
  // =========================================================================

  describe('POST /api/admin/backfill-contacts - Successful Backfill', () => {
    it('should backfill contacts for current user with empty body', async () => {
      const request = createMockRequest({});
      const response = await POST(request);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.contactsProcessed).toBe(42);
      expect(data.data.userId).toBe(mockUser.id);
      expect(data.data.message).toContain('Successfully backfilled');
    });

    it('should handle request with no body', async () => {
      const request = new NextRequest('http://localhost/api/admin/backfill-contacts', {
        method: 'POST',
      });
      const response = await POST(request);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('should return appropriate message when no new contacts found', async () => {
      mockRpcResult = { data: 0, error: null };

      const request = createMockRequest({});
      const response = await POST(request);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.contactsProcessed).toBe(0);
      expect(data.data.message).toContain('No new contacts');
    });

    it('should include user ID in response', async () => {
      const request = createMockRequest({});
      const response = await POST(request);

      const data = await response.json();
      expect(data.data.userId).toBe(mockUser.id);
    });
  });

  // =========================================================================
  // POST Handler - Error Handling Tests
  // =========================================================================

  describe('POST /api/admin/backfill-contacts - Error Handling', () => {
    it('should handle database function errors', async () => {
      mockRpcResult = {
        data: null,
        error: {
          message: 'Function not found',
          code: 'PGRST202',
          details: 'backfill_contacts_from_emails does not exist',
          hint: 'Run migrations first',
        },
      };

      const request = createMockRequest({});
      const response = await POST(request);

      expect(response.status).toBe(500);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Backfill failed');
      expect(data.error).toContain('Function not found');
    });

    it('should handle connection errors', async () => {
      mockRpcResult = {
        data: null,
        error: {
          message: 'Connection refused',
          code: 'ECONNREFUSED',
          details: 'Could not connect to database',
          hint: '',
        },
      };

      const request = createMockRequest({});
      const response = await POST(request);

      expect(response.status).toBe(500);

      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should handle malformed JSON body gracefully', async () => {
      // Create request with invalid JSON
      const request = new NextRequest('http://localhost/api/admin/backfill-contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'not valid json {{{',
      });

      const response = await POST(request);

      // Should use current user and not fail
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('should handle null return from RPC gracefully', async () => {
      mockRpcResult = { data: null, error: null };

      const request = createMockRequest({});
      const response = await POST(request);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.contactsProcessed).toBe(0);
    });
  });

  // =========================================================================
  // Response Format Tests
  // =========================================================================

  describe('Response Format', () => {
    it('should have correct success response structure', async () => {
      const request = createMockRequest({});
      const response = await POST(request);

      const data = await response.json();

      // Check structure
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('data');
      expect(data.data).toHaveProperty('contactsProcessed');
      expect(data.data).toHaveProperty('userId');
      expect(data.data).toHaveProperty('message');
    });

    it('should have correct error response structure', async () => {
      mockAuthError = { message: 'Unauthorized', code: '401' };
      mockAuthUser = null;

      const request = createMockRequest({});
      const response = await POST(request);

      const data = await response.json();

      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('error');
      expect(data.success).toBe(false);
      expect(typeof data.error).toBe('string');
    });
  });
});
