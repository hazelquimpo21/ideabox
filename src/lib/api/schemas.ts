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
 * Valid email categories (life-bucket focused).
 *
 * REFACTORED (Jan 2026): Changed from action-focused to life-bucket categories.
 * Categories now represent what part of the user's life the email touches.
 * Actions are tracked separately via the `actions` table and urgency scores.
 *
 * Migration mapping:
 * - action_required → clients
 * - event → local (events detected via has_event label)
 * - newsletter → newsletters_creator
 * - promo → shopping
 * - admin → finance
 * - personal → personal_friends_family
 * - noise → newsletters_creator
 */
export const emailCategorySchema = z.enum([
  'newsletters_creator',           // Substacks, digests, curated content
  'newsletters_industry',          // Industry-specific newsletters
  'news_politics',                 // News outlets, political updates
  'product_updates',               // Tech products, SaaS tools
  'local',                         // Community events, neighborhood, local orgs
  'shopping',                      // Orders, shipping, deals, retail
  'travel',                        // Flights, hotels, bookings, trip info
  'finance',                       // Bills, banking, investments, receipts
  'family',                        // School, kids, health, appointments, family scheduling
  'clients',                       // Direct client correspondence, project work
  'work',                          // Team/internal, industry, professional
  'personal_friends_family',       // Social, relationships, personal
]);

/**
 * Email direction type for contact-based filtering.
 * - 'all': Both sent and received emails
 * - 'received': Only emails received from the contact
 * - 'sent': Only emails sent to the contact
 */
export const emailDirectionSchema = z.enum(['all', 'received', 'sent']);

export type EmailDirection = z.infer<typeof emailDirectionSchema>;

/**
 * Email list query parameters.
 *
 * @example Filter by category (life-bucket)
 * GET /api/emails?category=clients&unread=true&limit=20
 *
 * @example Filter by contact email and direction
 * GET /api/emails?contactEmail=john@example.com&direction=all
 */
export const emailQuerySchema = paginationSchema.extend({
  category: emailCategorySchema.optional(),
  clientId: uuidSchema.optional(),
  unread: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  starred: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  archived: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  search: z.string().min(1).max(100).optional(),
  // ─── Contact email filtering (for CRM contact detail page) ───────────────────
  contactEmail: z.string().email().optional(),
  direction: emailDirectionSchema.optional(),
  // ─── Sender filtering (legacy - use contactEmail + direction instead) ────────
  sender: z.string().optional(),
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
  'pay',
  'submit',
  'register',
  'book',
  'follow_up',
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
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided',
});

export type ActionUpdateInput = z.infer<typeof actionUpdateSchema>;

// CLIENT SCHEMAS removed — clients table archived in migration 030.
// Use contact schemas with is_client filter instead.

// ═══════════════════════════════════════════════════════════════════════════════
// USER CONTEXT SCHEMAS (NEW - Jan 2026)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Valid work days (0=Sun, 1=Mon, ..., 6=Sat).
 */
const workDaySchema = z.number().int().min(0).max(6);

/**
 * Family context JSONB structure (legacy — kept for backward compatibility).
 */
export const familyContextSchema = z.object({
  spouse_name: z.string().max(100).optional(),
  kids_count: z.number().int().min(0).max(20).optional(),
  family_names: z.array(z.string().max(100)).max(20).optional(),
}).optional();

/**
 * Household member schema (migration 040).
 */
export const householdMemberSchema = z.object({
  name: z.string().min(1).max(100),
  relationship: z.enum(['spouse', 'partner', 'child', 'parent', 'sibling', 'roommate', 'other']),
  gender: z.enum(['male', 'female', 'non_binary']).nullable().optional(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').nullable().optional(),
  school: z.string().max(200).nullable().optional(),
});

/**
 * Pet schema (migration 040).
 */
export const petSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['dog', 'cat', 'bird', 'fish', 'rabbit', 'hamster', 'reptile', 'other']),
});

/**
 * Other city schema (migration 040).
 */
export const otherCitySchema = z.object({
  city: z.string().min(1).max(200),
  tag: z.enum(['hometown', 'travel', 'family', 'vacation', 'other']),
  note: z.string().max(500).optional(),
});

/**
 * Other job / side hustle schema (migration 040).
 */
export const otherJobSchema = z.object({
  role: z.string().min(1).max(200),
  company: z.string().max(200),
  is_self_employed: z.boolean(),
});

/**
 * Gender options (migration 040).
 */
export const genderSchema = z.enum(['male', 'female', 'non_binary', 'prefer_not_to_say']);

/**
 * Employment type (migration 040).
 */
export const employmentTypeSchema = z.enum(['employed', 'self_employed', 'both']);

/**
 * User context update schema.
 *
 * All fields optional - only provided fields are updated.
 * Used for both PUT and onboarding step updates.
 *
 * @example
 * PUT /api/user/context
 * { "priorities": ["Work", "Family"], "location_city": "Milwaukee, WI" }
 */
export const userContextUpdateSchema = z.object({
  // Professional identity
  role: z.string().max(100).nullable().optional(),
  company: z.string().max(200).nullable().optional(),
  industry: z.string().max(100).nullable().optional(),

  // Location
  location_city: z.string().max(200).nullable().optional(),
  location_metro: z.string().max(200).nullable().optional(),

  // Priorities and projects (arrays)
  priorities: z.array(z.string().max(100)).max(10).optional(),
  projects: z.array(z.string().max(100)).max(20).optional(),

  // VIP contacts
  vip_emails: z.array(z.string().email()).max(50).optional(),
  vip_domains: z.array(z.string().max(100).regex(/^@/, 'Domain must start with @')).max(20).optional(),

  // Interests
  interests: z.array(z.string().max(100)).max(20).optional(),

  // Family context (legacy)
  family_context: familyContextSchema,

  // Work schedule
  work_hours_start: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format').optional(),
  work_hours_end: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format').optional(),
  work_days: z.array(workDaySchema).max(7).optional(),

  // Identity (migration 040)
  gender: genderSchema.nullable().optional(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').nullable().optional(),

  // Address (migration 040)
  address_street: z.string().max(300).nullable().optional(),
  address_city: z.string().max(200).nullable().optional(),
  address_state: z.string().max(100).nullable().optional(),
  address_zip: z.string().max(20).nullable().optional(),
  address_country: z.string().max(10).optional(),

  // Other cities (migration 040)
  other_cities: z.array(otherCitySchema).max(20).optional(),

  // Employment (migration 040)
  employment_type: employmentTypeSchema.optional(),
  other_jobs: z.array(otherJobSchema).max(10).optional(),

  // Household (migration 040)
  household_members: z.array(householdMemberSchema).max(20).optional(),
  pets: z.array(petSchema).max(10).optional(),

  // Onboarding
  onboarding_completed: z.boolean().optional(),
  onboarding_step: z.number().int().min(0).max(7).optional(),
});

export type UserContextUpdateInput = z.infer<typeof userContextUpdateSchema>;

/**
 * User context onboarding step update schema.
 *
 * Used specifically for advancing onboarding progress.
 *
 * @example
 * POST /api/user/context/onboarding
 * { "step": 3, "data": { "priorities": ["Work", "Family"] } }
 */
export const userContextOnboardingSchema = z.object({
  step: z.number().int().min(1).max(7),
  data: userContextUpdateSchema.optional(),
});

export type UserContextOnboardingInput = z.infer<typeof userContextOnboardingSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// CONTACT SCHEMAS (NEW - Jan 2026)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Valid contact relationship types.
 * Describes the nature of the relationship between user and contact.
 * NOTE: Only meaningful when sender_type is 'direct'.
 */
export const contactRelationshipTypeSchema = z.enum([
  'client',
  'colleague',
  'vendor',
  'friend',
  'family',
  'acquaintance',
  'unknown',
]);

export type ContactRelationshipType = z.infer<typeof contactRelationshipTypeSchema>;

/**
 * Sender type classification (NEW Jan 2026).
 *
 * Distinguishes real contacts from newsletters/broadcasts:
 * - direct: Real person who knows you (colleague, client, friend)
 * - broadcast: Newsletter/marketing sender (Substack, company updates)
 * - cold_outreach: Unknown person reaching out (sales, recruiter)
 * - opportunity: Mailing list with optional response (HARO, job boards)
 * - unknown: Not yet classified
 * - all: Return all sender types (no filter)
 */
export const senderTypeSchema = z.enum([
  'direct',
  'broadcast',
  'cold_outreach',
  'opportunity',
  'unknown',
  'all',
]);

export type SenderType = z.infer<typeof senderTypeSchema>;

/**
 * Broadcast subtypes for more specific newsletter classification.
 */
export const broadcastSubtypeSchema = z.enum([
  'newsletter_author',   // Individual creator (Substack, personal blog)
  'company_newsletter',  // Company marketing/updates
  'digest_service',      // LinkedIn digest, GitHub notifications
  'transactional',       // Receipts, confirmations, noreply
]);

export type BroadcastSubtype = z.infer<typeof broadcastSubtypeSchema>;

/**
 * Contact list query parameters.
 *
 * @example
 * GET /api/contacts?isVip=true&search=acme&limit=20
 *
 * @example Filter by sender type (NEW Jan 2026)
 * GET /api/contacts?senderType=direct          # Real contacts only
 * GET /api/contacts?senderType=broadcast       # Newsletters/subscriptions only
 * GET /api/contacts?senderType=all             # All contacts
 */
export const contactQuerySchema = paginationSchema.extend({
  isVip: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  isMuted: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  relationshipType: contactRelationshipTypeSchema.optional(),
  search: z.string().min(1).max(100).optional(),
  sortBy: z.enum(['email_count', 'last_seen_at', 'name']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  // ═══════════════════════════════════════════════════════════════════════════
  // SENDER TYPE FILTERING (NEW Jan 2026)
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * Filter by sender type:
   * - 'direct': Real contacts who know you
   * - 'broadcast': Newsletter/marketing senders
   * - 'cold_outreach': Cold emails from strangers
   * - 'opportunity': HARO-style mailing lists
   * - 'unknown': Not yet classified
   * - 'all': No sender type filter (return all)
   *
   * Default: undefined (returns all - backward compatible)
   */
  senderType: senderTypeSchema.optional(),
  /** Filter by broadcast subtype (only when senderType=broadcast) */
  broadcastSubtype: broadcastSubtypeSchema.optional(),
  // ═══════════════════════════════════════════════════════════════════════════
  // CLIENT FILTERING (NEW Feb 2026 — Phase 3 Navigation Redesign)
  // ═══════════════════════════════════════════════════════════════════════════
  /** Filter to only client contacts (is_client = TRUE) */
  isClient: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  /** Filter by client status (active, inactive, archived) */
  clientStatus: z.enum(['active', 'inactive', 'archived']).optional(),
  /** Filter by client priority (vip, high, medium, low) */
  clientPriority: z.enum(['vip', 'high', 'medium', 'low']).optional(),
});

export type ContactQueryParams = z.infer<typeof contactQuerySchema>;

/**
 * Contact update schema (partial updates allowed).
 *
 * @example
 * PUT /api/contacts/[id]
 * { "is_vip": true, "relationship_type": "client" }
 *
 * @example (with notes - P6 enhancement)
 * PUT /api/contacts/[id]
 * { "notes": "Key client - always respond within 24h" }
 */
export const contactUpdateSchema = z.object({
  name: z.string().max(200).nullable().optional(),
  is_vip: z.boolean().optional(),
  is_muted: z.boolean().optional(),
  relationship_type: contactRelationshipTypeSchema.optional(),
  birthday: z.string().date().nullable().optional(),
  work_anniversary: z.string().date().nullable().optional(),
  // ─── P6 Enhancement: Notes field for contact management ───────────────────
  // Allows users to add personal notes about contacts
  notes: z.string().max(5000).nullable().optional(),
  // ═══════════════════════════════════════════════════════════════════════════
  // CLIENT FIELDS (NEW Feb 2026 — Phase 3 Navigation Redesign)
  // ═══════════════════════════════════════════════════════════════════════════
  /** Whether this contact is a client */
  is_client: z.boolean().optional(),
  /** Client status: active, inactive, or archived */
  client_status: z.enum(['active', 'inactive', 'archived']).nullable().optional(),
  /** Client priority: vip, high, medium, or low */
  client_priority: z.enum(['vip', 'high', 'medium', 'low']).nullable().optional(),
  /** Email domains for auto-matching emails to this client */
  email_domains: z.array(z.string().max(200)).nullable().optional(),
  /** Keywords for categorizing emails related to this client */
  keywords: z.array(z.string().max(100)).nullable().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided',
});

export type ContactUpdateInput = z.infer<typeof contactUpdateSchema>;

/**
 * Promote-to-client request schema.
 * Used by POST /api/contacts/promote to promote a contact to client status.
 *
 * @example
 * POST /api/contacts/promote
 * { "contactId": "uuid", "clientStatus": "active", "clientPriority": "high" }
 *
 * @since February 2026 — Phase 3 Navigation Redesign
 */
export const promoteToClientSchema = z.object({
  /** UUID of the contact to promote */
  contactId: uuidSchema,
  /** Client status (required) */
  clientStatus: z.enum(['active', 'inactive', 'archived']),
  /** Client priority (required) */
  clientPriority: z.enum(['vip', 'high', 'medium', 'low']),
  /** Email domains for auto-matching (optional) */
  emailDomains: z.array(z.string().max(200)).optional(),
  /** Keywords for categorization (optional) */
  keywords: z.array(z.string().max(100)).optional(),
});

export type PromoteToClientInput = z.infer<typeof promoteToClientSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// EXTRACTED DATES SCHEMAS (NEW - Jan 2026)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Valid date types for extracted dates.
 */
export const dateTypeSchema = z.enum([
  'deadline',
  'event',
  'appointment',
  'payment_due',
  'expiration',
  'follow_up',
  'birthday',
  'anniversary',
  'recurring',
]);

export type DateType = z.infer<typeof dateTypeSchema>;

/**
 * Extracted dates list query parameters.
 *
 * @example
 * GET /api/dates?type=deadline&from=2026-01-01&to=2026-01-31
 */
export const extractedDatesQuerySchema = paginationSchema.extend({
  type: dateTypeSchema.optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  isAcknowledged: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  emailId: uuidSchema.optional(),
  contactId: uuidSchema.optional(),
});

export type ExtractedDatesQueryParams = z.infer<typeof extractedDatesQuerySchema>;

/**
 * Acknowledge/Snooze/Hide action for extracted dates.
 *
 * @example
 * POST /api/dates/[id]/action
 * { "action": "acknowledge" }
 * { "action": "snooze", "snooze_until": "2026-01-25" }
 */
export const extractedDateActionSchema = z.object({
  action: z.enum(['acknowledge', 'snooze', 'hide']),
  snooze_until: z.string().date().optional(),
}).refine(
  (data) => {
    // If action is 'snooze', snooze_until is required
    if (data.action === 'snooze' && !data.snooze_until) {
      return false;
    }
    return true;
  },
  {
    message: 'snooze_until is required when action is "snooze"',
  }
);

export type ExtractedDateActionInput = z.infer<typeof extractedDateActionSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// BULK EMAIL OPERATIONS SCHEMAS (NEW - Jan 2026)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Bulk archive emails schema.
 *
 * Allows archiving by category OR by specific email IDs.
 * At least one must be provided.
 *
 * @example Archive by category
 * POST /api/emails/bulk-archive
 * { "category": "newsletters_creator" }
 *
 * @example Archive by email IDs
 * POST /api/emails/bulk-archive
 * { "emailIds": ["uuid-1", "uuid-2", "uuid-3"] }
 */
export const bulkArchiveSchema = z.object({
  category: emailCategorySchema.optional(),
  emailIds: z.array(uuidSchema).min(1).max(500).optional(),
}).refine(
  (data) => data.category || data.emailIds,
  { message: 'Either category or emailIds must be provided' }
);

export type BulkArchiveInput = z.infer<typeof bulkArchiveSchema>;

/**
 * Retry analysis for failed emails schema.
 *
 * @example
 * POST /api/emails/retry-analysis
 * { "emailIds": ["uuid-1", "uuid-2"] }
 */
export const retryAnalysisSchema = z.object({
  emailIds: z.array(uuidSchema).min(1).max(100),
});

export type RetryAnalysisInput = z.infer<typeof retryAnalysisSchema>;
