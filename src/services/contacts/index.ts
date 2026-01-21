/**
 * Contact Services
 *
 * Centralized contact management for IdeaBox. This module provides:
 * - Contact creation from emails
 * - Google Contacts import
 * - VIP suggestions for onboarding
 * - Contact alias management
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CONTACT FLOW OVERVIEW
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * DURING ONBOARDING:
 * 1. User connects Gmail account
 * 2. System imports Google Contacts (if scope granted)
 * 3. Initial email sync creates contacts from email senders
 * 4. VIP suggestions shown to user (starred + frequent contacts)
 * 5. User selects VIPs for prioritization
 *
 * DURING EMAIL PROCESSING:
 * 1. Email received/synced from Gmail
 * 2. ContactService.upsertFromEmail() creates/updates sender contact
 * 3. Contact ID linked to email for relationship tracking
 * 4. Contact enrichment runs if needed (company, job title from signature)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import { contactService, type VipSuggestion } from '@/services/contacts';
 *
 * // During email processing
 * const contactId = await contactService.upsertFromEmail({
 *   userId,
 *   email: senderEmail,
 *   name: senderName,
 *   emailDate: emailDate,
 * });
 *
 * // During onboarding
 * const suggestions = await contactService.getVipSuggestions(userId);
 * ```
 *
 * @module services/contacts
 */

// Contact Service
export {
  ContactService,
  contactService,
  type UpsertFromEmailParams,
  type ImportFromGoogleParams,
  type ImportResult,
  type VipSuggestion,
  type ContactLookupResult,
  type ContactSummary,
} from './contact-service';
