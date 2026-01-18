/**
 * 🔧 API Utilities for IdeaBox
 *
 * Shared utilities for API route handlers including:
 * - Response helpers with consistent formatting
 * - Pagination utilities with Link headers
 * - Error handling with proper status codes
 * - Request validation helpers
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 * ```typescript
 * import { apiResponse, apiError, withPagination } from '@/lib/api/utils';
 *
 * export async function GET(request: Request) {
 *   const { data, error } = await fetchData();
 *   if (error) return apiError(error.message, 500);
 *   return apiResponse(data);
 * }
 * ```
 *
 * @module lib/api/utils
 */

import { NextResponse } from 'next/server';
import { ZodError, ZodSchema } from 'zod';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('API');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Standard API response structure.
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: Record<string, string[]>;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    hasMore?: boolean;
  };
}

/**
 * Pagination parameters extracted from request.
 */
export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESPONSE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a successful JSON response.
 *
 * @param data - Response data
 * @param status - HTTP status code (default: 200)
 * @param headers - Additional headers to include
 * @returns NextResponse with JSON body
 *
 * @example
 * ```typescript
 * return apiResponse({ emails: [...] });
 * return apiResponse({ id: '123' }, 201);
 * ```
 */
export function apiResponse<T>(
  data: T,
  status = 200,
  headers?: Record<string, string>
): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    { success: true, data },
    { status, headers }
  );
}

/**
 * Creates a paginated JSON response with meta information.
 *
 * @param data - Array of items
 * @param pagination - Pagination parameters
 * @param total - Total count of items
 * @param baseUrl - Base URL for Link header
 * @returns NextResponse with pagination headers
 *
 * @example
 * ```typescript
 * const { page, limit, offset } = getPagination(request);
 * const { data, count } = await supabase.from('emails').select('*', { count: 'exact' });
 * return paginatedResponse(data, { page, limit, offset }, count, request.url);
 * ```
 */
export function paginatedResponse<T>(
  data: T[],
  pagination: PaginationParams,
  total: number,
  baseUrl?: string
): NextResponse<ApiResponse<T[]>> {
  const { page, limit } = pagination;
  const totalPages = Math.ceil(total / limit);
  const hasMore = page < totalPages;

  const headers: Record<string, string> = {
    'X-Total-Count': total.toString(),
    'X-Page': page.toString(),
    'X-Limit': limit.toString(),
    'X-Total-Pages': totalPages.toString(),
  };

  // Build Link header for pagination navigation
  if (baseUrl) {
    const links: string[] = [];
    const url = new URL(baseUrl);

    // First page
    url.searchParams.set('page', '1');
    links.push(`<${url.toString()}>; rel="first"`);

    // Previous page
    if (page > 1) {
      url.searchParams.set('page', (page - 1).toString());
      links.push(`<${url.toString()}>; rel="prev"`);
    }

    // Next page
    if (hasMore) {
      url.searchParams.set('page', (page + 1).toString());
      links.push(`<${url.toString()}>; rel="next"`);
    }

    // Last page
    url.searchParams.set('page', totalPages.toString());
    links.push(`<${url.toString()}>; rel="last"`);

    headers['Link'] = links.join(', ');
  }

  return NextResponse.json(
    {
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        hasMore,
      },
    },
    { status: 200, headers }
  );
}

/**
 * Creates an error JSON response.
 *
 * @param message - Error message
 * @param status - HTTP status code (default: 400)
 * @param errors - Field-level errors for validation failures
 * @returns NextResponse with error body
 *
 * @example
 * ```typescript
 * return apiError('Email not found', 404);
 * return apiError('Validation failed', 400, { email: ['Invalid format'] });
 * ```
 */
export function apiError(
  message: string,
  status = 400,
  errors?: Record<string, string[]>
): NextResponse<ApiResponse<never>> {
  logger.error(`API Error: ${message}`, { status, errors });

  return NextResponse.json(
    { success: false, error: message, errors },
    { status }
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGINATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Default pagination values */
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * Extracts pagination parameters from a request URL.
 *
 * @param request - Incoming request
 * @returns Pagination parameters with page, limit, and offset
 *
 * @example
 * ```typescript
 * // GET /api/emails?page=2&limit=20
 * const { page, limit, offset } = getPagination(request);
 * // page=2, limit=20, offset=20
 * ```
 */
export function getPagination(request: Request): PaginationParams {
  const url = new URL(request.url);

  let page = parseInt(url.searchParams.get('page') || DEFAULT_PAGE.toString(), 10);
  let limit = parseInt(url.searchParams.get('limit') || DEFAULT_LIMIT.toString(), 10);

  // Validate and clamp values
  page = Math.max(1, page);
  limit = Math.min(Math.max(1, limit), MAX_LIMIT);

  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validates request body against a Zod schema.
 *
 * @param request - Incoming request
 * @param schema - Zod schema to validate against
 * @returns Validated data or error response
 *
 * @example
 * ```typescript
 * const schema = z.object({ title: z.string().min(1) });
 * const result = await validateBody(request, schema);
 * if (result instanceof NextResponse) return result;
 * const { title } = result;
 * ```
 */
export async function validateBody<T>(
  request: Request,
  schema: ZodSchema<T>
): Promise<T | NextResponse<ApiResponse<never>>> {
  try {
    const body = await request.json();
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string[]> = {};
      error.errors.forEach((err) => {
        const path = err.path.join('.');
        if (!fieldErrors[path]) {
          fieldErrors[path] = [];
        }
        fieldErrors[path].push(err.message);
      });

      return apiError('Validation failed', 400, fieldErrors);
    }

    if (error instanceof SyntaxError) {
      return apiError('Invalid JSON body', 400);
    }

    return apiError('Request parsing failed', 400);
  }
}

/**
 * Validates query parameters against a Zod schema.
 *
 * @param request - Incoming request
 * @param schema - Zod schema to validate against
 * @returns Validated params or error response
 *
 * @example
 * ```typescript
 * const schema = z.object({ category: z.enum(['action_required', 'newsletter']).optional() });
 * const result = validateQuery(request, schema);
 * if (result instanceof NextResponse) return result;
 * const { category } = result;
 * ```
 */
export function validateQuery<T>(
  request: Request,
  schema: ZodSchema<T>
): T | NextResponse<ApiResponse<never>> {
  try {
    const url = new URL(request.url);
    const params: Record<string, string> = {};

    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    return schema.parse(params);
  } catch (error) {
    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string[]> = {};
      error.errors.forEach((err) => {
        const path = err.path.join('.');
        if (!fieldErrors[path]) {
          fieldErrors[path] = [];
        }
        fieldErrors[path].push(err.message);
      });

      return apiError('Invalid query parameters', 400, fieldErrors);
    }

    return apiError('Query parsing failed', 400);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extracts and validates the authenticated user from a Supabase client.
 * Returns an error response if user is not authenticated.
 *
 * @param supabase - Supabase client instance
 * @returns User object or error response
 *
 * @example
 * ```typescript
 * const supabase = await createServerClient();
 * const userResult = await requireAuth(supabase);
 * if (userResult instanceof NextResponse) return userResult;
 * const user = userResult;
 * ```
 */
export async function requireAuth(
  supabase: { auth: { getUser: () => Promise<{ data: { user: { id: string } | null }; error: unknown }> } }
): Promise<{ id: string } | NextResponse<ApiResponse<never>>> {
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return apiError('Unauthorized', 401);
  }

  return user;
}
