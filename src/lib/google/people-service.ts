/**
 * Google People API Service
 *
 * Provides integration with Google People API (Contacts API) for:
 * - Importing contacts from Google
 * - Fetching starred contacts for VIP suggestions
 * - Syncing contact photos and metadata
 * - Detecting contact groups/labels
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * REQUIRED OAUTH SCOPE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * To use this service, the user must have granted the following OAuth scope:
 *
 *   https://www.googleapis.com/auth/contacts.readonly
 *
 * This scope allows read-only access to the user's contacts. Add it to your
 * OAuth configuration in the Google Cloud Console and update the scopes in
 * your auth configuration.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import { GooglePeopleService, createPeopleService } from '@/lib/google/people-service';
 *
 * // Create service with access token
 * const peopleService = createPeopleService(accessToken, accountId);
 *
 * // Fetch all contacts
 * const contacts = await peopleService.listContacts({ maxResults: 100 });
 *
 * // Fetch only starred contacts (for VIP suggestions)
 * const starred = await peopleService.getStarredContacts();
 *
 * // Fetch contact groups (labels)
 * const groups = await peopleService.getContactGroups();
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DATA FLOW: Google → IdeaBox
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Google People API returns contacts in this format:
 * {
 *   resourceName: "people/c123456789",
 *   names: [{ displayName: "John Doe", givenName: "John", familyName: "Doe" }],
 *   emailAddresses: [{ value: "john@example.com", type: "work" }],
 *   photos: [{ url: "https://..." }],
 *   memberships: [{ contactGroupMembership: { contactGroupResourceName: "contactGroups/starred" } }]
 * }
 *
 * We transform this to our GoogleContact format for database storage.
 *
 * @module lib/google/people-service
 * @version 1.0.0
 * @since January 2026
 */

import { google, people_v1 } from 'googleapis';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fields to request from People API.
 * Requesting only what we need reduces response size and improves performance.
 */
const PERSON_FIELDS = [
  'names',
  'emailAddresses',
  'photos',
  'memberships',
  'organizations',
  'phoneNumbers',
].join(',');

/**
 * Maximum contacts to fetch per page.
 * Google API allows up to 1000 per page.
 */
const DEFAULT_PAGE_SIZE = 100;

/**
 * Maximum retry attempts for API calls.
 */
const MAX_RETRIES = 3;

/**
 * Base delay for exponential backoff (milliseconds).
 */
const RETRY_BASE_DELAY_MS = 1000;

/**
 * Contact group resource name for starred contacts.
 */
const STARRED_GROUP = 'contactGroups/starred';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('GooglePeopleService');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Simplified contact structure from Google People API.
 * Transformed from the raw API response for easier use.
 */
export interface GoogleContact {
  /** Google People API resource name (e.g., "people/c123456789") */
  resourceName: string;

  /** Display name (full name) */
  name: string | null;

  /** Given (first) name */
  givenName: string | null;

  /** Family (last) name */
  familyName: string | null;

  /** Primary email address */
  email: string | null;

  /** All email addresses with types */
  emails: Array<{ value: string; type: string | null }>;

  /** Profile photo URL */
  photoUrl: string | null;

  /** Contact group names (e.g., ["Work", "VIP"]) */
  labels: string[];

  /** Whether contact is starred */
  isStarred: boolean;

  /** Organization/company name */
  company: string | null;

  /** Job title */
  jobTitle: string | null;

  /** Primary phone number */
  phone: string | null;
}

/**
 * Contact group from Google.
 */
export interface GoogleContactGroup {
  /** Resource name (e.g., "contactGroups/123") */
  resourceName: string;

  /** Group name (e.g., "Work", "Family") */
  name: string;

  /** Number of contacts in group */
  memberCount: number;

  /** Whether this is a system group (starred, all contacts, etc.) */
  isSystemGroup: boolean;
}

/**
 * Options for listing contacts.
 */
export interface ListContactsOptions {
  /** Maximum number of contacts to fetch (default: 100) */
  maxResults?: number;

  /** Page token for pagination */
  pageToken?: string;

  /** Whether to fetch all pages (default: false) */
  fetchAllPages?: boolean;
}

/**
 * Result of listing contacts.
 */
export interface ListContactsResult {
  /** Fetched contacts */
  contacts: GoogleContact[];

  /** Token for next page (if more contacts available) */
  nextPageToken: string | null;

  /** Total contacts available (may be estimated) */
  totalPeople: number | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE PEOPLE SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Google People API Service
 *
 * Provides methods for fetching and transforming Google contacts.
 * Handles authentication, pagination, retries, and error handling.
 *
 * @example
 * ```typescript
 * // Create service
 * const service = new GooglePeopleService(accessToken);
 *
 * // Fetch contacts for onboarding
 * const result = await service.listContacts({ maxResults: 50 });
 * console.log(`Found ${result.contacts.length} contacts`);
 *
 * // Get starred contacts for VIP suggestions
 * const starred = await service.getStarredContacts();
 * console.log(`User has ${starred.length} starred contacts`);
 * ```
 */
export class GooglePeopleService {
  /** Google People API client */
  private readonly people: people_v1.People;

  /** Account ID for logging context */
  private readonly accountId?: string;

  /** Cache for contact groups (fetched once per session) */
  private groupsCache: Map<string, string> | null = null;

  /**
   * Creates a new GooglePeopleService instance.
   *
   * @param accessToken - Valid OAuth access token with contacts.readonly scope
   * @param accountId - Optional account ID for logging
   */
  constructor(accessToken: string, accountId?: string) {
    // Create OAuth2 client with the access token
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    // Initialize People API client
    this.people = google.people({ version: 'v1', auth });
    this.accountId = accountId;

    logger.debug('GooglePeopleService initialized', {
      accountId: accountId?.substring(0, 8),
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Lists contacts from the user's Google account.
   *
   * Fetches contacts with names, emails, photos, and group memberships.
   * Supports pagination for large contact lists.
   *
   * @param options - Listing options (max results, pagination)
   * @returns Contacts and pagination info
   *
   * @example
   * ```typescript
   * // Fetch first 50 contacts
   * const result = await service.listContacts({ maxResults: 50 });
   *
   * // Fetch all contacts (multiple pages)
   * const allResult = await service.listContacts({
   *   maxResults: 500,
   *   fetchAllPages: true
   * });
   * ```
   */
  async listContacts(options: ListContactsOptions = {}): Promise<ListContactsResult> {
    const { maxResults = DEFAULT_PAGE_SIZE, pageToken, fetchAllPages = false } = options;

    logger.info('Listing Google contacts', {
      accountId: this.accountId?.substring(0, 8),
      maxResults,
      hasPageToken: !!pageToken,
      fetchAllPages,
    });

    try {
      // Ensure we have group names for label resolution
      await this.loadContactGroups();

      if (fetchAllPages) {
        return await this.fetchAllContacts(maxResults);
      }

      return await this.fetchContactsPage(maxResults, pageToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to list Google contacts', {
        accountId: this.accountId?.substring(0, 8),
        error: message,
      });
      throw this.wrapError(error, 'Failed to fetch contacts from Google');
    }
  }

  /**
   * Gets only starred contacts from Google.
   *
   * Starred contacts are excellent VIP candidates during onboarding
   * since the user has already marked them as important in Google.
   *
   * @returns Array of starred contacts
   *
   * @example
   * ```typescript
   * const starred = await service.getStarredContacts();
   * console.log(`Suggesting ${starred.length} contacts as VIPs`);
   * ```
   */
  async getStarredContacts(): Promise<GoogleContact[]> {
    logger.info('Fetching starred contacts', {
      accountId: this.accountId?.substring(0, 8),
    });

    try {
      // Fetch all contacts and filter to starred
      // Note: Google People API doesn't have a direct filter for starred,
      // so we fetch all and filter client-side
      const result = await this.listContacts({
        maxResults: 500,
        fetchAllPages: true,
      });

      const starred = result.contacts.filter((c) => c.isStarred);

      logger.info('Starred contacts fetched', {
        accountId: this.accountId?.substring(0, 8),
        totalContacts: result.contacts.length,
        starredCount: starred.length,
      });

      return starred;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to fetch starred contacts', {
        accountId: this.accountId?.substring(0, 8),
        error: message,
      });
      throw this.wrapError(error, 'Failed to fetch starred contacts');
    }
  }

  /**
   * Gets contact groups (labels) from Google.
   *
   * Groups include user-created labels (Work, Family) and system groups
   * (starred, all contacts). Useful for relationship categorization.
   *
   * @returns Array of contact groups
   *
   * @example
   * ```typescript
   * const groups = await service.getContactGroups();
   * groups.forEach(g => {
   *   console.log(`${g.name}: ${g.memberCount} contacts`);
   * });
   * ```
   */
  async getContactGroups(): Promise<GoogleContactGroup[]> {
    logger.info('Fetching contact groups', {
      accountId: this.accountId?.substring(0, 8),
    });

    try {
      const response = await this.executeWithRetry(async () => {
        return this.people.contactGroups.list({
          pageSize: 100,
        });
      });

      const groups: GoogleContactGroup[] = [];

      for (const group of response.data.contactGroups || []) {
        if (group.resourceName && group.name) {
          groups.push({
            resourceName: group.resourceName,
            name: group.formattedName || group.name,
            memberCount: group.memberCount || 0,
            isSystemGroup: group.groupType === 'SYSTEM_CONTACT_GROUP',
          });
        }
      }

      logger.info('Contact groups fetched', {
        accountId: this.accountId?.substring(0, 8),
        groupCount: groups.length,
        userGroups: groups.filter((g) => !g.isSystemGroup).length,
      });

      return groups;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to fetch contact groups', {
        accountId: this.accountId?.substring(0, 8),
        error: message,
      });
      throw this.wrapError(error, 'Failed to fetch contact groups');
    }
  }

  /**
   * Checks if the access token has the required contacts scope.
   *
   * Call this before attempting to fetch contacts to provide a better
   * user experience if the scope is missing.
   *
   * @returns True if contacts scope is available
   *
   * @example
   * ```typescript
   * if (!await service.hasContactsScope()) {
   *   // Prompt user to re-authorize with contacts scope
   *   showReauthorizePrompt();
   * }
   * ```
   */
  async hasContactsScope(): Promise<boolean> {
    logger.debug('Checking contacts scope', {
      accountId: this.accountId?.substring(0, 8),
    });

    try {
      // Try to fetch a single contact as a scope check
      await this.people.people.connections.list({
        resourceName: 'people/me',
        pageSize: 1,
        personFields: 'names',
      });

      logger.debug('Contacts scope confirmed', {
        accountId: this.accountId?.substring(0, 8),
      });

      return true;
    } catch (error) {
      // 403 Forbidden usually means scope is missing
      if (this.isPermissionError(error)) {
        logger.info('Contacts scope not available', {
          accountId: this.accountId?.substring(0, 8),
        });
        return false;
      }

      // Other errors should be thrown
      throw this.wrapError(error, 'Failed to check contacts scope');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS - FETCHING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fetches a single page of contacts.
   */
  private async fetchContactsPage(
    pageSize: number,
    pageToken?: string
  ): Promise<ListContactsResult> {
    const response = await this.executeWithRetry(async () => {
      return this.people.people.connections.list({
        resourceName: 'people/me',
        pageSize,
        pageToken,
        personFields: PERSON_FIELDS,
        sortOrder: 'LAST_MODIFIED_DESCENDING',
      });
    });

    const contacts = this.transformContacts(response.data.connections || []);

    logger.debug('Contacts page fetched', {
      accountId: this.accountId?.substring(0, 8),
      pageSize: contacts.length,
      hasNextPage: !!response.data.nextPageToken,
    });

    return {
      contacts,
      nextPageToken: response.data.nextPageToken || null,
      totalPeople: response.data.totalPeople || null,
    };
  }

  /**
   * Fetches all contacts across multiple pages.
   */
  private async fetchAllContacts(maxTotal: number): Promise<ListContactsResult> {
    const allContacts: GoogleContact[] = [];
    let pageToken: string | undefined;
    let pageCount = 0;

    logger.info('Fetching all contacts (paginated)', {
      accountId: this.accountId?.substring(0, 8),
      maxTotal,
    });

    while (allContacts.length < maxTotal) {
      const remaining = maxTotal - allContacts.length;
      const pageSize = Math.min(remaining, DEFAULT_PAGE_SIZE);

      const result = await this.fetchContactsPage(pageSize, pageToken);
      allContacts.push(...result.contacts);
      pageCount++;

      logger.debug('Fetched contacts page', {
        accountId: this.accountId?.substring(0, 8),
        pageNumber: pageCount,
        pageSize: result.contacts.length,
        totalSoFar: allContacts.length,
      });

      if (!result.nextPageToken) {
        break; // No more pages
      }

      pageToken = result.nextPageToken;
    }

    logger.info('All contacts fetched', {
      accountId: this.accountId?.substring(0, 8),
      totalContacts: allContacts.length,
      pagesFetched: pageCount,
    });

    return {
      contacts: allContacts,
      nextPageToken: null,
      totalPeople: allContacts.length,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS - TRANSFORMATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Transforms raw People API contacts to our format.
   */
  private transformContacts(connections: people_v1.Schema$Person[]): GoogleContact[] {
    return connections
      .map((person) => this.transformPerson(person))
      .filter((contact): contact is GoogleContact => contact !== null);
  }

  /**
   * Transforms a single Person to our GoogleContact format.
   */
  private transformPerson(person: people_v1.Schema$Person): GoogleContact | null {
    // Skip contacts without resource name
    if (!person.resourceName) {
      return null;
    }

    // Extract primary name
    const primaryName = person.names?.[0];
    const name = primaryName?.displayName || null;
    const givenName = primaryName?.givenName || null;
    const familyName = primaryName?.familyName || null;

    // Extract emails
    const emails =
      person.emailAddresses?.map((e) => ({
        value: e.value || '',
        type: e.type || null,
      })) || [];

    const primaryEmail = emails[0]?.value || null;

    // Skip contacts without email (we need email to match with our contacts)
    if (!primaryEmail) {
      return null;
    }

    // Extract photo URL
    const photoUrl = person.photos?.[0]?.url || null;

    // Extract organization info
    const org = person.organizations?.[0];
    const company = org?.name || null;
    const jobTitle = org?.title || null;

    // Extract phone
    const phone = person.phoneNumbers?.[0]?.value || null;

    // Extract group memberships and check for starred
    const memberships = person.memberships || [];
    const labels: string[] = [];
    let isStarred = false;

    for (const membership of memberships) {
      const groupResourceName =
        membership.contactGroupMembership?.contactGroupResourceName;

      if (groupResourceName === STARRED_GROUP) {
        isStarred = true;
      } else if (groupResourceName && this.groupsCache) {
        const groupName = this.groupsCache.get(groupResourceName);
        if (groupName) {
          labels.push(groupName);
        }
      }
    }

    return {
      resourceName: person.resourceName,
      name,
      givenName,
      familyName,
      email: primaryEmail,
      emails,
      photoUrl,
      labels,
      isStarred,
      company,
      jobTitle,
      phone,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS - HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Loads contact groups and caches them for label resolution.
   */
  private async loadContactGroups(): Promise<void> {
    if (this.groupsCache) {
      return; // Already loaded
    }

    logger.debug('Loading contact groups for label resolution', {
      accountId: this.accountId?.substring(0, 8),
    });

    try {
      const response = await this.executeWithRetry(async () => {
        return this.people.contactGroups.list({
          pageSize: 100,
        });
      });

      this.groupsCache = new Map();

      for (const group of response.data.contactGroups || []) {
        if (group.resourceName && group.formattedName) {
          this.groupsCache.set(group.resourceName, group.formattedName);
        }
      }

      logger.debug('Contact groups loaded', {
        accountId: this.accountId?.substring(0, 8),
        groupCount: this.groupsCache.size,
      });
    } catch (error) {
      // Non-fatal - we can still fetch contacts without group labels
      logger.warn('Failed to load contact groups (continuing without labels)', {
        accountId: this.accountId?.substring(0, 8),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      this.groupsCache = new Map();
    }
  }

  /**
   * Executes an API call with retry logic.
   */
  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry auth/permission errors
        if (this.isPermissionError(error)) {
          throw error;
        }

        // Check if retryable (rate limit, server error)
        if (this.isRetryableError(error)) {
          const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          logger.warn('Retrying People API call', {
            accountId: this.accountId?.substring(0, 8),
            attempt,
            delayMs,
            error: lastError.message,
          });
          await this.delay(delayMs);
          continue;
        }

        // Non-retryable error
        throw error;
      }
    }

    throw lastError;
  }

  /**
   * Checks if an error is a permission/auth error.
   */
  private isPermissionError(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const code = (error as { code?: number }).code;
      return code === 401 || code === 403;
    }
    return false;
  }

  /**
   * Checks if an error is retryable.
   */
  private isRetryableError(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const code = (error as { code?: number }).code;
      return code === 429 || code === 500 || code === 503;
    }
    return false;
  }

  /**
   * Wraps an error with additional context.
   */
  private wrapError(error: unknown, message: string): Error {
    const originalMessage = error instanceof Error ? error.message : String(error);
    const wrappedError = new Error(`${message}: ${originalMessage}`);

    // Preserve the original error code if available
    if (error && typeof error === 'object' && 'code' in error) {
      (wrappedError as Error & { code?: number }).code = (error as { code?: number }).code;
    }

    return wrappedError;
  }

  /**
   * Delays execution for a specified duration.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a GooglePeopleService instance.
 *
 * @param accessToken - Valid OAuth access token with contacts.readonly scope
 * @param accountId - Optional account ID for logging
 * @returns GooglePeopleService instance
 *
 * @example
 * ```typescript
 * const service = createPeopleService(accessToken, account.id);
 * const contacts = await service.listContacts();
 * ```
 */
export function createPeopleService(
  accessToken: string,
  accountId?: string
): GooglePeopleService {
  return new GooglePeopleService(accessToken, accountId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export type {
  GoogleContact,
  GoogleContactGroup,
  ListContactsOptions,
  ListContactsResult,
};
