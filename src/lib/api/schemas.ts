/**
 * 📋 API Validation Schemas
 *
 * Zod schemas for validating API request bodies and query parameters.
 * These schemas define the contract between client and server.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 * ```typescript
 * import { emailQuerySchema, actionCreateSchema } from '@/lib/api/schemas';
 * import { validateQuery, validateBody } from '@/lib/api/utils';
 *
 * // Validate query params
 * const params = validateQuery(request, emailQuerySchema);
 *
 * // Validate request body
 * const body = await validateBody(request, actionCreateSchema);
 * ```
 *
 * @module lib/api/schemas
 */

import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * UUID validation schema.
 */
export const uuidSchema = z.string().uuid('Invalid UUID format');

/**
 * Pagination query parameters.
 */
export const paginationSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Valid email categories (action-focused, NOT sender-based).
 */
export const emailCategorySchema = z.enum([
  'action_required',
  'event',
  'newsletter',
  'promo',
  'admin',
  'personal',
  'noise',
]);

/**
 * Email list query parameters.
 *
 * @example
 * GET /api/emails?category=action_required&unread=true&limit=20
 */
export const emailQuerySchema = paginationSchema.extend({
  category: emailCategorySchema.optional(),
  clientId: uuidSchema.optional(),
  unread: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  starred: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  archived: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  search: z.string().min(1).max(100).optional(),
});

export type EmailQueryParams = z.infer<typeof emailQuerySchema>;

/**
 * Email update schema (partial updates allowed).
 *
 * @example
 * PATCH /api/emails/[id]
 * { "is_read": true, "is_starred": false }
 */
export const emailUpdateSchema = z.object({
  is_read: z.boolean().optional(),
  is_starred: z.boolean().optional(),
  is_archived: z.boolean().optional(),
  category: emailCategorySchema.optional(),
  client_id: uuidSchema.nullable().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided',
});

export type EmailUpdateInput = z.infer<typeof emailUpdateSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Valid action types.
 */
export const actionTypeSchema = z.enum([
  'respond',
  'review',
  'create',
  'schedule',
  'decide',
  'none',
]);

/**
 * Valid action statuses.
 */
export const actionStatusSchema = z.enum([
  'pending',
  'in_progress',
  'completed',
  'cancelled',
]);

/**
 * Valid priority levels.
 */
export const prioritySchema = z.enum([
  'low',
  'medium',
  'high',
  'urgent',
]);

/**
 * Action list query parameters.
 *
 * @example
 * GET /api/actions?status=pending&clientId=uuid
 */
export const actionQuerySchema = paginationSchema.extend({
  status: actionStatusSchema.optional(),
  clientId: uuidSchema.optional(),
  emailId: uuidSchema.optional(),
  priority: prioritySchema.optional(),
});

export type ActionQueryParams = z.infer<typeof actionQuerySchema>;

/**
 * Action creation schema.
 *
 * @example
 * POST /api/actions
 * { "title": "Review proposal", "deadline": "2026-01-20T17:00:00Z" }
 */
export const actionCreateSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(1000).optional(),
  action_type: actionTypeSchema.optional(),
  priority: prioritySchema.default('medium'),
  urgency_score: z.number().int().min(1).max(10).default(5),
  deadline: z.string().datetime().optional(),
  estimated_minutes: z.number().int().positive().optional(),
  email_id: uuidSchema.optional(),
  client_id: uuidSchema.optional(),
});

export type ActionCreateInput = z.infer<typeof actionCreateSchema>;

/**
 * Action update schema (partial updates allowed).
 *
 * @example
 * PATCH /api/actions/[id]
 * { "status": "completed" }
 */
export const actionUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  action_type: actionTypeSchema.optional(),
  priority: prioritySchema.optional(),
  urgency_score: z.number().int().min(1).max(10).optional(),
  deadline: z.string().datetime().nullable().optional(),
  estimated_minutes: z.number().int().positive().nullable().optional(),
  status: actionStatusSchema.optional(),
  client_id: uuidSchema.nullable().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided',
});

export type ActionUpdateInput = z.infer<typeof actionUpdateSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Valid client statuses.
 */
export const clientStatusSchema = z.enum([
  'active',
  'inactive',
  'archived',
]);

/**
 * Valid client priority levels.
 */
export const clientPrioritySchema = z.enum([
  'low',
  'medium',
  'high',
  'vip',
]);

/**
 * Client list query parameters.
 *
 * @example
 * GET /api/clients?status=active&priority=vip
 */
export const clientQuerySchema = paginationSchema.extend({
  status: clientStatusSchema.optional(),
  priority: clientPrioritySchema.optional(),
  search: z.string().min(1).max(100).optional(),
});

export type ClientQueryParams = z.infer<typeof clientQuerySchema>;

/**
 * Client creation schema.
 *
 * @example
 * POST /api/clients
 * { "name": "Acme Corp", "company": "Acme Corporation", "email": "contact@acme.com" }
 */
export const clientCreateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  company: z.string().max(100).optional(),
  email: z.string().email().optional(),
  status: clientStatusSchema.default('active'),
  priority: clientPrioritySchema.default('medium'),
  email_domains: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  notes: z.string().max(1000).optional(),
});

export type ClientCreateInput = z.infer<typeof clientCreateSchema>;

/**
 * Client update schema (partial updates allowed).
 *
 * @example
 * PATCH /api/clients/[id]
 * { "priority": "vip", "notes": "Key enterprise client" }
 */
export const clientUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  company: z.string().max(100).nullable().optional(),
  email: z.string().email().nullable().optional(),
  status: clientStatusSchema.optional(),
  priority: clientPrioritySchema.optional(),
  email_domains: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  notes: z.string().max(1000).nullable().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided',
});

export type ClientUpdateInput = z.infer<typeof clientUpdateSchema>;
