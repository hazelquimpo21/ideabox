/**
 * Profile Analyzer — AI-Powered Profile Extraction from Sent Emails
 *
 * Analyzes a batch of the user's recently sent emails + contacts to extract
 * professional profile data (role, company, industry, projects, priorities).
 *
 * This is NOT a BaseAnalyzer subclass (those operate on individual emails).
 * This is a standalone service that makes ONE AI call with a batch of ~10-20
 * sent email summaries for efficient profile extraction.
 *
 * HOW IT WORKS:
 * 1. Takes pre-formatted sent email summaries (subjects, snippets, signatures)
 * 2. Takes contact summaries (top contacts with metadata)
 * 3. Feeds everything to GPT-4.1-mini in a single function-calling request
 * 4. Extracts role, company, industry, projects, and priorities
 *
 * KEY DESIGN DECISIONS:
 * - Snippets only, not full bodies — saves tokens, <2000 token input budget
 * - Signature area (last 500 chars) extracted separately for role/company
 * - One AI call for the entire batch — fast (<3s) and cost-efficient (<$0.01)
 * - Confidence scores on every field for UI to show "AI suggested" indicators
 *
 * @module services/onboarding/profile-analyzer
 */

import { analyzeWithFunction, type FunctionSchema } from '@/lib/ai/openai-client';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('ProfileAnalyzer');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Input data for profile analysis.
 * Pre-formatted by the API route before calling this service.
 */
export interface ProfileAnalysisInput {
  /** User's UUID */
  userId: string;
  /** Pre-formatted summaries of the user's recent sent emails */
  sentEmails: SentEmailSummary[];
  /** Top contacts with metadata (from contact-service) */
  contacts: ContactSummaryForProfile[];
  /** User's own email addresses (so AI knows which sender is "the user") */
  accountEmails: string[];
}

/**
 * Summary of a sent email for profile analysis.
 * Only includes fields relevant to profile extraction — not full body.
 */
export interface SentEmailSummary {
  /** Email subject line */
  subject: string;
  /** Recipient email address */
  recipientEmail: string;
  /** Recipient display name */
  recipientName: string | null;
  /** Email send date (ISO 8601) */
  date: string;
  /** Gmail snippet (short preview, ~100 chars) */
  snippet: string;
  /** Last 500 chars of body — the signature area */
  bodySignature?: string;
}

/**
 * Contact summary formatted for profile analysis.
 * Subset of contact data relevant to understanding the user's professional context.
 */
export interface ContactSummaryForProfile {
  /** Contact email address */
  email: string;
  /** Contact name */
  name: string | null;
  /** Total email count with this contact */
  emailCount: number;
  /** Whether marked as VIP */
  isVip: boolean;
  /** Whether starred in Google Contacts */
  isGoogleStarred: boolean;
  /** Company from contact enrichment */
  company: string | null;
  /** Detected relationship type */
  relationshipType: string | null;
}

/**
 * Raw AI response from the extract_user_profile function call.
 * This is the shape GPT returns; we map it to ProfileSuggestions in the route.
 */
export interface AIProfileExtractionResult {
  /** Detected role/title */
  role: { value: string; confidence: number; source: string } | null;
  /** Detected company */
  company: { value: string; confidence: number; source: string } | null;
  /** Detected industry */
  industry: { value: string; confidence: number; source: string } | null;
  /** Key projects extracted from email patterns */
  projects: Array<{ name: string; confidence: number; mentionCount: number }>;
  /** Suggested priorities based on email themes */
  priorities: Array<{ label: string; confidence: number }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTION SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * OpenAI function schema for structured profile extraction.
 *
 * Uses function calling to get deterministic JSON output in the shape
 * of AIProfileExtractionResult.
 */
const EXTRACT_PROFILE_SCHEMA: FunctionSchema = {
  name: 'extract_user_profile',
  description:
    'Extract professional profile information from a batch of the user\'s sent emails and contacts. Returns role, company, industry, projects, and priorities with confidence scores.',
  parameters: {
    type: 'object',
    properties: {
      role: {
        type: ['object', 'null'],
        description: 'Detected role/title (e.g., "Freelance Designer", "Product Manager"). Null if not detectable.',
        properties: {
          value: { type: 'string', description: 'The role/title string' },
          confidence: { type: 'number', description: 'Confidence 0.0-1.0. 1.0 = found in signature, 0.5 = inferred from context' },
          source: { type: 'string', description: 'Where this was found: "email_signature", "email_content", "inferred"' },
        },
        required: ['value', 'confidence', 'source'],
      },
      company: {
        type: ['object', 'null'],
        description: 'Detected company (e.g., "Acme Corp", "Self-employed"). Null if not detectable.',
        properties: {
          value: { type: 'string', description: 'The company name. "Self-employed" or "Freelancer" if no company evident.' },
          confidence: { type: 'number', description: 'Confidence 0.0-1.0' },
          source: { type: 'string', description: 'Where this was found: "email_signature", "email_domain", "inferred"' },
        },
        required: ['value', 'confidence', 'source'],
      },
      industry: {
        type: ['object', 'null'],
        description: 'Detected industry (e.g., "Technology", "Marketing", "Education"). Null if not detectable.',
        properties: {
          value: { type: 'string', description: 'The industry name' },
          confidence: { type: 'number', description: 'Confidence 0.0-1.0' },
          source: { type: 'string', description: 'How this was determined: "company_name", "email_content", "recipient_domains", "inferred"' },
        },
        required: ['value', 'confidence', 'source'],
      },
      projects: {
        type: 'array',
        description: 'Key projects extracted from email subjects and content. Only return items mentioned 2+ times.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Project name' },
            confidence: { type: 'number', description: 'Confidence 0.0-1.0' },
            mentionCount: { type: 'integer', description: 'Number of times this project was mentioned' },
          },
          required: ['name', 'confidence', 'mentionCount'],
        },
      },
      priorities: {
        type: 'array',
        description: 'Suggested priorities based on email patterns. Return 2-4 high-level themes (e.g., "Client acquisition", "Project delivery").',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Priority label (e.g., "Client acquisition", "Team management")' },
            confidence: { type: 'number', description: 'Confidence 0.0-1.0' },
          },
          required: ['label', 'confidence'],
        },
      },
    },
    required: ['role', 'company', 'industry', 'projects', 'priorities'],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Builds the system prompt for profile extraction.
 * Includes the user's email addresses so the AI knows which sender is "the user".
 */
function buildSystemPrompt(accountEmails: string[]): string {
  return `You are a professional profile detective. Given a set of recently sent emails from a user, extract their likely professional profile.

ABOUT THE USER:
- Their email addresses: ${accountEmails.join(', ')}
- They are likely a solopreneur or small business owner
- They may have multiple roles (day job + side business)

WHAT TO EXTRACT:
1. Role/Title: Look at email signatures, how they introduce themselves, how others address them
2. Company: Look at email domain, signature, letterhead references
3. Industry: Infer from company, email content, recipient types
4. Projects: Recurring project names, client references, deliverable mentions
5. Priorities: What themes dominate their recent email activity

RULES:
- If you find a clear email signature, prioritize that for role and company
- "Self-employed" or "Freelancer" is a valid company if no company is evident
- For solopreneurs, the "company" might be their own name or brand
- Return confidence 0.0-1.0 for each field (1.0 = found in signature, 0.5 = inferred)
- For projects, only return items mentioned 2+ times
- For priorities, suggest 2-4 high-level themes (e.g., "Client acquisition", "Project delivery")
- Priorities should be relevant to solopreneurs: "landing new clients", "invoicing", "project deadlines"
- If you can't determine something, return null — don't guess
- Never fabricate information that isn't supported by the email data`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Analyzes a batch of sent emails and contacts to extract profile data.
 *
 * Makes ONE AI call with all email summaries for efficient processing.
 * Target: <3 seconds, <5000 tokens, <$0.01 cost.
 *
 * @param input - Pre-formatted email summaries, contacts, and account emails
 * @returns AI extraction result with role, company, industry, projects, priorities
 *          plus token usage metadata for cost tracking
 *
 * @example
 * ```typescript
 * const result = await analyzeProfileFromEmails({
 *   userId: user.id,
 *   sentEmails: formattedEmails,
 *   contacts: topContacts,
 *   accountEmails: ['user@gmail.com', 'user@work.com'],
 * });
 *
 * console.log(result.data.role); // { value: "Freelance Designer", confidence: 0.9, source: "email_signature" }
 * console.log(result.tokensTotal); // 1847
 * ```
 */
export async function analyzeProfileFromEmails(input: ProfileAnalysisInput): Promise<{
  data: AIProfileExtractionResult;
  tokensInput: number;
  tokensOutput: number;
  tokensTotal: number;
  estimatedCost: number;
  durationMs: number;
}> {
  const { userId, sentEmails, contacts, accountEmails } = input;

  logger.start('Analyzing profile from sent emails', {
    userId: userId.substring(0, 8),
    emailCount: sentEmails.length,
    contactCount: contacts.length,
    accountCount: accountEmails.length,
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Build user content: email summaries + contact list
  // Keep it compact to stay within ~2000 token input budget
  // ─────────────────────────────────────────────────────────────────────────────
  const userContent = buildUserContent(sentEmails, contacts);

  logger.debug('Built user content for AI', {
    contentLength: userContent.length,
    userId: userId.substring(0, 8),
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Make the AI call via analyzeWithFunction
  // Uses function calling for structured JSON output
  // ─────────────────────────────────────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(accountEmails);

  const result = await analyzeWithFunction<AIProfileExtractionResult>(
    systemPrompt,
    userContent,
    EXTRACT_PROFILE_SCHEMA,
    {
      model: 'gpt-4.1-mini',
      temperature: 0.3,   // Low for consistent extraction
      maxTokens: 800,     // Enough for full profile with projects + priorities
    }
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Validate and clean the AI response
  // ─────────────────────────────────────────────────────────────────────────────
  const cleanedData = validateAndCleanResult(result.data);

  logger.success('Profile analysis complete', {
    userId: userId.substring(0, 8),
    hasRole: !!cleanedData.role,
    hasCompany: !!cleanedData.company,
    hasIndustry: !!cleanedData.industry,
    projectCount: cleanedData.projects.length,
    priorityCount: cleanedData.priorities.length,
    tokensTotal: result.tokensTotal,
    estimatedCost: result.estimatedCost,
    durationMs: result.durationMs,
  });

  return {
    data: cleanedData,
    tokensInput: result.tokensInput,
    tokensOutput: result.tokensOutput,
    tokensTotal: result.tokensTotal,
    estimatedCost: result.estimatedCost,
    durationMs: result.durationMs,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Builds the user content string from email summaries and contacts.
 *
 * Format is designed to be token-efficient while giving the AI enough
 * context to extract meaningful profile data. Signature areas are
 * highlighted since they're the most reliable source for role/company.
 */
function buildUserContent(
  sentEmails: SentEmailSummary[],
  contacts: ContactSummaryForProfile[]
): string {
  const parts: string[] = [];

  // ── Sent emails section ──
  parts.push('=== RECENT SENT EMAILS ===');
  for (const email of sentEmails) {
    const recipientInfo = email.recipientName
      ? `${email.recipientName} <${email.recipientEmail}>`
      : email.recipientEmail;

    parts.push(`To: ${recipientInfo}`);
    parts.push(`Subject: ${email.subject}`);
    parts.push(`Date: ${email.date}`);
    if (email.snippet) {
      parts.push(`Preview: ${email.snippet}`);
    }
    if (email.bodySignature) {
      parts.push(`Signature area: ${email.bodySignature}`);
    }
    parts.push('---');
  }

  // ── Contacts section ──
  if (contacts.length > 0) {
    parts.push('');
    parts.push('=== TOP CONTACTS ===');
    for (const contact of contacts) {
      const flags: string[] = [];
      if (contact.isVip) flags.push('VIP');
      if (contact.isGoogleStarred) flags.push('Starred');
      if (contact.relationshipType) flags.push(contact.relationshipType);

      const contactLine = [
        contact.name ? `${contact.name} <${contact.email}>` : contact.email,
        `(${contact.emailCount} emails)`,
        contact.company ? `Company: ${contact.company}` : null,
        flags.length > 0 ? `[${flags.join(', ')}]` : null,
      ]
        .filter(Boolean)
        .join(' ');

      parts.push(contactLine);
    }
  }

  return parts.join('\n');
}

/**
 * Validates and cleans the AI response to filter out garbage.
 *
 * Handles edge cases:
 * - Removes fields with confidence 0
 * - Filters out role/company values that are clearly wrong (e.g., "null", "N/A")
 * - Ensures projects have mentionCount >= 2
 * - Caps priorities at 4 items
 */
function validateAndCleanResult(
  raw: AIProfileExtractionResult
): AIProfileExtractionResult {
  const invalidValues = new Set([
    'null', 'n/a', 'unknown', 'none', 'undefined', '',
  ]);

  // Clean role
  let role = raw.role;
  if (role && (role.confidence <= 0 || invalidValues.has(role.value.toLowerCase().trim()))) {
    logger.debug('Filtered out invalid role', { value: role.value, confidence: role.confidence });
    role = null;
  }

  // Clean company
  let company = raw.company;
  if (company && (company.confidence <= 0 || invalidValues.has(company.value.toLowerCase().trim()))) {
    logger.debug('Filtered out invalid company', { value: company.value, confidence: company.confidence });
    company = null;
  }

  // Clean industry
  let industry = raw.industry;
  if (industry && (industry.confidence <= 0 || invalidValues.has(industry.value.toLowerCase().trim()))) {
    logger.debug('Filtered out invalid industry', { value: industry.value, confidence: industry.confidence });
    industry = null;
  }

  // Filter projects: only keep those with mentionCount >= 2 and confidence > 0
  const projects = (raw.projects ?? []).filter(
    (p) => p.mentionCount >= 2 && p.confidence > 0 && !invalidValues.has(p.name.toLowerCase().trim())
  );

  // Filter priorities: keep those with confidence > 0, cap at 4
  const priorities = (raw.priorities ?? [])
    .filter((p) => p.confidence > 0 && !invalidValues.has(p.label.toLowerCase().trim()))
    .slice(0, 4);

  return { role, company, industry, projects, priorities };
}
