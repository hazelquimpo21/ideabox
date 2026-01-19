/**
 * User Context Service - Barrel Export
 *
 * Provides foundational user information for personalized AI analysis.
 * This module handles fetching, caching, and updating user context data.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * QUICK START
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import {
 *   getUserContext,
 *   updateUserContext,
 *   isVipEmail,
 * } from '@/services/user-context';
 *
 * // Get context for AI analysis
 * const context = await getUserContext(userId);
 *
 * // Check if sender is VIP
 * const vip = await isVipEmail(userId, senderEmail);
 *
 * // Update context
 * await updateUserContext(userId, {
 *   priorities: ['Work', 'Family'],
 * });
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * EXPORTED FUNCTIONS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Core Functions:
 * - getUserContext: Get context for AI analysis (cached)
 * - getUserContextRow: Get raw database row (for APIs)
 * - updateUserContext: Update context fields
 * - createUserContext: Create new context record
 *
 * Onboarding Functions:
 * - advanceOnboardingStep: Track onboarding progress
 * - completeOnboarding: Mark onboarding as complete
 *
 * VIP Helpers:
 * - isVipEmail: Check if email is from VIP contact
 * - isLocalEvent: Check if location is local to user
 *
 * Cache Management:
 * - invalidateContextCache: Clear cached context for user
 * - clearContextCache: Clear entire cache
 * - getCacheStats: Get cache statistics
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * EXPORTED TYPES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - UserContextRow: Raw database row type
 * - UserContextUpdate: Update payload type
 *
 * @module services/user-context
 * @version 1.0.0
 * @since January 2026
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CORE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Main service functions
  getUserContext,
  getUserContextRow,
  updateUserContext,
  createUserContext,

  // Onboarding functions
  advanceOnboardingStep,
  completeOnboarding,

  // VIP helpers
  isVipEmail,
  isLocalEvent,

  // Cache management
  invalidateContextCache,
  clearContextCache,
  getCacheStats,
} from './user-context-service';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type {
  UserContextRow,
  UserContextUpdate,
} from './user-context-service';
