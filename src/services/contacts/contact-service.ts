/**
 * Contact Service
 *
 * Centralized service for all contact-related operations. This service consolidates
 * contact management including:
 * - Creating and updating contacts from emails
 * - Importing contacts from Google People API
 * - Finding contacts by email (with alias support)
 * - Getting VIP suggestions for onboarding
 * - Managing contact aliases across accounts
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CONTACT LIFECYCLE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * CREATION:
 * Contacts are created automatically from three sources:
 * 1. Email Processing: When emails are synced, sender contacts are auto-created
 * 2. Google Import: User imports contacts during onboarding or from settings
 * 3. Manual Entry: User adds a contact manually (future feature)
 *
 * LINKING TO EMAILS:
 * Every email is linked to a contact via the sender's email address.
 * This enables features like:
 * - Viewing all emails from a contact
 * - Contact-level insights (response time, communication patterns)
 * - VIP prioritization in inbox
 *
 * ENRICHMENT:
 * Contacts are enriched in two ways:
 * 1. Google Data: Avatar, labels, starred status from Google Contacts
 * 2. AI Analysis: Company, job title, relationship type from email signatures
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import { ContactService } from '@/services/contacts/contact-service';
 *
 * const contactService = new ContactService();
 *
 * // Upsert contact from email (called by email processor)
 * const contactId = await contactService.upsertFromEmail({
 *   userId,
 *   email: 'john@example.com',
 *   name: 'John Doe',
 *   emailDate: '2026-01-15T10:00:00Z',
 *   isSent: false,
 * });
 *
 * // Import contacts from Google (called during onboarding)
 * const imported = await contactService.importFromGoogle({
 *   userId,
 *   accessToken,
 *   accountId,
 *   maxContacts: 100,
 * });
 *
 * // Get VIP suggestions for onboarding
 * const suggestions = await contactService.getVipSuggestions(userId, 15);
 *
 * // Find contact by email (checks aliases too)
 * const contact = await contactService.findByEmail(userId, 'john@example.com');
 * ```
 *
 * @module services/contacts/contact-service
 * @version 1.0.0
 * @since January 2026
 */

import { createServerClient } from '@/lib/supabase/server';
import { createPeopleService, type GoogleContact } from '@/lib/google';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('ContactService');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parameters for upserting a contact from email data.
 */
export interface UpsertFromEmailParams {
  /** User ID who owns this contact */
  userId: string;
  /** Contact's email address */
  email: string;
  /** Contact's name (from email headers) */
  name: string | null;
  /** Date of the email (for first/last seen tracking) */
  emailDate: string;
  /** Whether this is a sent email (user → contact) vs received (contact → user) */
  isSent?: boolean;

  // ═══════════════════════════════════════════════════════════════════════════
  // SENDER TYPE CLASSIFICATION (NEW Jan 2026)
  // ═══════════════════════════════════════════════════════════════════════════

  /** Detected sender type: direct, broadcast, cold_outreach, opportunity */
  senderType?: string;
  /** Broadcast subtype if sender_type is broadcast */
  broadcastSubtype?: string;
  /** Confidence in sender type classification (0-1) */
  senderTypeConfidence?: number;
  /** How sender type was detected: header, email_pattern, ai_analysis, user_behavior */
  senderTypeSource?: string;
}

/**
 * Parameters for importing contacts from Google.
 */
export interface ImportFromGoogleParams {
  /** User ID */
  userId: string;
  /** OAuth access token with contacts.readonly scope */
  accessToken: string;
  /** Gmail account ID (for tracking which account synced) */
  accountId: string;
  /** Maximum contacts to import (default: 100) */
  maxContacts?: number;
  /** Whether to import starred contacts only */
  starredOnly?: boolean;
}

/**
 * Result of Google contacts import.
 */
export interface ImportResult {
  /** Number of contacts imported (created or updated) */
  imported: number;
  /** Number of contacts that were starred */
  starred: number;
  /** Number of contacts skipped (no email, etc.) */
  skipped: number;
  /** Errors encountered during import */
  errors: string[];
}

/**
 * VIP suggestion returned during onboarding.
 */
export interface VipSuggestion {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  emailCount: number;
  lastSeenAt: string | null;
  isGoogleStarred: boolean;
  googleLabels: string[];
  relationshipType: string | null;
  suggestionReason: string;
  /** Where this contact was imported from: 'google', 'email', or 'manual' */
  source: 'google' | 'email' | 'manual';
  /** Company name if known (from Google or email enrichment) */
  company: string | null;
  /** Job title if known */
  jobTitle: string | null;
}

/**
 * Contact lookup result (includes alias info).
 */
export interface ContactLookupResult {
  id: string;
  email: string;
  name: string | null;
  isAlias: boolean;
}

/**
 * Contact with basic info for list views.
 */
export interface ContactSummary {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  emailCount: number;
  sentCount: number;
  receivedCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  relationshipType: string | null;
  isVip: boolean;
  isGoogleStarred: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Builds a human-readable reason for why a contact is suggested as a VIP.
 * Combines Google starred status with email frequency for a tiered message.
 *
 * Priority order:
 * 1. Starred + high frequency  → "Starred + Frequent (N emails)"
 * 2. Starred + some emails     → "Starred in Google (N emails)"
 * 3. Starred + no emails       → "Starred in Google Contacts"
 * 4. High frequency (20+)      → "Frequent (N emails)"
 * 5. Medium frequency (10+)    → "Regular contact (N emails)"
 * 6. Low frequency (<10)       → "N emails"
 */
/**
 * Builds a human-readable suggestion reason from the top scoring signals.
 * Takes the scored reasons (sorted by weight) and returns a concise string.
 */
function buildSuggestionReason(isStarred: boolean, emailCount: number): string {
  if (isStarred && emailCount >= 20) {
    return `Starred + Frequent (${emailCount} emails)`;
  }
  if (isStarred && emailCount > 0) {
    return `Starred in Google (${emailCount} emails)`;
  }
  if (isStarred) {
    return 'Starred in Google Contacts';
  }
  if (emailCount >= 20) {
    return `Frequent (${emailCount} emails)`;
  }
  if (emailCount >= 10) {
    return `Regular contact (${emailCount} emails)`;
  }
  return `${emailCount} emails`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIP SUGGESTION SCORING
// ═══════════════════════════════════════════════════════════════════════════════

/** Google label groups that indicate relationship intent */
const FAMILY_LABELS = ['family', 'vip', 'important', 'close friends', 'inner circle'];
const WORK_LABELS = ['work', 'clients', 'business', 'colleagues', 'coworkers'];
const FRIEND_LABELS = ['friends', 'personal'];

/** A scored contact row with ranking metadata */
interface ScoredContact {
  row: Record<string, unknown>;
  score: number;
  reasons: string[];
}

/**
 * Scores a contact for VIP suggestion relevance using multiple signals:
 *
 * - Google starred / labels (explicit user intent)
 * - Same last name as user (family signal)
 * - Same email domain as user (coworker signal)
 * - Sent count (user initiates = they care)
 * - Bidirectional communication
 * - Email frequency
 * - Recency (last_seen_at)
 * - Longevity (first_seen_at — long-standing relationships)
 * - Relationship type (from AI enrichment)
 * - Sender type (penalizes newsletters/broadcasts)
 * - Avatar presence (real person signal)
 */
function scoreContact(
  row: Record<string, unknown>,
  userLastName: string | null,
  userEmailDomain: string | null,
): ScoredContact {
  let score = 0;
  const reasons: string[] = [];

  const isStarred = row.is_google_starred as boolean;
  const labels = ((row.google_labels as string[]) || []).map((l: string) => l.toLowerCase());
  const emailCount = (row.email_count as number) || 0;
  const sentCount = (row.sent_count as number) || 0;
  const receivedCount = (row.received_count as number) || 0;
  const contactName = row.name as string | null;
  const contactEmail = row.email as string;
  const lastSeenAt = row.last_seen_at as string | null;
  const firstSeenAt = row.first_seen_at as string | null;
  const relationshipType = row.relationship_type as string | null;
  const senderType = row.sender_type as string | null;
  const avatarUrl = row.avatar_url as string | null;

  // ── 1. Google starred (strongest explicit signal) ──────────────────────
  if (isStarred) {
    score += 50;
    reasons.push('Starred');
  }

  // ── 2. Google labels (intent signals) ──────────────────────────────────
  const matchedFamilyLabel = labels.find((l) => FAMILY_LABELS.includes(l));
  const matchedWorkLabel = labels.find((l) => WORK_LABELS.includes(l));
  const matchedFriendLabel = labels.find((l) => FRIEND_LABELS.includes(l));

  if (matchedFamilyLabel) {
    score += 40;
    const display = matchedFamilyLabel.charAt(0).toUpperCase() + matchedFamilyLabel.slice(1);
    reasons.push(`Google ${display}`);
  }
  if (matchedWorkLabel) {
    score += 30;
    const display = matchedWorkLabel.charAt(0).toUpperCase() + matchedWorkLabel.slice(1);
    reasons.push(`Google ${display}`);
  }
  if (matchedFriendLabel) {
    score += 20;
    reasons.push('Google Friends');
  }

  // ── 3. Same last name (family signal) ──────────────────────────────────
  if (userLastName && contactName) {
    const nameParts = contactName.trim().split(/\s+/);
    if (nameParts.length >= 2) {
      const contactLastName = nameParts[nameParts.length - 1].toLowerCase();
      if (contactLastName === userLastName.toLowerCase()) {
        score += 35;
        reasons.push('Possible family');
      }
    }
  }

  // ── 4. Same email domain (coworker signal) ────────────────────────────
  if (userEmailDomain && contactEmail) {
    const contactDomain = contactEmail.split('@')[1]?.toLowerCase();
    // Skip generic domains — only match on org-specific ones
    const genericDomains = new Set([
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
      'aol.com', 'protonmail.com', 'mail.com', 'live.com', 'me.com',
    ]);
    if (contactDomain && contactDomain === userEmailDomain && !genericDomains.has(contactDomain)) {
      score += 25;
      reasons.push('Same organization');
    }
  }

  // ── 5. User sends to this contact (strongest behavioral signal) ───────
  if (sentCount >= 10) {
    score += 25;
    reasons.push('You email often');
  } else if (sentCount >= 3) {
    score += 15;
    reasons.push("You've emailed");
  }

  // ── 6. Bidirectional communication ─────────────────────────────────────
  if (sentCount > 0 && receivedCount > 0) {
    score += 10;
    // No separate reason — implied by other signals
  }

  // ── 7. Email frequency ─────────────────────────────────────────────────
  if (emailCount >= 20) {
    score += 20;
    if (!reasons.some((r) => r.includes('email'))) {
      reasons.push(`Frequent (${emailCount} emails)`);
    }
  } else if (emailCount >= 5) {
    score += 10;
    if (!reasons.some((r) => r.includes('email'))) {
      reasons.push(`${emailCount} emails`);
    }
  }

  // ── 8. Recency bonus ──────────────────────────────────────────────────
  if (lastSeenAt) {
    const daysSince = (Date.now() - new Date(lastSeenAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 7) {
      score += 15;
      reasons.push('Active this week');
    } else if (daysSince < 30) {
      score += 10;
      reasons.push('Active this month');
    } else if (daysSince < 90) {
      score += 5;
    }
  }

  // ── 9. Longevity (long-standing relationships) ────────────────────────
  if (firstSeenAt) {
    const daysKnown = (Date.now() - new Date(firstSeenAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysKnown > 365) {
      score += 10;
      reasons.push('Known 1+ year');
    } else if (daysKnown > 90) {
      score += 5;
      reasons.push('Known 3+ months');
    }
  }

  // ── 10. Relationship type (from AI enrichment) ────────────────────────
  if (relationshipType === 'family') {
    score += 25;
    if (!reasons.includes('Possible family')) reasons.push('Family');
  } else if (relationshipType === 'client') {
    score += 20;
    reasons.push('Client');
  } else if (relationshipType === 'friend') {
    score += 15;
  } else if (relationshipType === 'colleague') {
    score += 10;
  }

  // ── 11. Sender type penalty (filter out newsletters) ──────────────────
  if (senderType === 'broadcast') {
    score -= 30;
  } else if (senderType === 'cold_outreach') {
    score -= 20;
  }

  // ── 12. Avatar presence (real person signal) ──────────────────────────
  if (avatarUrl) {
    score += 3;
  }

  return { row, score, reasons };
}

/** Batch size for chunked contact upserts during Google import. */
const IMPORT_BATCH_SIZE = 50;

// ═══════════════════════════════════════════════════════════════════════════════
// CONTACT SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Contact Service
 *
 * Centralized service for managing contacts. Handles contact creation from
 * multiple sources (email, Google, manual), contact lookup with alias support,
 * and VIP suggestions for onboarding.
 *
 * @example
 * ```typescript
 * const service = new ContactService();
 *
 * // During email processing
 * await service.upsertFromEmail({
 *   userId,
 *   email: sender.email,
 *   name: sender.name,
 *   emailDate: email.date,
 * });
 *
 * // During onboarding
 * const suggestions = await service.getVipSuggestions(userId);
 * ```
 */
export class ContactService {
  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC METHODS - EMAIL INTEGRATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Upserts a contact from email data.
   *
   * This is the primary method called by the email processor when processing
   * emails. It creates a new contact or updates an existing one based on
   * the email address.
   *
   * WHAT IT DOES:
   * - Creates contact if it doesn't exist
   * - Increments email count (sent or received)
   * - Updates first_seen_at / last_seen_at timestamps
   * - Preserves Google-imported data (avatar, labels)
   *
   * @param params - Email and contact data
   * @returns Contact ID (UUID) or null if upsert failed
   *
   * @example
   * ```typescript
   * // Called by email processor for each email
   * const contactId = await contactService.upsertFromEmail({
   *   userId: user.id,
   *   email: email.senderEmail,
   *   name: email.senderName,
   *   emailDate: email.date,
   *   isSent: false, // received email
   * });
   *
   * if (contactId) {
   *   // Contact is now linked to this email
   *   logger.debug('Email linked to contact', { emailId, contactId });
   * }
   * ```
   */
  async upsertFromEmail(params: UpsertFromEmailParams): Promise<string | null> {
    const {
      userId,
      email,
      name,
      emailDate,
      isSent = false,
      senderType,
      broadcastSubtype,
      senderTypeConfidence,
      senderTypeSource,
    } = params;

    // ─────────────────────────────────────────────────────────────────────────
    // Input validation
    // ─────────────────────────────────────────────────────────────────────────
    if (!email || !email.includes('@')) {
      logger.debug('Skipping contact upsert: invalid email', {
        email: email?.substring(0, 30),
      });
      return null;
    }

    const normalizedEmail = email.toLowerCase().trim();

    logger.debug('Upserting contact from email', {
      userId: userId.substring(0, 8),
      email: normalizedEmail.substring(0, 30),
      hasName: !!name,
      isSent,
      senderType: senderType ?? 'not_provided',
      senderTypeConfidence: senderTypeConfidence ?? 'not_provided',
    });

    try {
      const supabase = await createServerClient();

      // ─────────────────────────────────────────────────────────────────────────
      // Call the database function for atomic upsert
      // This function handles all the logic for incrementing counts,
      // managing timestamps atomically, and sender type classification
      // ─────────────────────────────────────────────────────────────────────────
      const { data, error } = await supabase.rpc('upsert_contact_from_email', {
        p_user_id: userId,
        p_email: normalizedEmail,
        p_name: name ?? null,
        p_email_date: emailDate,
        p_is_sent: isSent,
        // Sender type classification (NEW Jan 2026)
        // The DB function will handle these even if the columns don't exist yet
        p_sender_type: senderType ?? null,
        p_sender_type_confidence: senderTypeConfidence ?? null,
        p_sender_type_source: senderTypeSource ?? null,
      });

      if (error) {
        // Check if error is due to missing parameters (old function signature)
        // In that case, retry without sender type params
        if (error.message.includes('p_sender_type') || error.code === '42883') {
          logger.debug('Retrying upsert without sender_type params (old DB function)', {
            email: normalizedEmail.substring(0, 30),
          });

          const { data: fallbackData, error: fallbackError } = await supabase.rpc('upsert_contact_from_email', {
            p_user_id: userId,
            p_email: normalizedEmail,
            p_name: name ?? null,
            p_email_date: emailDate,
            p_is_sent: isSent,
          });

          if (fallbackError) {
            logger.error('Failed to upsert contact from email (fallback)', {
              email: normalizedEmail.substring(0, 30),
              errorCode: fallbackError.code,
              errorMessage: fallbackError.message,
            });
            return null;
          }

          logger.debug('Contact upserted successfully (without sender_type)', {
            contactId: fallbackData,
            email: normalizedEmail.substring(0, 30),
          });

          return fallbackData as string;
        }

        logger.error('Failed to upsert contact from email', {
          email: normalizedEmail.substring(0, 30),
          errorCode: error.code,
          errorMessage: error.message,
        });
        return null;
      }

      logger.debug('Contact upserted successfully', {
        contactId: data,
        email: normalizedEmail.substring(0, 30),
        senderType: senderType ?? 'not_classified',
      });

      return data as string;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Unexpected error upserting contact', {
        email: normalizedEmail.substring(0, 30),
        error: message,
      });
      return null;
    }
  }

  /**
   * Finds a contact by email address.
   *
   * This method checks both primary email addresses and contact aliases.
   * Use this when linking emails to contacts to ensure you catch aliases.
   *
   * @param userId - User ID
   * @param email - Email address to search
   * @returns Contact lookup result or null if not found
   *
   * @example
   * ```typescript
   * // When processing an email, find the associated contact
   * const contact = await contactService.findByEmail(userId, senderEmail);
   *
   * if (contact) {
   *   console.log(`Found contact: ${contact.name}`);
   *   if (contact.isAlias) {
   *     console.log('(via alias)');
   *   }
   * }
   * ```
   */
  async findByEmail(userId: string, email: string): Promise<ContactLookupResult | null> {
    const normalizedEmail = email.toLowerCase().trim();

    logger.debug('Finding contact by email', {
      userId: userId.substring(0, 8),
      email: normalizedEmail.substring(0, 30),
    });

    try {
      const supabase = await createServerClient();

      // Use the database function that checks both primary and alias emails
      const { data, error } = await supabase.rpc('find_contact_by_email', {
        p_user_id: userId,
        p_email: normalizedEmail,
      });

      if (error) {
        logger.error('Error finding contact by email', {
          email: normalizedEmail.substring(0, 30),
          error: error.message,
        });
        return null;
      }

      if (!data || data.length === 0) {
        logger.debug('No contact found for email', {
          email: normalizedEmail.substring(0, 30),
        });
        return null;
      }

      const result = data[0];
      return {
        id: result.id,
        email: result.email,
        name: result.name,
        isAlias: result.is_alias,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Unexpected error finding contact', {
        email: normalizedEmail.substring(0, 30),
        error: message,
      });
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC METHODS - GOOGLE CONTACTS IMPORT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Imports contacts from Google People API.
   *
   * This method is called during onboarding to import the user's Google
   * contacts for a better first-run experience. It creates or updates
   * contacts with Google-specific data (avatar, labels, starred status).
   *
   * WHAT IT IMPORTS:
   * - Names and email addresses
   * - Profile photos (avatar URLs)
   * - Contact group labels (Work, Family, etc.)
   * - Starred status (for VIP suggestions)
   * - Company and job title
   *
   * @param params - Import parameters
   * @returns Import result with counts and errors
   *
   * @example
   * ```typescript
   * // During onboarding, import Google contacts
   * const result = await contactService.importFromGoogle({
   *   userId: user.id,
   *   accessToken: gmailAccount.accessToken,
   *   accountId: gmailAccount.id,
   *   maxContacts: 100,
   * });
   *
   * console.log(`Imported ${result.imported} contacts`);
   * console.log(`${result.starred} are starred (VIP candidates)`);
   * ```
   */
  async importFromGoogle(params: ImportFromGoogleParams): Promise<ImportResult> {
    const {
      userId,
      accessToken,
      accountId,
      maxContacts = 100,
      starredOnly = false,
    } = params;

    logger.info('Starting Google contacts import', {
      userId: userId.substring(0, 8),
      accountId: accountId.substring(0, 8),
      maxContacts,
      starredOnly,
    });

    const result: ImportResult = {
      imported: 0,
      starred: 0,
      skipped: 0,
      errors: [],
    };

    try {
      // ─────────────────────────────────────────────────────────────────────────
      // Check if contacts scope is available
      // ─────────────────────────────────────────────────────────────────────────
      const peopleService = createPeopleService(accessToken, accountId);

      const hasScope = await peopleService.hasContactsScope();
      if (!hasScope) {
        logger.warn('Contacts scope not available, skipping import', {
          accountId: accountId.substring(0, 8),
        });
        result.errors.push('Contacts permission not granted');
        return result;
      }

      // ─────────────────────────────────────────────────────────────────────────
      // Fetch contacts from Google
      // ─────────────────────────────────────────────────────────────────────────
      let googleContacts: GoogleContact[];

      if (starredOnly) {
        googleContacts = await peopleService.getStarredContacts();
      } else {
        const listResult = await peopleService.listContacts({
          maxResults: maxContacts,
          fetchAllPages: true,
        });
        googleContacts = listResult.contacts;
      }

      logger.info('Fetched Google contacts', {
        accountId: accountId.substring(0, 8),
        count: googleContacts.length,
      });

      // ─────────────────────────────────────────────────────────────────────────
      // Prepare contacts for batched import
      // ─────────────────────────────────────────────────────────────────────────
      // Filter to contacts that have a valid email, then build the upsert rows.
      // Contacts without emails are skipped (common in Google Contacts for
      // phone-only entries).
      const supabase = await createServerClient();
      const now = new Date().toISOString();

      const validContacts = googleContacts.filter((gc) => {
        if (!gc.email) {
          result.skipped++;
          return false;
        }
        return true;
      });

      // Count starred contacts up-front for the result
      result.starred = validContacts.filter((gc) => gc.isStarred).length;

      logger.info('Prepared contacts for batch import', {
        total: googleContacts.length,
        valid: validContacts.length,
        skippedNoEmail: result.skipped,
        starred: result.starred,
      });

      // ─────────────────────────────────────────────────────────────────────────
      // Batch upsert contacts in chunks of IMPORT_BATCH_SIZE (50)
      // ─────────────────────────────────────────────────────────────────────────
      // Previously this was a sequential for-loop making one RPC call per contact
      // (100 contacts = 100 DB round-trips = 10+ seconds). Now we batch into
      // chunks of 50, using a single .upsert() per batch. This reduces 100
      // contacts to 2 DB calls, completing in <2 seconds.
      for (let batchStart = 0; batchStart < validContacts.length; batchStart += IMPORT_BATCH_SIZE) {
        const batch = validContacts.slice(batchStart, batchStart + IMPORT_BATCH_SIZE);
        const batchNumber = Math.floor(batchStart / IMPORT_BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(validContacts.length / IMPORT_BATCH_SIZE);

        // Map Google contacts to database row format
        const rows = batch.map((gc) => ({
          user_id: userId,
          email: gc.email!.toLowerCase().trim(),
          name: gc.name,
          avatar_url: gc.photoUrl ?? null,
          google_resource_name: gc.resourceName ?? null,
          google_labels: gc.labels ?? [],
          is_google_starred: gc.isStarred ?? false,
          google_synced_at: now,
          import_source: 'google' as const,
          needs_enrichment: true,
          updated_at: now,
        }));

        logger.debug('Upserting contact batch', {
          batchNumber,
          totalBatches,
          batchSize: rows.length,
        });

        try {
          const { error: batchError } = await supabase
            .from('contacts')
            .upsert(rows, {
              onConflict: 'user_id,email',
              ignoreDuplicates: false,
            });

          if (batchError) {
            logger.error('Batch upsert failed', {
              batchNumber,
              error: batchError.message,
              errorCode: batchError.code,
            });
            // Record error for each contact in the failed batch
            for (const row of rows) {
              result.errors.push(`${row.email}: Batch upsert failed - ${batchError.message}`);
            }
          } else {
            result.imported += rows.length;
            logger.debug('Batch upsert succeeded', {
              batchNumber,
              imported: rows.length,
              runningTotal: result.imported,
            });
          }
        } catch (batchErr) {
          const message = batchErr instanceof Error ? batchErr.message : 'Unknown batch error';
          logger.error('Unexpected batch upsert error', {
            batchNumber,
            error: message,
          });
          for (const row of rows) {
            result.errors.push(`${row.email}: ${message}`);
          }
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // Update account sync timestamp (may fail if columns don't exist yet)
      // ─────────────────────────────────────────────────────────────────────────
      try {
        await supabase
          .from('gmail_accounts')
          .update({
            contacts_synced_at: new Date().toISOString(),
            contacts_sync_enabled: true,
          })
          .eq('id', accountId);
      } catch {
        // Columns may not exist yet - ignore
        logger.debug('Could not update contacts_synced_at (column may not exist)');
      }

      logger.info('Google contacts import complete', {
        userId: userId.substring(0, 8),
        accountId: accountId.substring(0, 8),
        imported: result.imported,
        starred: result.starred,
        skipped: result.skipped,
        errors: result.errors.length,
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Google contacts import failed', {
        userId: userId.substring(0, 8),
        error: message,
      });
      result.errors.push(message);
      return result;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC METHODS - VIP SUGGESTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Gets VIP suggestions for onboarding.
   *
   * This method returns contacts that should be suggested as VIPs during
   * onboarding. It prioritizes:
   * 1. Google starred contacts
   * 2. High email count contacts
   * 3. Recent communication contacts
   * 4. Contacts in important Google groups
   *
   * @param userId - User ID
   * @param limit - Maximum suggestions to return (default: 15)
   * @returns Array of VIP suggestions with reasons
   *
   * @example
   * ```typescript
   * // In onboarding step
   * const suggestions = await contactService.getVipSuggestions(userId, 15);
   *
   * suggestions.forEach(s => {
   *   console.log(`${s.name} (${s.email})`);
   *   console.log(`  Reason: ${s.suggestionReason}`);
   * });
   * ```
   */
  async getVipSuggestions(userId: string, limit: number = 15): Promise<VipSuggestion[]> {
    logger.info('Getting VIP suggestions', {
      userId: userId.substring(0, 8),
      limit,
    });

    try {
      const supabase = await createServerClient();

      // Try using the database function first
      let suggestions: VipSuggestion[] = [];
      let usedFallback = false;

      try {
        const { data, error } = await supabase.rpc('get_vip_suggestions', {
          p_user_id: userId,
          p_limit: limit,
        });

        if (!error && data) {
          suggestions = (data || []).map((row: Record<string, unknown>) => ({
            id: row.id as string,
            email: row.email as string,
            name: row.name as string | null,
            avatarUrl: row.avatar_url as string | null,
            emailCount: row.email_count as number,
            lastSeenAt: row.last_seen_at as string | null,
            isGoogleStarred: row.is_google_starred as boolean,
            googleLabels: (row.google_labels as string[]) || [],
            relationshipType: row.relationship_type as string | null,
            suggestionReason: row.suggestion_reason as string,
            source: ((row.import_source as string) === 'google' ? 'google' : 'email') as 'google' | 'email' | 'manual',
            company: (row.company as string) ?? null,
            jobTitle: (row.job_title as string) ?? null,
          }));
        } else {
          throw new Error(error?.message || 'RPC returned no data');
        }
      } catch (rpcError) {
        // RPC function doesn't exist or failed — use scored fallback
        logger.debug('get_vip_suggestions RPC not available, using scored fallback', {
          error: rpcError instanceof Error ? rpcError.message : 'Unknown',
        });
        usedFallback = true;

        // ─────────────────────────────────────────────────────────────────────
        // Scored VIP Suggestions
        //
        // Fetches ALL eligible contacts (named, not archived, not already VIP)
        // and scores each one using multiple signals:
        //   - Google starred & label groups (explicit user intent)
        //   - Same last name as user (family signal)
        //   - Same email domain as user (coworker signal)
        //   - Sent count (user initiates contact = they care)
        //   - Bidirectional communication
        //   - Email frequency, recency, and longevity
        //   - AI-enriched relationship type
        //   - Sender type penalty (broadcasts/cold outreach)
        //   - Avatar presence
        //
        // This handles both established accounts (rich email history) and
        // fresh Google imports (only name + Google metadata available).
        // ─────────────────────────────────────────────────────────────────────

        // Fetch user profile for last-name and domain matching
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('full_name, email')
          .eq('id', userId)
          .single();

        const userFullName = profile?.full_name || null;
        const userLastName = userFullName
          ? userFullName.trim().split(/\s+/).pop() || null
          : null;
        const userEmailDomain = profile?.email
          ? profile.email.split('@')[1]?.toLowerCase() || null
          : null;

        // Broad query: all named, non-archived, non-VIP contacts (cap at 200
        // to keep scoring fast — more than enough for onboarding).
        const { data: allContacts, error: allError } = await supabase
          .from('contacts')
          .select('id, email, name, email_count, sent_count, received_count, first_seen_at, last_seen_at, relationship_type, sender_type, is_vip, avatar_url, is_google_starred, google_labels, import_source, company, job_title')
          .eq('user_id', userId)
          .eq('is_archived', false)
          .eq('is_vip', false)
          .not('name', 'is', null)
          .limit(200);

        if (allError) {
          logger.error('Scored VIP suggestions query failed', {
            error: allError.message,
            userId: userId.substring(0, 8),
          });
          return [];
        }

        // Score, sort, and take top N
        const scored = (allContacts || [])
          .map((row) => scoreContact(row as Record<string, unknown>, userLastName, userEmailDomain))
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);

        logger.debug('Scored VIP suggestions', {
          totalCandidates: allContacts?.length ?? 0,
          topScore: scored[0]?.score ?? 0,
          bottomScore: scored[scored.length - 1]?.score ?? 0,
        });

        suggestions = scored.map(({ row, reasons }) => ({
          id: row.id as string,
          email: row.email as string,
          name: row.name as string | null,
          avatarUrl: (row.avatar_url as string) ?? null,
          emailCount: (row.email_count as number) || 0,
          lastSeenAt: row.last_seen_at as string | null,
          isGoogleStarred: (row.is_google_starred as boolean) ?? false,
          googleLabels: (row.google_labels as string[]) ?? [],
          relationshipType: row.relationship_type as string | null,
          suggestionReason: reasons.slice(0, 2).join(' + ') || 'Contact',
          source: ((row.import_source as string) === 'google' ? 'google' : 'email') as 'google' | 'email' | 'manual',
          company: (row.company as string) ?? null,
          jobTitle: (row.job_title as string) ?? null,
        }));
      }

      // ─────────────────────────────────────────────────────────────────────
      // Post-RPC scored fallback: If the RPC succeeded but returned 0
      // results (common after fresh Google import where contacts have no
      // email history), fall through to scored ranking.
      // ─────────────────────────────────────────────────────────────────────
      if (suggestions.length === 0 && !usedFallback) {
        logger.info('RPC returned 0 suggestions, falling back to scored ranking', {
          userId: userId.substring(0, 8),
        });

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('full_name, email')
          .eq('id', userId)
          .single();

        const userFullName = profile?.full_name || null;
        const userLastName = userFullName
          ? userFullName.trim().split(/\s+/).pop() || null
          : null;
        const userEmailDomain = profile?.email
          ? profile.email.split('@')[1]?.toLowerCase() || null
          : null;

        const { data: allContacts } = await supabase
          .from('contacts')
          .select('id, email, name, email_count, sent_count, received_count, first_seen_at, last_seen_at, relationship_type, sender_type, is_vip, avatar_url, is_google_starred, google_labels, import_source, company, job_title')
          .eq('user_id', userId)
          .eq('is_archived', false)
          .eq('is_vip', false)
          .not('name', 'is', null)
          .limit(200);

        if (allContacts && allContacts.length > 0) {
          const scored = allContacts
            .map((row) => scoreContact(row as Record<string, unknown>, userLastName, userEmailDomain))
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

          suggestions = scored.map(({ row, reasons }) => ({
            id: row.id as string,
            email: row.email as string,
            name: row.name as string | null,
            avatarUrl: (row.avatar_url as string) ?? null,
            emailCount: (row.email_count as number) || 0,
            lastSeenAt: row.last_seen_at as string | null,
            isGoogleStarred: (row.is_google_starred as boolean) ?? false,
            googleLabels: (row.google_labels as string[]) ?? [],
            relationshipType: row.relationship_type as string | null,
            suggestionReason: reasons.slice(0, 2).join(' + ') || 'Contact',
            source: ((row.import_source as string) === 'google' ? 'google' : 'email') as 'google' | 'email' | 'manual',
            company: (row.company as string) ?? null,
            jobTitle: (row.job_title as string) ?? null,
          }));

          logger.info('Scored fallback produced suggestions', {
            userId: userId.substring(0, 8),
            count: suggestions.length,
            topScore: scored[0]?.score ?? 0,
          });
        }
      }

      logger.info('VIP suggestions retrieved', {
        userId: userId.substring(0, 8),
        count: suggestions.length,
        usedFallback,
        starredCount: suggestions.filter((s) => s.isGoogleStarred).length,
      });

      return suggestions;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error getting VIP suggestions', {
        userId: userId.substring(0, 8),
        error: message,
      });
      return [];
    }
  }

  /**
   * Gets frequent contacts by email count.
   *
   * This method returns contacts ordered by email count, useful for
   * showing the user who they communicate with most.
   *
   * @param userId - User ID
   * @param limit - Maximum contacts to return (default: 20)
   * @returns Array of contact summaries
   */
  async getFrequentContacts(userId: string, limit: number = 20): Promise<ContactSummary[]> {
    logger.info('Getting frequent contacts', {
      userId: userId.substring(0, 8),
      limit,
    });

    try {
      const supabase = await createServerClient();

      // Try RPC first, fallback to direct query
      let contacts: ContactSummary[] = [];

      try {
        const { data, error } = await supabase.rpc('get_frequent_contacts', {
          p_user_id: userId,
          p_limit: limit,
        });

        if (!error && data) {
          contacts = (data || []).map((row: Record<string, unknown>) => ({
            id: row.id as string,
            email: row.email as string,
            name: row.name as string | null,
            avatarUrl: row.avatar_url as string | null,
            emailCount: row.email_count as number,
            sentCount: row.sent_count as number,
            receivedCount: row.received_count as number,
            firstSeenAt: row.first_seen_at as string | null,
            lastSeenAt: row.last_seen_at as string | null,
            relationshipType: row.relationship_type as string | null,
            isVip: row.is_vip as boolean,
            isGoogleStarred: row.is_google_starred as boolean,
          }));
        } else {
          throw new Error(error?.message || 'RPC not available');
        }
      } catch {
        // Fallback: Direct query
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('contacts')
          .select('id, email, name, email_count, sent_count, received_count, first_seen_at, last_seen_at, relationship_type, is_vip')
          .eq('user_id', userId)
          .eq('is_archived', false)
          .gte('email_count', 3)
          .order('email_count', { ascending: false })
          .limit(limit);

        if (fallbackError) {
          logger.error('Fallback query failed', { error: fallbackError.message });
          return [];
        }

        contacts = (fallbackData || []).map((row) => ({
          id: row.id,
          email: row.email,
          name: row.name,
          avatarUrl: null,
          emailCount: row.email_count,
          sentCount: row.sent_count || 0,
          receivedCount: row.received_count || 0,
          firstSeenAt: row.first_seen_at,
          lastSeenAt: row.last_seen_at,
          relationshipType: row.relationship_type,
          isVip: row.is_vip,
          isGoogleStarred: false,
        }));
      }

      logger.info('Frequent contacts retrieved', {
        userId: userId.substring(0, 8),
        count: contacts.length,
      });

      return contacts;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error getting frequent contacts', {
        userId: userId.substring(0, 8),
        error: message,
      });
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC METHODS - VIP MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Marks contacts as VIPs.
   *
   * Called during onboarding when user confirms VIP selections.
   *
   * @param userId - User ID
   * @param contactIds - Array of contact IDs to mark as VIP
   * @returns Number of contacts updated
   */
  async markAsVip(userId: string, contactIds: string[]): Promise<number> {
    if (contactIds.length === 0) {
      return 0;
    }

    logger.info('Marking contacts as VIP', {
      userId: userId.substring(0, 8),
      count: contactIds.length,
    });

    try {
      const supabase = await createServerClient();

      const { data, error } = await supabase
        .from('contacts')
        .update({ is_vip: true, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .in('id', contactIds)
        .select('id');

      if (error) {
        logger.error('Failed to mark contacts as VIP', {
          userId: userId.substring(0, 8),
          error: error.message,
        });
        return 0;
      }

      const count = data?.length || 0;

      logger.info('Contacts marked as VIP', {
        userId: userId.substring(0, 8),
        count,
      });

      return count;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error marking contacts as VIP', {
        userId: userId.substring(0, 8),
        error: message,
      });
      return 0;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC METHODS - CONTACT ALIASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Links an alias email to a primary contact.
   *
   * Use this when the same person uses multiple email addresses.
   * Future emails from the alias will be linked to the primary contact.
   *
   * @param userId - User ID
   * @param primaryContactId - Primary contact ID
   * @param aliasEmail - Alternative email address
   * @param createdVia - How the alias was identified
   * @returns Alias ID or null if creation failed
   */
  async linkAlias(
    userId: string,
    primaryContactId: string,
    aliasEmail: string,
    createdVia: 'google' | 'manual' | 'auto' = 'manual'
  ): Promise<string | null> {
    logger.info('Linking contact alias', {
      userId: userId.substring(0, 8),
      primaryContactId: primaryContactId.substring(0, 8),
      aliasEmail: aliasEmail.substring(0, 30),
      createdVia,
    });

    try {
      const supabase = await createServerClient();

      const { data, error } = await supabase.rpc('link_contact_alias', {
        p_user_id: userId,
        p_primary_contact_id: primaryContactId,
        p_alias_email: aliasEmail.toLowerCase().trim(),
        p_created_via: createdVia,
      });

      if (error) {
        logger.error('Failed to link contact alias', {
          aliasEmail: aliasEmail.substring(0, 30),
          error: error.message,
        });
        return null;
      }

      logger.info('Contact alias linked', {
        aliasId: data,
        aliasEmail: aliasEmail.substring(0, 30),
      });

      return data as string;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error linking contact alias', {
        aliasEmail: aliasEmail.substring(0, 30),
        error: message,
      });
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  // (Batched upserts now include all Google fields directly — no column check needed.
  //  Migration 022 added all Google-specific columns and is required.)
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default ContactService instance for convenience.
 *
 * @example
 * ```typescript
 * import { contactService } from '@/services/contacts/contact-service';
 *
 * const contactId = await contactService.upsertFromEmail({ ... });
 * ```
 */
export const contactService = new ContactService();
