/**
 * Client Tagger Analyzer
 *
 * Links emails to known clients from the user's roster.
 * This analyzer enables client-centric email management.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CLIENT MATCHING PHILOSOPHY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This analyzer receives the user's client list and intelligently matches:
 * - Sender email domain matches client's registered domains
 * - Email mentions client name or company
 * - Email discusses a known project with this client
 * - Context suggests client-related correspondence
 *
 * If no match is found, the analyzer may suggest:
 * - This could be a new potential client
 * - This is someone the user is networking with
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * RELATIONSHIP SIGNALS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The analyzer also detects relationship health from email tone:
 * - positive: Praise, satisfaction, moving forward
 * - neutral: Routine communication
 * - negative: Complaints, delays, concerns
 * - unknown: Cannot determine from content
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import { ClientTaggerAnalyzer } from '@/services/analyzers/client-tagger';
 *
 * const tagger = new ClientTaggerAnalyzer();
 *
 * const result = await tagger.analyze(email, {
 *   userId: 'user-123',
 *   clients: [
 *     {
 *       id: 'client-1',
 *       name: 'Acme Corp',
 *       company: 'Acme Corporation',
 *       email_domains: ['acme.com', 'acmecorp.com'],
 *       keywords: ['widgets', 'supply chain'],
 *     },
 *   ],
 * });
 *
 * if (result.success && result.data.clientMatch) {
 *   console.log(result.data.clientName);        // 'Acme Corp'
 *   console.log(result.data.relationshipSignal); // 'positive'
 * }
 * ```
 *
 * @module services/analyzers/client-tagger
 * @version 1.0.0
 */

import { BaseAnalyzer } from './base-analyzer';
import { analyzerConfig } from '@/config/analyzers';
import type { FunctionSchema } from '@/lib/ai/openai-client';
import type { Client } from '@/types/database';
import type {
  ClientTaggingData,
  ClientTaggingResult,
  EmailInput,
  UserContext,
  RelationshipSignal,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Function name for OpenAI function calling.
 */
const FUNCTION_NAME = 'tag_client';

/**
 * Description of what the function does.
 */
const FUNCTION_DESCRIPTION =
  'Links email to a client and extracts project information';

/**
 * Valid relationship signals for schema validation.
 */
const RELATIONSHIP_SIGNALS: RelationshipSignal[] = [
  'positive',
  'neutral',
  'negative',
  'unknown',
];

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Base system prompt for client tagging.
 * This template includes a placeholder for the client list.
 *
 * @param clientListText - Formatted client list to inject
 * @returns Complete system prompt
 */
function buildSystemPrompt(clientListText: string): string {
  return `You are a client relationship specialist. Your job is to determine if this email relates to any of the user's known clients.

Known clients:
${clientListText}

MATCHING CRITERIA (in order of strength):
1. Sender email domain matches client's registered domains (strongest signal)
2. Email explicitly mentions client name or company name
3. Email discusses a known project with this client
4. Email context strongly suggests client-related correspondence

MATCHING RULES:
- Only match if you're confident this email relates to the client
- Don't match just because a common word appears (e.g., "apple" the fruit vs Apple Inc.)
- Consider the full context: sender, subject, and body
- If multiple clients could match, choose the most likely one

IF NO MATCH FOUND, consider:
- Could this be a NEW potential client? (business inquiry, referral, networking)
- Is this someone the user is building a relationship with?
- Suggest adding as a new client if it looks like ongoing business

PROJECT EXTRACTION:
- Look for specific project names, codenames, or initiative titles
- Examples: "Project Phoenix", "Website Redesign", "Q4 Campaign"
- Only extract if clearly mentioned, don't guess

RELATIONSHIP SIGNALS (detect from email tone):
- positive: Praise, satisfaction, gratitude, excitement, moving forward
- neutral: Routine updates, standard business communication
- negative: Complaints, frustration, delays, concerns, issues
- unknown: Cannot determine sentiment from content

Be honest about match confidence. Low confidence (< 0.7) if:
- Match is based only on domain without explicit client mention
- Client name is generic and could refer to something else
- Context is ambiguous`;
}

/**
 * Fallback prompt when no clients are configured.
 */
const NO_CLIENTS_PROMPT = `You are a client relationship specialist. The user has not added any clients yet.

Your job is to identify if this email appears to be from a potential client or business contact.

Look for:
- Business inquiries or requests for services
- Networking or relationship-building emails
- Referrals or introductions
- Ongoing business discussions

If this looks like a potential client, suggest adding them via new_client_suggestion.

For relationship signals:
- positive: Praise, interest, enthusiasm
- neutral: Standard inquiry
- negative: Complaints or issues
- unknown: Cannot determine

Set client_match to false since there are no known clients to match against.`;

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTION SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * OpenAI function schema for structured output.
 *
 * This schema defines exactly what JSON structure OpenAI should return.
 * All fields match the ClientTaggingData interface.
 */
const FUNCTION_SCHEMA: FunctionSchema = {
  name: FUNCTION_NAME,
  description: FUNCTION_DESCRIPTION,
  parameters: {
    type: 'object',
    properties: {
      // Whether client was matched (required)
      client_match: {
        type: 'boolean',
        description: 'Whether this email relates to a known client',
      },

      // Matched client name (optional, null if no match)
      client_name: {
        type: 'string',
        description: 'Name of the client from the provided roster, or null if no match',
      },

      // Match confidence (required)
      match_confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Confidence in the client match (0-1)',
      },

      // Project mentioned (optional)
      project_name: {
        type: 'string',
        description: 'Specific project mentioned (e.g., "Website Redesign")',
      },

      // New client suggestion (optional)
      new_client_suggestion: {
        type: 'string',
        description: 'If no match, suggest if this could be a new client to add',
      },

      // Relationship signal (required)
      relationship_signal: {
        type: 'string',
        enum: RELATIONSHIP_SIGNALS,
        description: 'Sentiment/health of the relationship based on email tone',
      },
    },
    required: ['client_match', 'match_confidence', 'relationship_signal'],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT TAGGER ANALYZER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Client Tagger Analyzer
 *
 * Links emails to known clients from the user's roster.
 * Unlike other analyzers, this one requires user context (the client list)
 * to function properly.
 *
 * The analyzer:
 * - Matches emails to clients by domain, name, or context
 * - Extracts project names when mentioned
 * - Detects relationship health from email tone
 * - Suggests new clients when detecting potential business
 *
 * @example
 * ```typescript
 * const tagger = new ClientTaggerAnalyzer();
 *
 * // IMPORTANT: Always pass user context with clients
 * const result = await tagger.analyze(email, {
 *   userId: 'user-123',
 *   clients: await fetchUserClients(userId),
 * });
 *
 * if (result.success) {
 *   if (result.data.clientMatch) {
 *     // Link email to matched client
 *     await linkEmailToClient(email.id, result.data.clientId);
 *   } else if (result.data.newClientSuggestion) {
 *     // Suggest adding a new client
 *     showNewClientPrompt(result.data.newClientSuggestion);
 *   }
 * }
 * ```
 */
export class ClientTaggerAnalyzer extends BaseAnalyzer<ClientTaggingData> {
  /**
   * Creates a new ClientTaggerAnalyzer instance.
   *
   * Uses the clientTagger configuration from config/analyzers.ts.
   * The config controls:
   * - enabled: Whether this analyzer runs
   * - model: AI model to use (gpt-4.1-mini)
   * - temperature: Response randomness (0.2 for accurate matching)
   * - maxTokens: Maximum response tokens (300)
   */
  constructor() {
    super('ClientTagger', analyzerConfig.clientTagger);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ABSTRACT METHOD IMPLEMENTATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Analyzes an email and links it to a client if possible.
   *
   * IMPORTANT: This analyzer requires user context with the client list.
   * Without it, the analyzer can only detect potential new clients.
   *
   * @param email - Email data to analyze
   * @param context - User context with client list (required for matching)
   * @returns Client tagging result
   *
   * @example
   * ```typescript
   * // Always fetch clients before calling analyze
   * const clients = await supabase
   *   .from('clients')
   *   .select('*')
   *   .eq('user_id', userId)
   *   .eq('status', 'active');
   *
   * const result = await tagger.analyze(email, {
   *   userId,
   *   clients: clients.data,
   * });
   * ```
   */
  async analyze(
    email: EmailInput,
    context?: UserContext
  ): Promise<ClientTaggingResult> {
    // Log warning if no context provided
    if (!context?.clients || context.clients.length === 0) {
      this.logger.warn('No clients provided for matching', {
        emailId: email.id,
        hasContext: !!context,
        clientCount: context?.clients?.length ?? 0,
      });
    }

    // Use the base class executeAnalysis with context
    const result = await this.executeAnalysis(email, context);

    // Post-process to normalize and enrich the response
    if (result.success && context?.clients) {
      result.data = this.normalizeAndEnrichResponse(result.data, context.clients);
    } else if (result.success) {
      result.data = this.normalizeResponse(result.data);
    }

    return result;
  }

  /**
   * Returns the OpenAI function schema for client tagging.
   *
   * The schema defines:
   * - client_match: Boolean indicating if a client was matched
   * - client_name: Name of matched client (from roster)
   * - match_confidence: 0-1 confidence score
   * - project_name: Specific project if mentioned
   * - new_client_suggestion: Suggestion if potential new client
   * - relationship_signal: positive/neutral/negative/unknown
   *
   * @returns Function schema for OpenAI function calling
   */
  getFunctionSchema(): FunctionSchema {
    return FUNCTION_SCHEMA;
  }

  /**
   * Returns the system prompt for client tagging.
   *
   * Unlike other analyzers, this prompt is DYNAMIC.
   * It includes the user's client list so the AI knows which
   * clients to look for and can match accurately.
   *
   * @param context - User context containing client list
   * @returns System prompt with embedded client roster
   */
  getSystemPrompt(context?: UserContext): string {
    // If no clients, use the fallback prompt
    if (!context?.clients || context.clients.length === 0) {
      return NO_CLIENTS_PROMPT;
    }

    // Format the client list for the prompt
    const clientListText = this.formatClientList(context.clients);

    return buildSystemPrompt(clientListText);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Formats the client list for inclusion in the system prompt.
   *
   * Creates a clear, structured list that the AI can easily parse.
   * Includes name, company, domains, and keywords for matching.
   *
   * @param clients - User's client list
   * @returns Formatted client list string
   */
  private formatClientList(clients: Client[]): string {
    // Only include active clients for matching
    const activeClients = clients.filter((c) => c.status === 'active');

    if (activeClients.length === 0) {
      return '(No active clients)';
    }

    return activeClients
      .map((client) => {
        const parts: string[] = [];

        // Client name (always present)
        parts.push(`- ${client.name}`);

        // Company name if different from client name
        if (client.company && client.company !== client.name) {
          parts[0] += ` (${client.company})`;
        }

        // Email domains for matching sender
        if (client.email_domains && client.email_domains.length > 0) {
          parts.push(`  Domains: ${client.email_domains.join(', ')}`);
        }

        // Keywords for context matching
        if (client.keywords && client.keywords.length > 0) {
          parts.push(`  Keywords: ${client.keywords.join(', ')}`);
        }

        // Priority indicator for VIP clients
        if (client.priority === 'vip' || client.priority === 'high') {
          parts.push(`  Priority: ${client.priority.toUpperCase()}`);
        }

        return parts.join('\n');
      })
      .join('\n');
  }

  /**
   * Normalizes the OpenAI response to match our TypeScript interface.
   *
   * Converts snake_case to camelCase and applies defaults.
   *
   * @param rawData - Raw data from OpenAI (snake_case)
   * @returns Normalized data (camelCase)
   */
  private normalizeResponse(rawData: Record<string, unknown>): ClientTaggingData {
    return {
      // Core matching fields
      clientMatch: Boolean(rawData.client_match),
      clientName: (rawData.client_name as string) || null,
      clientId: null, // Will be enriched later if match found

      // Confidence
      matchConfidence: (rawData.match_confidence as number) || 0,

      // Project and suggestions
      projectName: rawData.project_name as string | undefined,
      newClientSuggestion: rawData.new_client_suggestion as string | undefined,

      // Relationship health
      relationshipSignal:
        (rawData.relationship_signal as RelationshipSignal) || 'unknown',
    };
  }

  /**
   * Normalizes and enriches the response with client ID.
   *
   * When a client name is matched, this method looks up the
   * actual client ID from the roster for database linking.
   *
   * @param rawData - Raw data from OpenAI
   * @param clients - User's client list for ID lookup
   * @returns Enriched data with client ID
   */
  private normalizeAndEnrichResponse(
    rawData: Record<string, unknown>,
    clients: Client[]
  ): ClientTaggingData {
    // First normalize the basic response
    const normalized = this.normalizeResponse(rawData);

    // If a client was matched, look up the ID
    if (normalized.clientMatch && normalized.clientName) {
      const matchedClient = this.findClientByName(normalized.clientName, clients);

      if (matchedClient) {
        normalized.clientId = matchedClient.id;

        // Log successful match
        this.logger.debug('Client matched', {
          clientName: normalized.clientName,
          clientId: matchedClient.id,
          confidence: normalized.matchConfidence,
        });
      } else {
        // AI claimed a match but we couldn't find the client
        // This shouldn't happen if AI follows instructions
        this.logger.warn('AI matched client not found in roster', {
          claimedName: normalized.clientName,
          availableClients: clients.map((c) => c.name),
        });

        // Downgrade to no match since we can't link
        normalized.clientMatch = false;
        normalized.matchConfidence = 0;
      }
    }

    return normalized;
  }

  /**
   * Finds a client by name with fuzzy matching.
   *
   * The AI might return slightly different capitalization or
   * formatting, so we do case-insensitive and trimmed matching.
   *
   * @param name - Client name from AI response
   * @param clients - User's client list
   * @returns Matched client or undefined
   */
  private findClientByName(name: string, clients: Client[]): Client | undefined {
    const normalizedName = name.toLowerCase().trim();

    // First try exact match (case-insensitive)
    let match = clients.find(
      (c) => c.name.toLowerCase().trim() === normalizedName
    );

    if (match) return match;

    // Try matching by company name too
    match = clients.find(
      (c) => c.company?.toLowerCase().trim() === normalizedName
    );

    if (match) return match;

    // Try partial match (AI might include/exclude "Inc", "LLC", etc.)
    match = clients.find(
      (c) =>
        normalizedName.includes(c.name.toLowerCase()) ||
        c.name.toLowerCase().includes(normalizedName)
    );

    return match;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default client tagger instance for convenience.
 *
 * IMPORTANT: Always pass user context with clients when using.
 *
 * @example
 * ```typescript
 * import { clientTagger } from '@/services/analyzers/client-tagger';
 *
 * // Always fetch and pass clients
 * const result = await clientTagger.analyze(email, {
 *   userId: 'user-123',
 *   clients: await getActiveClients(userId),
 * });
 * ```
 */
export const clientTagger = new ClientTaggerAnalyzer();
