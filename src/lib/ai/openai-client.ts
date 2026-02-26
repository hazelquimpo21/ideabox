/**
 * OpenAI Client for IdeaBox
 *
 * Provides a typed wrapper around OpenAI's API with function calling support.
 * All AI analysis in IdeaBox uses GPT-4.1-mini via this client.
 *
 * KEY FEATURES:
 * - Function calling for structured JSON outputs
 * - Automatic cost calculation and logging
 * - Retry logic with exponential backoff
 * - Body truncation for cost efficiency
 *
 * MODEL DECISION:
 * We use GPT-4.1-mini exclusively (no fallback).
 * Cost: ~$3-5/month for 250 emails/day.
 * See docs/DECISIONS.md for rationale.
 */

import OpenAI from 'openai';
import { createLogger } from '@/lib/utils/logger';
import { appConfig } from '@/config/app';
import { calculateCost, type AIModel } from '@/config/analyzers';

const logger = createLogger('OpenAIClient');

/**
 * OpenAI function schema for structured outputs.
 * Matches the OpenAI API's function calling format.
 */
export interface FunctionSchema {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

/**
 * Result from an OpenAI API call.
 */
export interface OpenAIResult<T> {
  /** Parsed data from function call response */
  data: T;
  /** Number of input tokens used */
  tokensInput: number;
  /** Number of output tokens used */
  tokensOutput: number;
  /** Total tokens used */
  tokensTotal: number;
  /** Estimated cost in USD */
  estimatedCost: number;
  /** Time taken for API call in ms */
  durationMs: number;
}

/**
 * Options for OpenAI API calls.
 */
export interface OpenAICallOptions {
  /** Model to use (default: gpt-4.1-mini) */
  model?: AIModel;
  /** Temperature for response (0-1, default: 0.3) */
  temperature?: number;
  /** Maximum tokens in response (default: 500) */
  maxTokens?: number;
}

/**
 * Masks an API key for safe logging.
 * Shows first 7 chars and last 4 chars: "sk-proj...xyzA"
 */
function maskApiKey(key: string): string {
  if (key.length <= 12) {
    return `${key.substring(0, 3)}...`;
  }
  return `${key.substring(0, 7)}...${key.substring(key.length - 4)}`;
}

/**
 * Validates that the OpenAI API key is configured and has valid format.
 * Throws a descriptive error if not set or invalid.
 */
function validateApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    logger.error('OpenAI API key not configured', {
      hint: 'Set OPENAI_API_KEY in your .env.local file',
    });
    throw new Error(
      'OPENAI_API_KEY environment variable is not set. ' +
      'Get your API key from https://platform.openai.com/api-keys'
    );
  }

  // Validate key format
  if (!apiKey.startsWith('sk-')) {
    logger.error('Invalid OpenAI API key format', {
      keyPreview: maskApiKey(apiKey),
      hint: 'API key should start with "sk-"',
    });
    throw new Error(
      `Invalid OPENAI_API_KEY format: key should start with "sk-". ` +
      `Got: "${maskApiKey(apiKey)}". ` +
      'Get a valid key from https://platform.openai.com/api-keys'
    );
  }

  // Check minimum length (valid keys are 51+ chars)
  if (apiKey.length < 20) {
    logger.error('OpenAI API key appears truncated', {
      keyLength: apiKey.length,
      keyPreview: maskApiKey(apiKey),
      hint: 'Valid API keys are 51+ characters. Check your .env.local file.',
    });
    throw new Error(
      `OPENAI_API_KEY appears truncated (${apiKey.length} chars). ` +
      `Valid keys are 51+ characters. Got: "${maskApiKey(apiKey)}". ` +
      'Check your .env.local file for the full key.'
    );
  }

  // Log successful validation with masked key for debugging
  logger.debug('OpenAI API key validated', {
    keyPreview: maskApiKey(apiKey),
    keyLength: apiKey.length,
  });

  return apiKey;
}

/**
 * Creates an OpenAI client instance.
 * Validates API key on creation.
 */
function createOpenAIClient(): OpenAI {
  const apiKey = validateApiKey();

  return new OpenAI({
    apiKey,
    // Timeout after 30 seconds (generous for function calling)
    timeout: 30000,
  });
}

/**
 * Truncates email body to control costs.
 *
 * Long emails (newsletters, threads) can have 50K+ characters.
 * We truncate to maxChars while preserving beginning and end
 * for context.
 *
 * @param body - The email body to truncate
 * @param maxChars - Maximum characters (default from config)
 * @returns Truncated body with indicator if truncated
 *
 * @example
 * ```typescript
 * const body = truncateBody(longEmailBody);
 * // Returns: "First 8K chars...[...truncated...]...Last 8K chars"
 * ```
 */
export function truncateBody(
  body: string,
  maxChars: number = appConfig.email.maxBodyChars
): string {
  if (body.length <= maxChars) {
    return body;
  }

  // Keep equal parts from beginning and end
  const halfLimit = Math.floor(maxChars / 2);
  const beginning = body.slice(0, halfLimit);
  const end = body.slice(-halfLimit);

  logger.debug('Truncated email body for AI', {
    originalLength: body.length,
    truncatedLength: maxChars,
  });

  return `${beginning}\n\n[...content truncated for AI processing (${body.length - maxChars} chars removed)...]\n\n${end}`;
}

/**
 * Calls OpenAI with function calling for structured output.
 *
 * This is the core method for all AI analysis. It:
 * 1. Sends the prompt to GPT-4.1-mini
 * 2. Uses function calling to get structured JSON
 * 3. Parses the response and returns typed data
 * 4. Logs token usage and cost for tracking
 *
 * @param systemPrompt - Instructions for the AI
 * @param userContent - The content to analyze (email text, etc.)
 * @param functionSchema - Schema defining the expected output structure
 * @param options - Optional configuration (model, temperature, maxTokens)
 * @returns Parsed result with usage metrics
 *
 * @example
 * ```typescript
 * const result = await analyzeWithFunction<CategoryResult>(
 *   'You are an email categorization specialist...',
 *   `Subject: ${email.subject}\nBody: ${email.body_text}`,
 *   CATEGORIZE_FUNCTION_SCHEMA,
 *   { temperature: 0.2 }
 * );
 *
 * console.log(result.data.category); // 'action_required'
 * console.log(result.estimatedCost); // 0.0002
 * ```
 */
export async function analyzeWithFunction<T>(
  systemPrompt: string,
  userContent: string,
  functionSchema: FunctionSchema,
  options: OpenAICallOptions = {}
): Promise<OpenAIResult<T>> {
  const client = createOpenAIClient();
  const startTime = performance.now();

  const model = options.model ?? 'gpt-4.1-mini';
  const temperature = options.temperature ?? 0.3;
  const maxTokens = options.maxTokens ?? 500;

  logger.debug('Calling OpenAI', {
    model,
    functionName: functionSchema.name,
    contentLength: userContent.length,
    temperature,
    maxTokens,
  });

  try {
    const response = await client.chat.completions.create({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      functions: [functionSchema],
      function_call: { name: functionSchema.name },
    });

    const message = response.choices[0]?.message;
    const functionCall = message?.function_call;

    if (!functionCall?.arguments) {
      logger.error('No function call in response', {
        model,
        functionName: functionSchema.name,
        finishReason: response.choices[0]?.finish_reason,
      });
      throw new Error(
        `OpenAI did not return a function call. ` +
        `Finish reason: ${response.choices[0]?.finish_reason ?? 'unknown'}`
      );
    }

    // Detect truncated responses before attempting JSON parse
    const finishReason = response.choices[0]?.finish_reason;
    if (finishReason === 'length') {
      logger.error('Response truncated due to max_tokens limit', {
        model,
        functionName: functionSchema.name,
        maxTokens,
        outputTokens: response.usage?.completion_tokens,
        argumentsLength: functionCall.arguments.length,
      });
      const truncationError = new Error(
        `Response truncated: max_tokens (${maxTokens}) limit reached for ${functionSchema.name}. ` +
        `Increase maxTokens in analyzer config to fix.`
      );
      truncationError.name = 'TokenLimitError';
      throw truncationError;
    }

    // Parse the function arguments as JSON
    const data = JSON.parse(functionCall.arguments) as T;

    // Calculate usage metrics
    const tokensInput = response.usage?.prompt_tokens ?? 0;
    const tokensOutput = response.usage?.completion_tokens ?? 0;
    const tokensTotal = response.usage?.total_tokens ?? 0;
    const estimatedCost = calculateCost(model, tokensInput, tokensOutput);
    const durationMs = Math.round(performance.now() - startTime);

    logger.info('OpenAI call successful', {
      model,
      functionName: functionSchema.name,
      tokensInput,
      tokensOutput,
      tokensTotal,
      estimatedCost,
      durationMs,
    });

    return {
      data,
      tokensInput,
      tokensOutput,
      tokensTotal,
      estimatedCost,
      durationMs,
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);

    // Type guard for OpenAI errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorName = error instanceof Error ? error.name : 'UnknownError';

    // Check for authentication errors (401)
    const isAuthError =
      errorMessage.includes('401') ||
      errorMessage.toLowerCase().includes('incorrect api key') ||
      errorMessage.toLowerCase().includes('invalid api key') ||
      errorMessage.toLowerCase().includes('authentication');

    if (isAuthError) {
      const apiKey = process.env.OPENAI_API_KEY || '';
      logger.error('OpenAI authentication failed - API key is invalid', {
        model,
        functionName: functionSchema.name,
        keyPreview: maskApiKey(apiKey),
        keyLength: apiKey.length,
        hint: 'Your API key may be expired, revoked, or incorrect. Get a new key from https://platform.openai.com/api-keys',
        durationMs,
      });
    } else {
      logger.error('OpenAI call failed', {
        model,
        functionName: functionSchema.name,
        error: errorMessage,
        errorType: errorName,
        durationMs,
      });
    }

    throw error;
  }
}

/**
 * Calls OpenAI with retry logic for transient failures.
 *
 * Retries on:
 * - Rate limit errors (429)
 * - Server errors (500, 502, 503, 504)
 * - Timeout errors
 *
 * Uses exponential backoff between retries.
 *
 * @param fn - Function that makes the OpenAI call
 * @param maxRetries - Maximum retry attempts (default: 3)
 * @returns Result from successful call
 * @throws Last error if all retries fail
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = appConfig.retry.maxAttempts
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      const isRetryable = isRetryableError(error);

      if (!isRetryable || attempt === maxRetries) {
        logger.error('OpenAI call failed (not retrying)', {
          attempt,
          maxRetries,
          error: lastError.message,
          isRetryable,
        });
        throw lastError;
      }

      // Calculate backoff delay with jitter
      const baseDelay = appConfig.retry.baseDelayMs;
      const maxDelay = appConfig.retry.maxDelayMs;
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      const jitter = Math.random() * 0.3 * delay;
      const totalDelay = Math.round(delay + jitter);

      logger.warn('OpenAI call failed, retrying', {
        attempt,
        maxRetries,
        error: lastError.message,
        retryInMs: totalDelay,
      });

      await sleep(totalDelay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError ?? new Error('Unknown error in retry loop');
}

/**
 * Checks if an error is retryable (transient failure).
 */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  // Token limit errors are NOT retryable — same limit will produce same truncation
  if (error.name === 'TokenLimitError') {
    return false;
  }

  const message = error.message.toLowerCase();

  // Rate limit
  if (message.includes('rate limit') || message.includes('429')) {
    return true;
  }

  // Server errors
  if (
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('server error')
  ) {
    return true;
  }

  // Timeout
  if (message.includes('timeout') || message.includes('timed out')) {
    return true;
  }

  // JSON parse errors from truncated function call responses (often caused by max_tokens cutoff)
  if (error instanceof SyntaxError || message.includes('unterminated string') || message.includes('unexpected end of json')) {
    return true;
  }

  return false;
}

/**
 * Sleep helper for retry delays.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
