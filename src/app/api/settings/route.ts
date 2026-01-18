/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * User Settings API Routes
 *
 * GET /api/settings - Get current user's settings
 * PATCH /api/settings - Update user settings
 *
 * @module api/settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/utils/logger';
import { z } from 'zod';

const logger = createLogger('API:Settings');

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

const updateSettingsSchema = z.object({
  // AI Analysis Settings
  auto_analyze: z.boolean().optional(),
  extract_actions: z.boolean().optional(),
  categorize_emails: z.boolean().optional(),
  detect_clients: z.boolean().optional(),

  // Analysis limits
  initial_sync_email_count: z.number().min(10).max(200).optional(),
  max_emails_per_sync: z.number().min(10).max(500).optional(),
  max_analysis_per_sync: z.number().min(10).max(200).optional(),

  // Cost Control Settings
  daily_cost_limit: z.number().min(0.1).max(100).optional(),
  monthly_cost_limit: z.number().min(1).max(500).optional(),
  cost_alert_threshold: z.number().min(0.1).max(1).optional(),
  pause_on_limit_reached: z.boolean().optional(),

  // Notification Settings
  email_digest_enabled: z.boolean().optional(),
  email_digest_frequency: z.enum(['daily', 'weekly', 'never']).optional(),
  action_reminders: z.boolean().optional(),
  new_client_alerts: z.boolean().optional(),
  sync_error_alerts: z.boolean().optional(),
  cost_limit_alerts: z.boolean().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET - Fetch User Settings
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET() {
  const supabase = await createServerClient();

  // Get authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    logger.warn('Unauthorized settings access attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  logger.info('Fetching settings', { userId: user.id });

  try {
    // Fetch user settings
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (settingsError) {
      // If no settings exist, create default settings
      if (settingsError.code === 'PGRST116') {
        logger.info('Creating default settings for user', { userId: user.id });

        const { data: newSettings, error: createError } = await supabase
          .from('user_settings')
          .insert({ user_id: user.id })
          .select()
          .single();

        if (createError) {
          logger.error('Failed to create default settings', {
            userId: user.id,
            error: createError.message,
          });
          return NextResponse.json(
            { error: 'Failed to create settings' },
            { status: 500 }
          );
        }

        return NextResponse.json(newSettings);
      }

      logger.error('Failed to fetch settings', {
        userId: user.id,
        error: settingsError.message,
      });
      return NextResponse.json(
        { error: 'Failed to fetch settings' },
        { status: 500 }
      );
    }

    logger.debug('Settings fetched successfully', { userId: user.id });
    return NextResponse.json(settings);
  } catch (error) {
    logger.error('Unexpected error fetching settings', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH - Update User Settings
// ═══════════════════════════════════════════════════════════════════════════════

export async function PATCH(request: NextRequest) {
  const supabase = await createServerClient();

  // Get authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    logger.warn('Unauthorized settings update attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Validate input
    const parseResult = updateSettingsSchema.safeParse(body);
    if (!parseResult.success) {
      logger.warn('Invalid settings update payload', {
        userId: user.id,
        errors: parseResult.error.flatten(),
      });
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const updates = parseResult.data;

    logger.info('Updating settings', {
      userId: user.id,
      fields: Object.keys(updates),
    });

    // Update settings
    const { data: settings, error: updateError } = await supabase
      .from('user_settings')
      .update(updates)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      // If no row exists, create it first
      if (updateError.code === 'PGRST116') {
        const { data: newSettings, error: createError } = await supabase
          .from('user_settings')
          .insert({ user_id: user.id, ...updates })
          .select()
          .single();

        if (createError) {
          logger.error('Failed to create settings', {
            userId: user.id,
            error: createError.message,
          });
          return NextResponse.json(
            { error: 'Failed to create settings' },
            { status: 500 }
          );
        }

        return NextResponse.json(newSettings);
      }

      logger.error('Failed to update settings', {
        userId: user.id,
        error: updateError.message,
      });
      return NextResponse.json(
        { error: 'Failed to update settings' },
        { status: 500 }
      );
    }

    logger.info('Settings updated successfully', {
      userId: user.id,
      updatedFields: Object.keys(updates),
    });

    return NextResponse.json(settings);
  } catch (error) {
    logger.error('Unexpected error updating settings', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
