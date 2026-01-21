/**
 * Contact Enricher Analyzer
 *
 * Extracts contact metadata from email signatures and content, AND classifies
 * the sender type to distinguish real contacts from newsletters/broadcasts.
 *
 * This analyzer runs SELECTIVELY - only on contacts that need enrichment.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DESIGN PHILOSOPHY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This analyzer is EXPENSIVE (runs on full email body) so we run it selectively:
 *
 * CRITERIA FOR RUNNING:
 * - Contact has extraction_confidence IS NULL (never enriched)
 * - OR extraction_confidence < 0.5 (low quality enrichment)
 * - OR last_extracted_at > 30 days ago (stale data)
 * - AND contact has 3+ emails (worth the token cost)
 *
 * The calling code is responsible for determining when to run this analyzer.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * EXTRACTED FIELDS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Contact Information:
 * - company: Company name from signature or email context
 * - jobTitle: Job title or role
 * - phone: Phone number from signature
 * - linkedinUrl: LinkedIn profile URL
 * - relationshipType: client, colleague, vendor, friend, family, etc.
 * - birthday: Birthday if mentioned (MM-DD format)
 * - workAnniversary: Work anniversary date
 * - source: Where the data came from (signature, email_body, both)
 *
 * Sender Type Classification (NEW Jan 2026):
 * - senderType: direct, broadcast, cold_outreach, opportunity, unknown
 * - broadcastSubtype: newsletter_author, company_newsletter, digest_service, transactional
 * - senderTypeConfidence: 0-1 confidence in classification
 * - senderTypeReasoning: Why this classification was chosen
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * SENDER TYPE CLASSIFICATION
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The sender_type field solves a key problem: newsletters appearing as contacts.
 *
 * - sender_type: HOW does this person communicate? (one-to-one vs one-to-many)
 * - relationship_type: WHO is this person? (only meaningful for 'direct' senders)
 *
 * Types:
 * - direct: Real person who knows you (colleague, client, friend)
 * - broadcast: Newsletter/marketing sender (Substack, company updates)
 * - cold_outreach: Unknown person reaching out (sales, recruiter, PR)
 * - opportunity: Mailing list with optional response (HARO, job boards)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import { ContactEnricherAnalyzer } from '@/services/analyzers/contact-enricher';
 *
 * // First check if contact needs enrichment
 * if (contactNeedsEnrichment(contact)) {
 *   const enricher = new ContactEnricherAnalyzer();
 *   const result = await enricher.analyze(email);
 *
 *   if (result.success && result.data.hasEnrichment) {
 *     await updateContact(contact.id, {
 *       company: result.data.company,
 *       job_title: result.data.jobTitle,
 *       relationship_type: result.data.relationshipType,
 *       sender_type: result.data.senderType,
 *       broadcast_subtype: result.data.broadcastSubtype,
 *       sender_type_confidence: result.data.senderTypeConfidence,
 *       extraction_confidence: result.data.confidence,
 *       last_extracted_at: new Date(),
 *     });
 *   }
 * }
 * ```
 *
 * @module services/analyzers/contact-enricher
 * @version 2.0.0
 * @since January 2026 (v2: Added sender type classification)
 */

import { BaseAnalyzer } from './base-analyzer';
import { analyzerConfig } from '@/config/analyzers';
import type { FunctionSchema } from '@/lib/ai/openai-client';
import type {
  ContactEnrichmentData,
  ContactEnrichmentResult,
  ContactRelationshipType,
  SenderType,
  BroadcastSubtype,
  EmailInput,
  UserContext,
} from './types';
import { RELATIONSHIP_TYPES, SENDER_TYPES, BROADCAST_SUBTYPES } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Function name for OpenAI function calling.
 */
const FUNCTION_NAME = 'enrich_contact';

/**
 * Description of what the function does.
 */
const FUNCTION_DESCRIPTION =
  'Extracts contact information from email signature and content';

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * System prompt for contact enrichment.
 * Updated January 2026 to include sender type classification.
 */
const SYSTEM_PROMPT = `You are a contact information extraction specialist. Your job is to:
1. Extract professional details about the email sender from their signature and content
2. Classify the SENDER TYPE - whether this is a real contact or a newsletter/broadcast sender

═══════════════════════════════════════════════════════════════════════════════
SENDER TYPE CLASSIFICATION (CRITICAL)
═══════════════════════════════════════════════════════════════════════════════

Determine HOW this sender communicates - this is different from WHO they are.

SENDER TYPES:
- direct: Real person who knows the recipient personally
  • Signs of DIRECT contact:
    - References shared context, history, or mutual connections
    - Expects or invites a reply
    - Uses recipient's name naturally (not template like "Hi {{first_name}}")
    - Writes with personal tone, irregular timing
    - Email feels one-to-one, written specifically for recipient

- broadcast: Newsletter, marketing, or notification sender (one-to-many)
  • Signs of BROADCAST:
    - "View in browser" link present
    - Unsubscribe link in footer
    - Generic content not personalized to recipient
    - Regular cadence (weekly, daily newsletter)
    - Template merge tags visible or obvious
    - Copyright footer, privacy policy links
    - Sent via marketing platform (Mailchimp, Substack, etc.)
  • IMPORTANT: Even if sender name looks personal (e.g., "Sarah from Acme"),
    if newsletter signals are present, classify as BROADCAST.
  • broadcast_subtype options:
    - newsletter_author: Individual creator (Substack, personal blog)
    - company_newsletter: Company marketing/updates
    - digest_service: LinkedIn digest, GitHub notifications, aggregators
    - transactional: Receipts, confirmations, noreply@ addresses

- cold_outreach: Unknown person reaching out cold (targeted but no relationship)
  • Signs of COLD OUTREACH:
    - First contact, no prior relationship
    - Wants something (sale, partnership, hire, PR)
    - "I noticed you...", "I came across your...", "Quick question..."
    - Scheduling requests from strangers
    - Recruiter first contact, sales pitch

- opportunity: Mailing list where response is optional but possible
  • Signs of OPPORTUNITY LIST:
    - Sent to a group (HARO, community board, job list)
    - Could respond but not expected to
    - "Looking for sources...", "Call for submissions"
    - Journalist queries, RFPs

- unknown: Cannot determine from content (leave for behavioral signals)

═══════════════════════════════════════════════════════════════════════════════
FIELDS TO EXTRACT
═══════════════════════════════════════════════════════════════════════════════

1. COMPANY
   - Look in: Signature, email domain, email content
   - Examples: "Acme Corporation", "Google", "Self-employed"
   - Clean up: Remove "Inc.", "LLC", "Ltd" if present

2. JOB TITLE
   - Look in: Signature, email content
   - Examples: "Software Engineer", "CEO", "Marketing Manager"
   - Keep it concise, normalize titles when obvious

3. PHONE
   - Look in: Signature only
   - Format: Keep as-is, common formats acceptable
   - Examples: "(555) 123-4567", "+1 555-123-4567"

4. LINKEDIN URL
   - Look in: Signature only
   - Extract the full LinkedIn profile URL
   - Examples: "https://linkedin.com/in/johnsmith"

5. RELATIONSHIP TYPE (only meaningful for sender_type="direct")
   - Infer from: Email tone, content, context
   - Types:
     - client: They are paying or might pay for services
     - colleague: Same company or close collaborator
     - vendor: They provide services to the recipient
     - friend: Personal, casual relationship
     - family: Family member
     - recruiter: Job recruiter or hiring manager
     - service: Service provider (bank, utility, support)
     - networking: Professional contact, potential opportunity
     - unknown: Cannot determine
   - NOTE: For broadcast/cold_outreach senders, relationship_type should be "unknown"

6. BIRTHDAY (rare)
   - Only if explicitly mentioned in the email
   - Format: MM-DD (we may not know the year)
   - Example: "03-15" for March 15

7. WORK ANNIVERSARY (rare)
   - Only if mentioned in the email
   - Format: YYYY-MM-DD or MM-DD

═══════════════════════════════════════════════════════════════════════════════
SIGNATURE DETECTION
═══════════════════════════════════════════════════════════════════════════════

Email signatures typically:
- Appear at the end of the email
- Start with "Best", "Thanks", "Regards", "Cheers", or similar
- Contain name, title, company on separate lines
- May include social links, phone, address

Example signature patterns:
---
John Smith
Senior Developer | Acme Corp
(555) 123-4567
linkedin.com/in/johnsmith
---

═══════════════════════════════════════════════════════════════════════════════
SOURCE TRACKING
═══════════════════════════════════════════════════════════════════════════════

Track where you found the information:
- "signature": Found in email signature block
- "email_body": Inferred from email content/context
- "both": Found in both signature and body

═══════════════════════════════════════════════════════════════════════════════
CONFIDENCE GUIDELINES
═══════════════════════════════════════════════════════════════════════════════

For enrichment data:
- 0.9+: Clear signature with explicit info
- 0.7-0.9: Signature present but some inference needed
- 0.5-0.7: No signature, inferred from context
- <0.5: Highly uncertain, mostly guessing

For sender_type:
- 0.9+: Multiple clear signals (unsubscribe + view in browser + generic content)
- 0.7-0.9: Strong signals present (unsubscribe link OR clearly personal tone)
- 0.5-0.7: Some signals but ambiguous
- <0.5: Cannot determine reliably

Be conservative - only extract what you're reasonably confident about.
Leave fields empty rather than guessing wrong.`;

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTION SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * OpenAI function schema for structured output.
 * Updated January 2026 to include sender type classification.
 */
const FUNCTION_SCHEMA: FunctionSchema = {
  name: FUNCTION_NAME,
  description: FUNCTION_DESCRIPTION,
  parameters: {
    type: 'object',
    properties: {
      // Whether any enrichment data was found
      has_enrichment: {
        type: 'boolean',
        description: 'Whether any useful contact information was extracted',
      },

      // Company name
      company: {
        type: 'string',
        description: 'Company or organization name',
      },

      // Job title
      job_title: {
        type: 'string',
        description: 'Job title or role',
      },

      // Phone number
      phone: {
        type: 'string',
        description: 'Phone number if found in signature',
      },

      // LinkedIn URL
      linkedin_url: {
        type: 'string',
        description: 'LinkedIn profile URL',
      },

      // Relationship type
      relationship_type: {
        type: 'string',
        enum: RELATIONSHIP_TYPES as unknown as string[],
        description: 'Inferred relationship type (only meaningful for direct sender_type)',
      },

      // Birthday
      birthday: {
        type: 'string',
        description: 'Birthday if mentioned (MM-DD format)',
      },

      // Work anniversary
      work_anniversary: {
        type: 'string',
        description: 'Work anniversary date if mentioned',
      },

      // Source of extraction
      source: {
        type: 'string',
        enum: ['signature', 'email_body', 'both'],
        description: 'Where the information was found',
      },

      // Confidence in enrichment data
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Confidence in the extracted information (0-1)',
      },

      // ═══════════════════════════════════════════════════════════════════════
      // SENDER TYPE CLASSIFICATION (NEW Jan 2026)
      // ═══════════════════════════════════════════════════════════════════════

      // Sender type classification
      sender_type: {
        type: 'string',
        enum: SENDER_TYPES as unknown as string[],
        description: 'How this sender communicates: direct (real contact), broadcast (newsletter/marketing), cold_outreach (unsolicited but targeted), opportunity (mailing list with optional response), unknown',
      },

      // Broadcast subtype (only when sender_type is broadcast)
      broadcast_subtype: {
        type: 'string',
        enum: BROADCAST_SUBTYPES as unknown as string[],
        description: 'For broadcast senders: newsletter_author, company_newsletter, digest_service, transactional',
      },

      // Confidence in sender type classification
      sender_type_confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Confidence in the sender_type classification (0-1)',
      },

      // Reasoning for sender type
      sender_type_reasoning: {
        type: 'string',
        description: 'Brief explanation of why this sender_type was chosen (e.g., "Has unsubscribe link and generic content")',
      },
    },
    required: ['has_enrichment', 'source', 'confidence', 'sender_type', 'sender_type_confidence'],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// CONTACT ENRICHER ANALYZER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Contact Enricher Analyzer
 *
 * Extracts contact metadata from email signatures and content.
 * This analyzer runs SELECTIVELY to save tokens.
 *
 * Features:
 * - Detects email signatures
 * - Extracts company, title, phone, LinkedIn
 * - Infers relationship type from context
 * - Captures birthdays and anniversaries if mentioned
 *
 * @example
 * ```typescript
 * const enricher = new ContactEnricherAnalyzer();
 *
 * // Check enrichment criteria first!
 * if (shouldEnrichContact(contact)) {
 *   const result = await enricher.analyze(email);
 *   if (result.data.hasEnrichment) {
 *     await updateContact(contact.id, result.data);
 *   }
 * }
 * ```
 */
export class ContactEnricherAnalyzer extends BaseAnalyzer<ContactEnrichmentData> {
  /**
   * Creates a new ContactEnricherAnalyzer instance.
   */
  constructor() {
    super('ContactEnricher', analyzerConfig.contactEnricher);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ABSTRACT METHOD IMPLEMENTATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Analyzes an email and extracts contact information.
   *
   * NOTE: This analyzer should only be called when the contact needs enrichment.
   * The calling code should check enrichment criteria before calling.
   *
   * @param email - Email data to analyze
   * @param context - User context (not heavily used)
   * @returns Contact enrichment result
   */
  async analyze(
    email: EmailInput,
    context?: UserContext
  ): Promise<ContactEnrichmentResult> {
    void context;

    this.logger.debug('Enriching contact from email', {
      emailId: email.id,
      senderEmail: email.senderEmail,
    });

    // Use the base class executeAnalysis which handles all common logic
    const result = await this.executeAnalysis(email);

    // Post-process to normalize the response format
    if (result.success) {
      result.data = this.normalizeResponse(result.data);
    }

    return result;
  }

  /**
   * Returns the OpenAI function schema for contact enrichment.
   */
  getFunctionSchema(): FunctionSchema {
    return FUNCTION_SCHEMA;
  }

  /**
   * Returns the system prompt for contact enrichment.
   */
  getSystemPrompt(context?: UserContext): string {
    void context;
    return SYSTEM_PROMPT;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Normalizes the OpenAI response to match our TypeScript interface.
   * Updated January 2026 to include sender type fields.
   */
  private normalizeResponse(rawData: Record<string, unknown>): ContactEnrichmentData {
    // Extract sender type data
    const senderType = rawData.sender_type as SenderType | undefined;
    const broadcastSubtype = rawData.broadcast_subtype as BroadcastSubtype | undefined;

    // Log sender type detection for debugging
    this.logger.debug('Contact enrichment result', {
      hasEnrichment: Boolean(rawData.has_enrichment),
      senderType,
      broadcastSubtype,
      senderTypeConfidence: rawData.sender_type_confidence,
      senderTypeReasoning: rawData.sender_type_reasoning,
    });

    return {
      // Original enrichment fields
      hasEnrichment: Boolean(rawData.has_enrichment),
      company: rawData.company as string | undefined,
      jobTitle: rawData.job_title as string | undefined,
      phone: rawData.phone as string | undefined,
      linkedinUrl: rawData.linkedin_url as string | undefined,
      relationshipType: rawData.relationship_type as ContactRelationshipType | undefined,
      birthday: rawData.birthday as string | undefined,
      workAnniversary: rawData.work_anniversary as string | undefined,
      source: (rawData.source as 'signature' | 'email_body' | 'both') || 'email_body',
      confidence: (rawData.confidence as number) || 0.5,

      // Sender type classification (NEW Jan 2026)
      senderType: senderType || 'unknown',
      broadcastSubtype: senderType === 'broadcast' ? broadcastSubtype : undefined,
      senderTypeConfidence: (rawData.sender_type_confidence as number) || 0.5,
      senderTypeReasoning: rawData.sender_type_reasoning as string | undefined,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Determines if a contact needs enrichment based on criteria.
 *
 * Use this before calling the ContactEnricherAnalyzer to save tokens.
 *
 * @param contact - Contact to check
 * @returns Whether the contact should be enriched
 *
 * @example
 * ```typescript
 * const contact = await getContact(email.senderEmail);
 *
 * if (shouldEnrichContact(contact)) {
 *   const result = await contactEnricher.analyze(email);
 *   // ... update contact
 * }
 * ```
 */
export function shouldEnrichContact(contact: {
  email_count?: number;
  extraction_confidence?: number | null;
  last_extracted_at?: string | null;
}): boolean {
  // Require minimum email count (worth the token cost)
  if (!contact.email_count || contact.email_count < 3) {
    return false;
  }

  // Never enriched
  if (contact.extraction_confidence === null || contact.extraction_confidence === undefined) {
    return true;
  }

  // Low confidence enrichment
  if (contact.extraction_confidence < 0.5) {
    return true;
  }

  // Stale enrichment (> 30 days)
  if (contact.last_extracted_at) {
    const lastExtracted = new Date(contact.last_extracted_at);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    if (lastExtracted < thirtyDaysAgo) {
      return true;
    }
  }

  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default contact enricher instance for convenience.
 *
 * @example
 * ```typescript
 * import { contactEnricher, shouldEnrichContact } from '@/services/analyzers/contact-enricher';
 *
 * if (shouldEnrichContact(contact)) {
 *   const result = await contactEnricher.analyze(email);
 *   console.log(`Company: ${result.data.company}`);
 * }
 * ```
 */
export const contactEnricher = new ContactEnricherAnalyzer();
