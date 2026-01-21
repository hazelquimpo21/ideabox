/**
 * Google API Integration
 *
 * This module provides services for integrating with Google APIs:
 * - People API: Contact import and sync
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import { createPeopleService, type GoogleContact } from '@/lib/google';
 *
 * // Create service with access token
 * const peopleService = createPeopleService(accessToken, accountId);
 *
 * // Fetch contacts
 * const result = await peopleService.listContacts({ maxResults: 100 });
 *
 * // Get starred contacts for VIP suggestions
 * const starred = await peopleService.getStarredContacts();
 * ```
 *
 * @module lib/google
 */

// People API Service (Google Contacts)
export {
  GooglePeopleService,
  createPeopleService,
  type GoogleContact,
  type GoogleContactGroup,
  type ListContactsOptions,
  type ListContactsResult,
} from './people-service';
