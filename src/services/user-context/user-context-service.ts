/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issues with new tables
/**
 * User Context Service
 *
 * Fetches and caches user context from the `user_context` table for personalized
 * AI analysis. This service provides the foundational user info that is injected
 * into analyzer prompts (VIPs, location, priorities, etc.).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DESIGN PHILOSOPHY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The user context is relatively static (changes rarely - only during onboarding
 * or settings updates). Therefore, we implement a simple in-memory cache with
 * a TTL to avoid redundant database queries during email processing.
 *
 * CACHE STRATEGY:
 * - Cache TTL: 5 minutes (context rarely changes)
 * - Cache invalidation: On context update via this service
 * - Cache key: userId
 * - Memory limit: None (one entry per active user)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import { getUserContext, updateUserContext } from '@/services/user-context';
 *
 * // Get context for AI analysis (uses cache if available)
 * const context = await getUserContext(userId);
 *
 * // Pass to analyzers
 * const result = await categorizer.analyze(email, context);
 *
 * // Update context (invalidates cache)
 * await updateUserContext(userId, { priorities: ['Work', 'Family'] });
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DATABASE TABLE: user_context
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * See: supabase/migrations/011_user_context.sql
 *
 * @module services/user-context/user-context-service
 * @version 1.0.0
 * @since January 2026
 */

import { createServerClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/utils/logger';
import type { UserContext } from '@/services/analyzers/types';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('UserContextService');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Raw user context data from the database.
 * This maps to the `user_context` table columns.
 */
export interface UserContextRow {
  id: string;
  user_id: string;

  // Professional identity
  role: string | null;
  company: string | null;
  industry: string | null;

  // Location
  location_city: string | null;
  location_metro: string | null;

  // Priorities and projects
  priorities: string[] | null;
  projects: string[] | null;

  // VIP contacts
  vip_emails: string[] | null;
  vip_domains: string[] | null;

  // Interests
  interests: string[] | null;

  // Family context (JSONB)
  family_context: {
    spouse_name?: string;
    kids_count?: number;
    family_names?: string[];
  } | null;

  // Work schedule
  work_hours_start: string | null;
  work_hours_end: string | null;
  work_days: number[] | null;

  // Onboarding state
  onboarding_completed: boolean;
  onboarding_completed_at: string | null;
  onboarding_step: number;

  // Metadata
  created_at: string;
  updated_at: string;
}

/**
 * Update payload for user context.
 * All fields are optional - only provided fields will be updated.
 */
export interface UserContextUpdate {
  role?: string | null;
  company?: string | null;
  industry?: string | null;
  location_city?: string | null;
  location_metro?: string | null;
  priorities?: string[];
  projects?: string[];
  vip_emails?: string[];
  vip_domains?: string[];
  interests?: string[];
  family_context?: {
    spouse_name?: string;
    kids_count?: number;
    family_names?: string[];
  };
  work_hours_start?: string;
  work_hours_end?: string;
  work_days?: number[];
  onboarding_completed?: boolean;
  onboarding_step?: number;
}

/**
 * Cached context entry with timestamp.
 */
interface CacheEntry {
  context: UserContext;
  cachedAt: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CACHE CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Cache time-to-live in milliseconds.
 * User context rarely changes, so 5 minutes is reasonable.
 */
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * In-memory cache for user context.
 * Key: userId, Value: cached context with timestamp
 *
 * NOTE: This is a simple in-memory cache. In a multi-instance deployment,
 * consider using Redis or similar for shared caching.
 */
const contextCache = new Map<string, CacheEntry>();

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SERVICE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetches user context for personalized AI analysis.
 *
 * This is the primary function to use when you need user context.
 * It handles caching automatically to minimize database queries.
 *
 * BEHAVIOR:
 * - Returns cached context if available and not expired
 * - Fetches from database if cache miss or expired
 * - Returns minimal context (just userId) if no record exists
 * - Never throws - returns minimal context on error
 *
 * @param userId - The user's UUID
 * @returns UserContext object for analyzer consumption
 *
 * @example
 * ```typescript
 * const context = await getUserContext(userId);
 *
 * // Use in analyzer
 * const result = await categorizer.analyze(email, context);
 *
 * // Check if VIP
 * if (context.vipEmails?.includes(senderEmail)) {
 *   // Handle VIP email
 * }
 * ```
 */
export async function getUserContext(userId: string): Promise<UserContext> {
  logger.debug('Getting user context', { userId: userId.substring(0, 8) });

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 1: Check cache for valid entry
  // ─────────────────────────────────────────────────────────────────────────────
  const cached = contextCache.get(userId);
  if (cached) {
    const age = Date.now() - cached.cachedAt;
    if (age < CACHE_TTL_MS) {
      logger.debug('Cache hit for user context', {
        userId: userId.substring(0, 8),
        ageMs: age,
      });
      return cached.context;
    }
    // Cache expired, will fetch fresh
    logger.debug('Cache expired for user context', {
      userId: userId.substring(0, 8),
      ageMs: age,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 2: Fetch from database
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from('user_context')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      // PGRST116 = Row not found - this is expected for new users
      if (error.code === 'PGRST116') {
        logger.debug('No user context found, returning minimal context', {
          userId: userId.substring(0, 8),
        });
        return createMinimalContext(userId);
      }

      // Actual database error
      logger.error('Failed to fetch user context', {
        userId: userId.substring(0, 8),
        error: error.message,
        code: error.code,
      });
      return createMinimalContext(userId);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 3: Transform and cache the result
    // ─────────────────────────────────────────────────────────────────────────────
    const context = transformRowToContext(userId, data as UserContextRow);

    // Store in cache
    contextCache.set(userId, {
      context,
      cachedAt: Date.now(),
    });

    logger.debug('User context fetched and cached', {
      userId: userId.substring(0, 8),
      hasRole: !!context.role,
      hasLocation: !!context.locationCity,
      vipCount: (context.vipEmails?.length ?? 0) + (context.vipDomains?.length ?? 0),
      onboardingCompleted: context.onboardingCompleted,
    });

    return context;
  } catch (error) {
    // Unexpected error - log and return minimal context
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error fetching user context', {
      userId: userId.substring(0, 8),
      error: message,
    });
    return createMinimalContext(userId);
  }
}

/**
 * Updates user context in the database.
 *
 * This function handles:
 * - Partial updates (only provided fields are changed)
 * - Cache invalidation (removes stale cache entry)
 * - Upsert behavior (creates record if it doesn't exist)
 *
 * @param userId - The user's UUID
 * @param updates - Partial update object with fields to change
 * @returns The updated UserContext, or null if update failed
 *
 * @example
 * ```typescript
 * // Update priorities
 * const updated = await updateUserContext(userId, {
 *   priorities: ['Work', 'Family', 'Learning'],
 * });
 *
 * // Add VIP email
 * const context = await getUserContext(userId);
 * await updateUserContext(userId, {
 *   vip_emails: [...(context.vipEmails || []), 'important@client.com'],
 * });
 *
 * // Complete onboarding
 * await updateUserContext(userId, {
 *   onboarding_completed: true,
 * });
 * ```
 */
export async function updateUserContext(
  userId: string,
  updates: UserContextUpdate
): Promise<UserContext | null> {
  logger.start('Updating user context', {
    userId: userId.substring(0, 8),
    fieldsToUpdate: Object.keys(updates),
  });

  try {
    const supabase = await createServerClient();

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 1: Prepare update payload
    // ─────────────────────────────────────────────────────────────────────────────
    const payload: Record<string, unknown> = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    // If completing onboarding, set the timestamp
    if (updates.onboarding_completed === true) {
      payload.onboarding_completed_at = new Date().toISOString();
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 2: Upsert to database
    // ─────────────────────────────────────────────────────────────────────────────
    const { data, error } = await supabase
      .from('user_context')
      .upsert(
        {
          user_id: userId,
          ...payload,
        },
        {
          onConflict: 'user_id',
        }
      )
      .select()
      .single();

    if (error) {
      logger.error('Failed to update user context', {
        userId: userId.substring(0, 8),
        error: error.message,
        code: error.code,
      });
      return null;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 3: Invalidate cache and return updated context
    // ─────────────────────────────────────────────────────────────────────────────
    contextCache.delete(userId);

    const updatedContext = transformRowToContext(userId, data as UserContextRow);

    // Store fresh data in cache
    contextCache.set(userId, {
      context: updatedContext,
      cachedAt: Date.now(),
    });

    logger.success('User context updated', {
      userId: userId.substring(0, 8),
      fieldsUpdated: Object.keys(updates).length,
    });

    return updatedContext;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error updating user context', {
      userId: userId.substring(0, 8),
      error: message,
    });
    return null;
  }
}

/**
 * Gets the raw user context row from database (for API responses).
 *
 * Unlike `getUserContext`, this returns the full database row format
 * rather than the transformed UserContext. Useful for API endpoints
 * that need to expose all fields.
 *
 * @param userId - The user's UUID
 * @returns Raw database row or null if not found
 *
 * @example
 * ```typescript
 * // In API endpoint
 * const row = await getUserContextRow(userId);
 * return apiResponse(row);
 * ```
 */
export async function getUserContextRow(
  userId: string
): Promise<UserContextRow | null> {
  logger.debug('Fetching raw user context row', {
    userId: userId.substring(0, 8),
  });

  try {
    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from('user_context')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        logger.debug('No user context row found', {
          userId: userId.substring(0, 8),
        });
        return null;
      }

      logger.error('Failed to fetch user context row', {
        userId: userId.substring(0, 8),
        error: error.message,
      });
      return null;
    }

    return data as UserContextRow;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error fetching user context row', {
      userId: userId.substring(0, 8),
      error: message,
    });
    return null;
  }
}

/**
 * Creates a new user context record with default values.
 *
 * This is typically called:
 * - When a new user signs up (via database trigger)
 * - When starting onboarding flow
 *
 * @param userId - The user's UUID
 * @returns Created UserContext or null if failed
 *
 * @example
 * ```typescript
 * // Create context for new user
 * const context = await createUserContext(userId);
 * ```
 */
export async function createUserContext(
  userId: string
): Promise<UserContext | null> {
  logger.start('Creating user context', { userId: userId.substring(0, 8) });

  try {
    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from('user_context')
      .insert({ user_id: userId })
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation (already exists)
      if (error.code === '23505') {
        logger.debug('User context already exists', {
          userId: userId.substring(0, 8),
        });
        return getUserContext(userId);
      }

      logger.error('Failed to create user context', {
        userId: userId.substring(0, 8),
        error: error.message,
        code: error.code,
      });
      return null;
    }

    const context = transformRowToContext(userId, data as UserContextRow);

    // Cache the new context
    contextCache.set(userId, {
      context,
      cachedAt: Date.now(),
    });

    logger.success('User context created', { userId: userId.substring(0, 8) });

    return context;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error creating user context', {
      userId: userId.substring(0, 8),
      error: message,
    });
    return null;
  }
}

/**
 * Advances the onboarding step counter.
 *
 * Convenience function for the onboarding wizard to track progress.
 *
 * @param userId - The user's UUID
 * @param step - The step number to set (1-7)
 * @returns Updated UserContext or null if failed
 *
 * @example
 * ```typescript
 * // User completed step 3
 * await advanceOnboardingStep(userId, 3);
 * ```
 */
export async function advanceOnboardingStep(
  userId: string,
  step: number
): Promise<UserContext | null> {
  logger.debug('Advancing onboarding step', {
    userId: userId.substring(0, 8),
    step,
  });

  return updateUserContext(userId, { onboarding_step: step });
}

/**
 * Marks onboarding as complete.
 *
 * Sets `onboarding_completed` to true and records the timestamp.
 *
 * @param userId - The user's UUID
 * @returns Updated UserContext or null if failed
 *
 * @example
 * ```typescript
 * // User finished onboarding
 * await completeOnboarding(userId);
 * ```
 */
export async function completeOnboarding(
  userId: string
): Promise<UserContext | null> {
  logger.debug('Completing onboarding', { userId: userId.substring(0, 8) });

  return updateUserContext(userId, {
    onboarding_completed: true,
    onboarding_step: 7, // Final step
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CACHE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Invalidates the cached context for a user.
 *
 * Call this when you know the context has changed externally
 * (e.g., via direct database update).
 *
 * @param userId - The user's UUID to invalidate
 *
 * @example
 * ```typescript
 * // After external update
 * invalidateContextCache(userId);
 * ```
 */
export function invalidateContextCache(userId: string): void {
  const deleted = contextCache.delete(userId);
  logger.debug('Cache invalidated', {
    userId: userId.substring(0, 8),
    wasInCache: deleted,
  });
}

/**
 * Clears the entire context cache.
 *
 * Useful for testing or administrative purposes.
 */
export function clearContextCache(): void {
  const size = contextCache.size;
  contextCache.clear();
  logger.debug('Context cache cleared', { entriesCleared: size });
}

/**
 * Gets cache statistics for monitoring.
 *
 * @returns Cache stats object
 */
export function getCacheStats(): {
  size: number;
  ttlMs: number;
} {
  return {
    size: contextCache.size,
    ttlMs: CACHE_TTL_MS,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a minimal UserContext with just the userId.
 *
 * Used when:
 * - No context record exists yet
 * - Database error occurred
 * - Cache miss and fetch failed
 *
 * @param userId - The user's UUID
 * @returns Minimal UserContext
 */
function createMinimalContext(userId: string): UserContext {
  return {
    userId,
    onboardingCompleted: false,
  };
}

/**
 * Transforms a database row into a UserContext object.
 *
 * This function handles:
 * - snake_case to camelCase conversion
 * - null handling (converts nulls to undefined)
 * - JSONB parsing for family_context
 *
 * @param userId - The user's UUID
 * @param row - Raw database row
 * @returns Transformed UserContext
 */
function transformRowToContext(userId: string, row: UserContextRow): UserContext {
  return {
    userId,

    // Professional identity
    role: row.role ?? undefined,
    company: row.company ?? undefined,

    // Location
    locationCity: row.location_city ?? undefined,
    locationMetro: row.location_metro ?? undefined,

    // Priorities and projects
    priorities: row.priorities ?? undefined,
    projects: row.projects ?? undefined,

    // VIP contacts
    vipEmails: row.vip_emails ?? undefined,
    vipDomains: row.vip_domains ?? undefined,

    // Interests
    interests: row.interests ?? undefined,

    // Family context
    familyContext: row.family_context
      ? {
          spouseName: row.family_context.spouse_name,
          kidsCount: row.family_context.kids_count,
          familyNames: row.family_context.family_names,
        }
      : undefined,

    // Work schedule
    workHours:
      row.work_hours_start && row.work_hours_end
        ? {
            start: row.work_hours_start,
            end: row.work_hours_end,
            days: row.work_days ?? [1, 2, 3, 4, 5], // Default Mon-Fri
          }
        : undefined,

    // Default timezone (could be added to user_context table later)
    timezone: 'America/Chicago',

    // Onboarding state
    onboardingCompleted: row.onboarding_completed,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIP HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Checks if an email address is a VIP contact for a user.
 *
 * This is a convenience function that:
 * 1. Gets the user's context (uses cache)
 * 2. Checks if the email matches VIP emails or domains
 *
 * @param userId - The user's UUID
 * @param email - Email address to check
 * @returns true if the email is from a VIP
 *
 * @example
 * ```typescript
 * const isVip = await isVipEmail(userId, email.senderEmail);
 * if (isVip) {
 *   // Boost priority
 * }
 * ```
 */
export async function isVipEmail(
  userId: string,
  email: string
): Promise<boolean> {
  const context = await getUserContext(userId);

  // Check exact email match
  if (context.vipEmails?.includes(email.toLowerCase())) {
    return true;
  }

  // Check domain match
  const domain = '@' + email.split('@')[1]?.toLowerCase();
  if (context.vipDomains?.some((d) => d.toLowerCase() === domain)) {
    return true;
  }

  return false;
}

/**
 * Checks if a location is near the user's metro area.
 *
 * Simple string matching - could be enhanced with geocoding.
 *
 * @param userId - The user's UUID
 * @param location - Location string to check
 * @returns true if the location seems local to the user
 *
 * @example
 * ```typescript
 * const isLocal = await isLocalEvent(userId, eventLocation);
 * if (isLocal) {
 *   // Apply 'local_event' label
 * }
 * ```
 */
export async function isLocalEvent(
  userId: string,
  location: string
): Promise<boolean> {
  const context = await getUserContext(userId);

  if (!context.locationCity && !context.locationMetro) {
    return false;
  }

  const locationLower = location.toLowerCase();

  // Check city match
  if (context.locationCity) {
    const city = context.locationCity.toLowerCase();
    if (locationLower.includes(city)) {
      return true;
    }
  }

  // Check metro match
  if (context.locationMetro) {
    const metro = context.locationMetro.toLowerCase();
    if (locationLower.includes(metro)) {
      return true;
    }
  }

  return false;
}
