/**
 * Superadmin Configuration
 *
 * Defines which users have superadmin access to privileged operations
 * like account resets, data wipes, and retriggering onboarding.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * WHY A HARDCODED LIST?
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This is a small, developer-only feature for testing and debugging.
 * A full RBAC system would be over-engineered for this use case.
 * The list is intentionally small and easy to audit.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ADDING A SUPERADMIN
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Add their email (lowercase) to the SUPERADMIN_EMAILS array below
 * 2. Deploy the change
 * 3. They can now access /admin routes and APIs
 *
 * @module config/superadmin
 * @since February 2026
 */

// ═══════════════════════════════════════════════════════════════════════════════
// SUPERADMIN EMAIL LIST
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Email addresses that have superadmin privileges.
 * All comparisons are case-insensitive (lowercased before checking).
 *
 * Superadmins can:
 * - Access the /admin page
 * - Reset any account's data (wipe emails, actions, contacts, etc.)
 * - Retrigger onboarding for any account
 * - View all users in the system
 */
export const SUPERADMIN_EMAILS: readonly string[] = [
  'hazel.quimpo@gmail.com',
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Checks whether a given email address belongs to a superadmin.
 *
 * @param email - The email address to check (case-insensitive)
 * @returns true if the email is in the SUPERADMIN_EMAILS list
 *
 * @example
 * ```typescript
 * import { isSuperAdmin } from '@/config/superadmin';
 *
 * if (!isSuperAdmin(user.email)) {
 *   return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
 * }
 * ```
 */
export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return SUPERADMIN_EMAILS.includes(email.toLowerCase());
}
