/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issues with user_profiles table
/**
 * User Profile API Route
 *
 * Handles fetching and updating user profile data.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /api/profile
 *   Fetches the user's profile data.
 *   Returns: User profile row.
 *
 * PATCH /api/profile
 *   Updates user profile fields (partial update supported).
 *   Body: { full_name?: string, timezone?: string }
 *   Returns: Updated user profile row.
 *
 * @module app/api/profile/route
 * @since January 2026
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/utils/logger';
import { z } from 'zod';

const logger = createLogger('API:Profile');

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

const updateProfileSchema = z.object({
  full_name: z.string().min(1).max(100).optional(),
  timezone: z.string().max(50).optional(),
  default_view: z.enum(['inbox', 'actions', 'calendar']).optional(),
  emails_per_page: z.number().min(10).max(100).optional(),
  onboarding_completed: z.boolean().optional(), // Allow resetting onboarding from Settings
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/profile - Fetch user profile
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET() {
  const supabase = await createServerClient();

  // Get authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    logger.warn('Unauthorized profile access attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  logger.info('Fetching profile', { userId: user.id.substring(0, 8) });

  try {
    // Fetch user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
      // If no profile exists, create one with defaults from Google metadata
      if (profileError.code === 'PGRST116') {
        logger.info('Creating default profile for user', { userId: user.id.substring(0, 8) });

        const { data: newProfile, error: createError } = await supabase
          .from('user_profiles')
          .insert({
            id: user.id,
            email: user.email ?? '',
            full_name: user.user_metadata?.full_name ?? null,
          })
          .select()
          .single();

        if (createError) {
          logger.error('Failed to create default profile', {
            userId: user.id.substring(0, 8),
            error: createError.message,
          });
          return NextResponse.json(
            { error: 'Failed to create profile' },
            { status: 500 }
          );
        }

        return NextResponse.json(newProfile);
      }

      logger.error('Failed to fetch profile', {
        userId: user.id.substring(0, 8),
        error: profileError.message,
      });
      return NextResponse.json(
        { error: 'Failed to fetch profile' },
        { status: 500 }
      );
    }

    logger.debug('Profile fetched successfully', { userId: user.id.substring(0, 8) });
    return NextResponse.json(profile);
  } catch (error) {
    logger.error('Unexpected error fetching profile', {
      userId: user.id.substring(0, 8),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /api/profile - Update user profile
// ═══════════════════════════════════════════════════════════════════════════════

export async function PATCH(request: NextRequest) {
  const supabase = await createServerClient();

  // Get authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    logger.warn('Unauthorized profile update attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Validate input
    const parseResult = updateProfileSchema.safeParse(body);
    if (!parseResult.success) {
      logger.warn('Invalid profile update payload', {
        userId: user.id.substring(0, 8),
        errors: parseResult.error.flatten(),
      });
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const updates = parseResult.data;

    logger.info('Updating profile', {
      userId: user.id.substring(0, 8),
      fields: Object.keys(updates),
    });

    // Update profile
    const { data: profile, error: updateError } = await supabase
      .from('user_profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', user.id)
      .select()
      .single();

    if (updateError) {
      // If no row exists, create it first
      if (updateError.code === 'PGRST116') {
        const { data: newProfile, error: createError } = await supabase
          .from('user_profiles')
          .insert({
            id: user.id,
            email: user.email ?? '',
            ...updates,
          })
          .select()
          .single();

        if (createError) {
          logger.error('Failed to create profile', {
            userId: user.id.substring(0, 8),
            error: createError.message,
          });
          return NextResponse.json(
            { error: 'Failed to create profile' },
            { status: 500 }
          );
        }

        return NextResponse.json(newProfile);
      }

      logger.error('Failed to update profile', {
        userId: user.id.substring(0, 8),
        error: updateError.message,
      });
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      );
    }

    logger.info('Profile updated successfully', {
      userId: user.id.substring(0, 8),
      updatedFields: Object.keys(updates),
    });

    return NextResponse.json(profile);
  } catch (error) {
    logger.error('Unexpected error updating profile', {
      userId: user.id.substring(0, 8),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
