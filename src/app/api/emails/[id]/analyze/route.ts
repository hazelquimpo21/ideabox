/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * Single Email Analysis API Route
 *
 * Triggers AI analysis for a specific email.
 *
 * POST /api/emails/[id]/analyze
 *   - Triggers AI analysis for the specified email
 *   - Returns: { success: boolean, analysis: AnalysisResult }
 *
 * @module app/api/emails/[id]/analyze/route
 */

import { createLogger, logAI, logPerformance } from '@/lib/utils/logger';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth, apiError, apiResponse } from '@/lib/api';
import { emailProcessor } from '@/services/processors/email-processor';
import type { Email, Client } from '@/types/database';
import type { UserContext } from '@/services/analyzers/types';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('SingleEmailAnalyzeAPI');

// ═══════════════════════════════════════════════════════════════════════════════
// POST HANDLER - Analyze Single Email
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handles POST requests to trigger AI analysis for a single email.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const timer = logPerformance('SingleEmailAnalyze.POST');
  const { id: emailId } = await params;

  try {
    // Initialize Supabase client
    const supabase = await createServerClient();

    // Require authentication
    const user = await requireAuth(supabase);
    if (user instanceof Response) return user;

    logger.start('Single email analysis triggered', { userId: user.id, emailId });

    // Fetch the email
    const { data: email, error: emailError } = await supabase
      .from('emails')
      .select('*')
      .eq('id', emailId)
      .eq('user_id', user.id)
      .single();

    if (emailError || !email) {
      logger.warn('Email not found', { emailId, userId: user.id });
      return apiError('Email not found', 404);
    }

    // Check if already analyzed (allow re-analysis)
    const forceReanalyze = request.headers.get('x-force-reanalyze') === 'true';
    if (email.analyzed_at && !forceReanalyze) {
      logger.info('Email already analyzed', { emailId });

      // Fetch existing analysis
      const { data: existingAnalysis } = await supabase
        .from('email_analyses')
        .select('*')
        .eq('email_id', emailId)
        .single();

      return apiResponse({
        success: true,
        alreadyAnalyzed: true,
        analysis: existingAnalysis,
        message: 'Email was already analyzed. Set x-force-reanalyze header to re-analyze.',
      });
    }

    // Get user's clients for context
    const { data: clients } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active');

    const context: UserContext = {
      userId: user.id,
      clients: (clients || []) as Client[],
    };

    logAI.callStart({
      model: 'gpt-4.1-mini',
      type: 'single_email_analysis',
      emailId,
      userId: user.id,
    });

    // Run analysis
    const result = await emailProcessor.process(email as Email, context);

    if (!result.success) {
      logger.error('Analysis failed', { emailId, error: result.error });
      return apiError(`Analysis failed: ${result.error}`, 500);
    }

    // Fetch the saved analysis
    const { data: analysis } = await supabase
      .from('email_analyses')
      .select('*')
      .eq('email_id', emailId)
      .single();

    const durationMs = timer.end({
      userId: user.id,
      emailId,
      success: true,
      tokensUsed: result.tokensUsed,
    });

    logAI.callComplete({
      model: 'gpt-4.1-mini',
      tokensUsed: result.tokensUsed || 0,
      durationMs,
    });

    logger.success('Single email analysis complete', {
      userId: user.id,
      emailId,
      category: result.analysis?.categorization?.category,
      hasAction: result.analysis?.actionExtraction?.hasAction,
      tokensUsed: result.tokensUsed,
    });

    return apiResponse({
      success: true,
      analysis,
      summary: {
        category: result.analysis?.categorization?.category,
        hasAction: result.analysis?.actionExtraction?.hasAction,
        actionTitle: result.analysis?.actionExtraction?.actionTitle,
        clientMatch: result.analysis?.clientTagging?.clientMatch,
        tokensUsed: result.tokensUsed,
        processingTimeMs: durationMs,
      },
    });

  } catch (error) {
    timer.end({ error: 'analysis_failed' });

    if (error instanceof Response) {
      return error;
    }

    logger.error('Single email analysis failed', {
      emailId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return apiError(`Analysis failed: ${errorMessage}`, 500);
  }
}
