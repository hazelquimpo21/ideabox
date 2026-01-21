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
    const { userId, email, name, emailDate, isSent = false } = params;

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
    });

    try {
      const supabase = await createServerClient();

      // ─────────────────────────────────────────────────────────────────────────
      // Call the database function for atomic upsert
      // This function handles all the logic for incrementing counts and
      // managing timestamps atomically
      // ─────────────────────────────────────────────────────────────────────────
      const { data, error } = await supabase.rpc('upsert_contact_from_email', {
        p_user_id: userId,
        p_email: normalizedEmail,
        p_name: name ?? null,
        p_email_date: emailDate,
        p_is_sent: isSent,
      });

      if (error) {
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
      // Import each contact
      // ─────────────────────────────────────────────────────────────────────────
      const supabase = await createServerClient();

      for (const gContact of googleContacts) {
        try {
          // Skip contacts without email
          if (!gContact.email) {
            result.skipped++;
            continue;
          }

          // Use the database function for atomic upsert
          const { error } = await supabase.rpc('upsert_google_contact', {
            p_user_id: userId,
            p_email: gContact.email,
            p_name: gContact.name,
            p_avatar_url: gContact.photoUrl,
            p_google_resource_name: gContact.resourceName,
            p_google_labels: gContact.labels,
            p_is_starred: gContact.isStarred,
          });

          if (error) {
            logger.warn('Failed to import Google contact', {
              email: gContact.email.substring(0, 30),
              error: error.message,
            });
            result.errors.push(`${gContact.email}: ${error.message}`);
            continue;
          }

          result.imported++;
          if (gContact.isStarred) {
            result.starred++;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          result.errors.push(`${gContact.email || 'unknown'}: ${message}`);
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // Update account sync timestamp
      // ─────────────────────────────────────────────────────────────────────────
      await supabase
        .from('gmail_accounts')
        .update({
          contacts_synced_at: new Date().toISOString(),
          contacts_sync_enabled: true,
        })
        .eq('id', accountId);

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

      // Use the database function that handles all the logic
      const { data, error } = await supabase.rpc('get_vip_suggestions', {
        p_user_id: userId,
        p_limit: limit,
      });

      if (error) {
        logger.error('Failed to get VIP suggestions', {
          userId: userId.substring(0, 8),
          error: error.message,
        });
        return [];
      }

      const suggestions: VipSuggestion[] = (data || []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        email: row.email as string,
        name: row.name as string | null,
        avatarUrl: row.avatar_url as string | null,
        emailCount: row.email_count as number,
        lastSeenAt: row.last_seen_at as string | null,
        isGoogleStarred: row.is_google_starred as boolean,
        googleLabels: row.google_labels as string[] || [],
        relationshipType: row.relationship_type as string | null,
        suggestionReason: row.suggestion_reason as string,
      }));

      logger.info('VIP suggestions retrieved', {
        userId: userId.substring(0, 8),
        count: suggestions.length,
        starredCount: suggestions.filter(s => s.isGoogleStarred).length,
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

      const { data, error } = await supabase.rpc('get_frequent_contacts', {
        p_user_id: userId,
        p_limit: limit,
      });

      if (error) {
        logger.error('Failed to get frequent contacts', {
          userId: userId.substring(0, 8),
          error: error.message,
        });
        return [];
      }

      const contacts: ContactSummary[] = (data || []).map((row: Record<string, unknown>) => ({
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
