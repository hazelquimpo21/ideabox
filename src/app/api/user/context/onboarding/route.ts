/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issues with new tables
/**
 * User Context Onboarding API Route
 *
 * Handles onboarding step progression and data collection.
 * Used by the onboarding wizard to save user's preferences as they
 * progress through each step.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * POST /api/user/context/onboarding
 *   Advances onboarding to a specific step and optionally saves step data.
 *   Body: { step: number, data?: UserContextUpdate }
 *   Returns: Updated user_context row.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ONBOARDING STEPS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Step 1: Role & Company
 *   - role: User's primary role
 *   - company: Company name
 *   - industry: Industry type
 *
 * Step 2: Priorities
 *   - priorities: Ordered list of user's priorities
 *
 * Step 3: Projects
 *   - projects: List of active projects
 *
 * Step 4: VIP Contacts
 *   - vip_emails: Important email addresses
 *   - vip_domains: Important email domains
 *
 * Step 5: Location
 *   - location_city: User's city
 *   - location_metro: Metro area for local events
 *
 * Step 6: Interests
 *   - interests: Topics of interest
 *
 * Step 7: Work Schedule
 *   - work_hours_start: Work start time
 *   - work_hours_end: Work end time
 *   - work_days: Working days of the week
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Complete step 1:
 *   POST /api/user/context/onboarding
 *   {
 *     "step": 1,
 *     "data": {
 *       "role": "Developer",
 *       "company": "Acme Corp"
 *     }
 *   }
 *
 * Complete step 4 (VIPs):
 *   POST /api/user/context/onboarding
 *   {
 *     "step": 4,
 *     "data": {
 *       "vip_emails": ["boss@company.com"],
 *       "vip_domains": ["@importantclient.com"]
 *     }
 *   }
 *
 * Complete final step (marks onboarding complete):
 *   POST /api/user/context/onboarding
 *   {
 *     "step": 7,
 *     "data": {
 *       "work_hours_start": "09:00",
 *       "work_hours_end": "17:00",
 *       "work_days": [1, 2, 3, 4, 5]
 *     }
 *   }
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ERROR HANDLING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - 401: Not authenticated
 * - 400: Invalid request body or step number
 * - 500: Database or server error
 *
 * @module app/api/user/context/onboarding/route
 * @version 1.0.0
 * @since January 2026
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import {
  apiResponse,
  apiError,
  validateBody,
  requireAuth,
} from '@/lib/api/utils';
import { userContextOnboardingSchema } from '@/lib/api/schemas';
import {
  updateUserContext,
  advanceOnboardingStep,
  completeOnboarding,
  getUserContextRow,
} from '@/services/user-context';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('API:UserContextOnboarding');

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Total number of onboarding steps.
 * When step === TOTAL_STEPS, onboarding is marked as complete.
 */
const TOTAL_STEPS = 7;

/**
 * Step names for logging and debugging.
 */
const STEP_NAMES: Record<number, string> = {
  1: 'Role & Company',
  2: 'Priorities',
  3: 'Projects',
  4: 'VIP Contacts',
  5: 'Location',
  6: 'Interests',
  7: 'Work Schedule',
};

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/user/context/onboarding - Advance onboarding step
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Advances the user's onboarding to a specific step.
 *
 * This endpoint:
 * 1. Validates the step number (1-7)
 * 2. Saves any provided step data
 * 3. Updates the onboarding_step counter
 * 4. If step === 7, marks onboarding as complete
 *
 * @param request - Next.js request object with JSON body
 * @returns JSON response with updated user context
 *
 * @example Request body:
 * ```json
 * {
 *   "step": 3,
 *   "data": {
 *     "projects": ["Project A", "Project B"]
 *   }
 * }
 * ```
 *
 * @example Response (success):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "id": "uuid",
 *     "projects": ["Project A", "Project B"],
 *     "onboarding_step": 3,
 *     "onboarding_completed": false,
 *     ...
 *   }
 * }
 * ```
 */
export async function POST(request: NextRequest) {
  logger.start('Processing onboarding step');

  try {
    const supabase = await createServerClient();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: Authenticate user
    // ─────────────────────────────────────────────────────────────────────────
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      logger.warn('Unauthorized access attempt to onboarding endpoint');
      return userResult;
    }
    const user = userResult;

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Validate request body
    // ─────────────────────────────────────────────────────────────────────────
    const bodyResult = await validateBody(request, userContextOnboardingSchema);
    if (bodyResult instanceof Response) {
      logger.warn('Invalid onboarding request body', {
        userId: user.id.substring(0, 8),
      });
      return bodyResult;
    }
    const { step, data } = bodyResult;

    logger.debug('Processing onboarding step', {
      userId: user.id.substring(0, 8),
      step,
      stepName: STEP_NAMES[step] ?? 'Unknown',
      hasData: !!data,
      dataFields: data ? Object.keys(data) : [],
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Save step data if provided
    // ─────────────────────────────────────────────────────────────────────────
    if (data && Object.keys(data).length > 0) {
      const updateResult = await updateUserContext(user.id, data);

      if (!updateResult) {
        logger.error('Failed to save onboarding step data', {
          userId: user.id.substring(0, 8),
          step,
          fields: Object.keys(data),
        });
        return apiError('Failed to save step data', 500);
      }

      logger.debug('Onboarding step data saved', {
        userId: user.id.substring(0, 8),
        step,
        fieldsUpdated: Object.keys(data).length,
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: Update onboarding progress
    // ─────────────────────────────────────────────────────────────────────────
    let updatedContext;

    if (step >= TOTAL_STEPS) {
      // Final step - mark onboarding as complete
      updatedContext = await completeOnboarding(user.id);

      if (!updatedContext) {
        logger.error('Failed to complete onboarding', {
          userId: user.id.substring(0, 8),
        });
        return apiError('Failed to complete onboarding', 500);
      }

      logger.success('Onboarding completed', {
        userId: user.id.substring(0, 8),
      });
    } else {
      // Intermediate step - just advance the counter
      updatedContext = await advanceOnboardingStep(user.id, step);

      if (!updatedContext) {
        logger.error('Failed to advance onboarding step', {
          userId: user.id.substring(0, 8),
          step,
        });
        return apiError('Failed to advance onboarding step', 500);
      }

      logger.debug('Onboarding step advanced', {
        userId: user.id.substring(0, 8),
        step,
        stepName: STEP_NAMES[step],
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 5: Fetch and return the updated row
    // ─────────────────────────────────────────────────────────────────────────
    const contextRow = await getUserContextRow(user.id);

    logger.success('Onboarding step processed', {
      userId: user.id.substring(0, 8),
      step,
      stepName: STEP_NAMES[step] ?? 'Unknown',
      isComplete: contextRow?.onboarding_completed ?? false,
    });

    return apiResponse(contextRow);
  } catch (error) {
    // ─────────────────────────────────────────────────────────────────────────
    // Error handling: Log and return generic error
    // ─────────────────────────────────────────────────────────────────────────
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error processing onboarding step', {
      error: message,
    });
    return apiError('Internal server error', 500);
  }
}
