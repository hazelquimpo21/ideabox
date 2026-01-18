/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * API Usage / Cost Tracking API Route
 *
 * GET /api/settings/usage - Get cost usage summary for current user
 *
 * Returns daily and monthly API costs with limits and percentages.
 *
 * @module api/settings/usage
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('API:Usage');

// ═══════════════════════════════════════════════════════════════════════════════
// GET - Fetch Cost Usage Summary
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET() {
  const supabase = await createServerClient();

  // Get authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    logger.warn('Unauthorized usage access attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  logger.info('Fetching usage summary', { userId: user.id });

  try {
    // Get user settings for limits
    const { data: settings } = await supabase
      .from('user_settings')
      .select('daily_cost_limit, monthly_cost_limit, pause_on_limit_reached')
      .eq('user_id', user.id)
      .single();

    const dailyLimit = settings?.daily_cost_limit ?? 1.0;
    const monthlyLimit = settings?.monthly_cost_limit ?? 10.0;

    // Get today's date and first day of month
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
      .toISOString()
      .split('T')[0];

    // Get daily cost
    const { data: dailyData } = await supabase
      .from('api_usage_logs')
      .select('estimated_cost')
      .eq('user_id', user.id)
      .gte('created_at', `${todayStr}T00:00:00`)
      .lt('created_at', `${todayStr}T23:59:59`);

    const dailyCost = dailyData?.reduce(
      (sum, row) => sum + (row.estimated_cost ?? 0),
      0
    ) ?? 0;

    // Get monthly cost
    const { data: monthlyData } = await supabase
      .from('api_usage_logs')
      .select('estimated_cost')
      .eq('user_id', user.id)
      .gte('created_at', `${monthStart}T00:00:00`);

    const monthlyCost = monthlyData?.reduce(
      (sum, row) => sum + (row.estimated_cost ?? 0),
      0
    ) ?? 0;

    // Get recent usage breakdown by service
    const { data: recentUsage } = await supabase
      .from('api_usage_logs')
      .select('service, analyzer_name, tokens_total, estimated_cost, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    // Calculate percentages
    const dailyPercent = dailyLimit > 0 ? (dailyCost / dailyLimit) * 100 : 0;
    const monthlyPercent = monthlyLimit > 0 ? (monthlyCost / monthlyLimit) * 100 : 0;

    // Aggregate by analyzer
    const analyzerBreakdown: Record<string, { count: number; cost: number; tokens: number }> = {};
    recentUsage?.forEach((log) => {
      const key = log.analyzer_name ?? log.service ?? 'unknown';
      if (!analyzerBreakdown[key]) {
        analyzerBreakdown[key] = { count: 0, cost: 0, tokens: 0 };
      }
      analyzerBreakdown[key].count += 1;
      analyzerBreakdown[key].cost += log.estimated_cost ?? 0;
      analyzerBreakdown[key].tokens += log.tokens_total ?? 0;
    });

    const response = {
      daily: {
        cost: Number(dailyCost.toFixed(4)),
        limit: dailyLimit,
        percent: Number(dailyPercent.toFixed(2)),
        remaining: Number(Math.max(0, dailyLimit - dailyCost).toFixed(4)),
      },
      monthly: {
        cost: Number(monthlyCost.toFixed(4)),
        limit: monthlyLimit,
        percent: Number(monthlyPercent.toFixed(2)),
        remaining: Number(Math.max(0, monthlyLimit - monthlyCost).toFixed(4)),
      },
      is_paused: settings?.pause_on_limit_reached ?? false,
      is_over_daily_limit: dailyCost >= dailyLimit,
      is_over_monthly_limit: monthlyCost >= monthlyLimit,
      breakdown: analyzerBreakdown,
      recent_count: recentUsage?.length ?? 0,
    };

    logger.debug('Usage summary fetched', {
      userId: user.id,
      dailyCost,
      monthlyCost,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error('Unexpected error fetching usage', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
