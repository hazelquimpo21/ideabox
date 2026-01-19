/**
 * Contact Enricher Analyzer
 *
 * Extracts contact metadata from email signatures and content.
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
 * - company: Company name from signature or email context
 * - jobTitle: Job title or role
 * - phone: Phone number from signature
 * - linkedinUrl: LinkedIn profile URL
 * - relationshipType: client, colleague, vendor, friend, family, etc.
 * - birthday: Birthday if mentioned (MM-DD format)
 * - workAnniversary: Work anniversary date
 * - source: Where the data came from (signature, email_body, both)
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
 *       extraction_confidence: result.data.confidence,
 *       last_extracted_at: new Date(),
 *     });
 *   }
 * }
 * ```
 *
 * @module services/analyzers/contact-enricher
 * @version 1.0.0
 * @since January 2026
 */

import { BaseAnalyzer } from './base-analyzer';
import { analyzerConfig } from '@/config/analyzers';
import type { FunctionSchema } from '@/lib/ai/openai-client';
import type {
  ContactEnrichmentData,
  ContactEnrichmentResult,
  ContactRelationshipType,
  EmailInput,
  UserContext,
} from './types';
import { RELATIONSHIP_TYPES } from './types';

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
 */
const SYSTEM_PROMPT = `You are a contact information extraction specialist. Your job is to extract professional details about the email sender from their email signature and email content.

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

5. RELATIONSHIP TYPE
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

- 0.9+: Clear signature with explicit info
- 0.7-0.9: Signature present but some inference needed
- 0.5-0.7: No signature, inferred from context
- <0.5: Highly uncertain, mostly guessing

Be conservative - only extract what you're reasonably confident about.
Leave fields empty rather than guessing wrong.`;

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTION SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * OpenAI function schema for structured output.
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
        description: 'Inferred relationship type',
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

      // Confidence
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Confidence in the extracted information (0-1)',
      },
    },
    required: ['has_enrichment', 'source', 'confidence'],
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
   */
  private normalizeResponse(rawData: Record<string, unknown>): ContactEnrichmentData {
    return {
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
