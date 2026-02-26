/**
 * useUserContext Hook
 *
 * Fetches and manages user context data for personalized AI analysis.
 * This includes role, priorities, VIPs, location, interests, and work schedule.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```tsx
 * const { context, updateContext, isLoading, completionPercent } = useUserContext();
 *
 * // Display context
 * <p>Role: {context?.role || 'Not set'}</p>
 * <p>Setup: {completionPercent}% complete</p>
 *
 * // Update context
 * await updateContext({ role: 'Developer', company: 'Acme Corp' });
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * COMPLETION TRACKING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The hook tracks profile completion percentage based on:
 * - Role (10%)
 * - Company (5%)
 * - Priorities (15%)
 * - Projects (10%)
 * - VIP Emails (15%)
 * - VIP Domains (10%)
 * - Location (10%)
 * - Interests (10%)
 * - Work Hours (15%)
 *
 * This allows showing a "Complete Your Profile" nudge in the UI.
 *
 * @module hooks/useUserContext
 * @since January 2026
 */

'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * User context data structure.
 * Mirrors the user_context table in the database.
 */
export interface UserContext {
  /** Database ID */
  id: string;
  /** User ID (foreign key to auth.users) */
  user_id: string;
  /** Professional role/title */
  role: string | null;
  /** Company name */
  company: string | null;
  /** Ordered list of priorities */
  priorities: string[];
  /** Active project names */
  projects: string[];
  /** VIP email addresses */
  vip_emails: string[];
  /** VIP email domains (e.g., @important.com) */
  vip_domains: string[];
  /** City and state */
  location_city: string | null;
  /** Metro area */
  location_metro: string | null;
  /** Topics of interest */
  interests: string[];
  /** Work day start time (HH:MM) */
  work_hours_start: string | null;
  /** Work day end time (HH:MM) */
  work_hours_end: string | null;
  /** Working days (0=Sun, 1=Mon, ..., 6=Sat) */
  work_days: number[];
  /** Onboarding wizard step (0-7) */
  onboarding_step: number;
  /** Whether onboarding is complete */
  onboarding_completed: boolean;

  // Profile expansion (migration 040)
  /** User's gender */
  gender: string | null;
  /** User's birthday (YYYY-MM-DD) */
  birthday: string | null;
  /** Street address */
  address_street: string | null;
  /** Address city */
  address_city: string | null;
  /** Address state */
  address_state: string | null;
  /** Address ZIP/postal code */
  address_zip: string | null;
  /** Address country */
  address_country: string;
  /** Other cities the user cares about */
  other_cities: Array<{ city: string; tag: string; note?: string }>;
  /** Employment type: employed, self_employed, both */
  employment_type: string;
  /** Additional jobs or side hustles */
  other_jobs: Array<{ role: string; company: string; is_self_employed: boolean }>;
  /** Household members */
  household_members: Array<{
    name: string;
    relationship: string;
    gender?: string | null;
    birthday?: string | null;
    school?: string | null;
  }>;
  /** Pets */
  pets: Array<{ name: string; type: string }>;

  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
}

/**
 * Partial update type for user context.
 * All fields are optional for partial updates.
 */
export type UserContextUpdate = Partial<
  Omit<UserContext, 'id' | 'user_id' | 'created_at' | 'updated_at'>
>;

/**
 * Return type for the useUserContext hook.
 */
export interface UseUserContextReturn {
  /** User context data (null if not loaded) */
  context: UserContext | null;
  /** Loading state */
  isLoading: boolean;
  /** Updating state */
  isUpdating: boolean;
  /** Error message if fetch/update failed */
  error: string | null;
  /** Update context fields */
  updateContext: (updates: UserContextUpdate) => Promise<boolean>;
  /** Re-fetch context from server */
  refetch: () => Promise<void>;
  /** Profile completion percentage (0-100) */
  completionPercent: number;
  /** Whether profile is considered "complete" (>80%) */
  isProfileComplete: boolean;
  /** List of incomplete sections for nudge UI */
  incompleteSections: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLETION CALCULATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Section weights for completion percentage.
 * Total adds up to 100%.
 */
const SECTION_WEIGHTS = {
  role: 8,
  company: 4,
  priorities: 10,
  projects: 8,
  vipEmails: 10,
  vipDomains: 5,
  location: 8,
  interests: 7,
  workHours: 10,
  identity: 5,       // name already collected via Google; gender + birthday
  household: 10,     // household members
  address: 8,        // home address
  work: 7,           // employment type + other jobs
} as const;

/**
 * Calculates profile completion percentage and incomplete sections.
 *
 * @param context - User context data
 * @returns Object with percent and incomplete sections list
 */
function calculateCompletion(context: UserContext | null): {
  percent: number;
  incompleteSections: string[];
} {
  if (!context) {
    return { percent: 0, incompleteSections: Object.keys(SECTION_WEIGHTS) };
  }

  let totalPercent = 0;
  const incomplete: string[] = [];

  // Role
  if (context.role && context.role.trim().length > 0) {
    totalPercent += SECTION_WEIGHTS.role;
  } else {
    incomplete.push('Role');
  }

  // Company
  if (context.company && context.company.trim().length > 0) {
    totalPercent += SECTION_WEIGHTS.company;
  } else {
    incomplete.push('Company');
  }

  // Priorities (need at least 1)
  if (context.priorities && context.priorities.length > 0) {
    totalPercent += SECTION_WEIGHTS.priorities;
  } else {
    incomplete.push('Priorities');
  }

  // Projects (need at least 1)
  if (context.projects && context.projects.length > 0) {
    totalPercent += SECTION_WEIGHTS.projects;
  } else {
    incomplete.push('Projects');
  }

  // VIP Emails (need at least 1)
  if (context.vip_emails && context.vip_emails.length > 0) {
    totalPercent += SECTION_WEIGHTS.vipEmails;
  } else {
    incomplete.push('VIP Contacts');
  }

  // VIP Domains (optional but contributes)
  if (context.vip_domains && context.vip_domains.length > 0) {
    totalPercent += SECTION_WEIGHTS.vipDomains;
  } else {
    incomplete.push('VIP Domains');
  }

  // Location
  if (context.location_city && context.location_city.trim().length > 0) {
    totalPercent += SECTION_WEIGHTS.location;
  } else {
    incomplete.push('Location');
  }

  // Interests (need at least 1)
  if (context.interests && context.interests.length > 0) {
    totalPercent += SECTION_WEIGHTS.interests;
  } else {
    incomplete.push('Interests');
  }

  // Work Hours (need start and end)
  if (
    context.work_hours_start &&
    context.work_hours_end &&
    context.work_days &&
    context.work_days.length > 0
  ) {
    totalPercent += SECTION_WEIGHTS.workHours;
  } else {
    incomplete.push('Work Schedule');
  }

  // Identity (gender or birthday)
  if (context.gender || context.birthday) {
    totalPercent += SECTION_WEIGHTS.identity;
  } else {
    incomplete.push('Identity');
  }

  // Household (at least 1 member)
  if (context.household_members && context.household_members.length > 0) {
    totalPercent += SECTION_WEIGHTS.household;
  } else {
    incomplete.push('Household');
  }

  // Address (need at least city + state)
  if (context.address_city && context.address_state) {
    totalPercent += SECTION_WEIGHTS.address;
  } else {
    incomplete.push('Address');
  }

  // Work details (employment type set explicitly or has other jobs)
  if (
    (context.employment_type && context.employment_type !== 'employed') ||
    (context.other_jobs && context.other_jobs.length > 0)
  ) {
    totalPercent += SECTION_WEIGHTS.work;
  } else {
    incomplete.push('Work Details');
  }

  return { percent: totalPercent, incompleteSections: incomplete };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook to fetch and manage user context for personalized AI analysis.
 *
 * Provides the user's profile data including role, priorities, VIPs, etc.
 * Also calculates profile completion for showing setup nudges.
 *
 * @returns Object with context data, loading state, and management functions
 *
 * @example
 * ```tsx
 * function AboutMeSection() {
 *   const { context, updateContext, completionPercent, isUpdating } = useUserContext();
 *
 *   const handleRoleChange = async (role: string) => {
 *     await updateContext({ role });
 *   };
 *
 *   return (
 *     <div>
 *       <ProgressBar value={completionPercent} />
 *       <Input
 *         value={context?.role || ''}
 *         onChange={(e) => handleRoleChange(e.target.value)}
 *         disabled={isUpdating}
 *       />
 *     </div>
 *   );
 * }
 * ```
 */
export function useUserContext(): UseUserContextReturn {
  const [context, setContext] = useState<UserContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch Context
  // ─────────────────────────────────────────────────────────────────────────────

  const refetch = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch('/api/user/context');

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch user context');
      }

      const data = await response.json();
      // API returns { success: true, data: {...} } format
      setContext(data.data || data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch user context';
      setError(message);
      console.error('Failed to fetch user context:', err);
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Update Context
  // ─────────────────────────────────────────────────────────────────────────────

  const updateContext = useCallback(
    async (updates: UserContextUpdate): Promise<boolean> => {
      setIsUpdating(true);
      setError(null);

      // Optimistic update
      const previousContext = context;
      if (context) {
        setContext({ ...context, ...updates } as UserContext);
      }

      try {
        const response = await fetch('/api/user/context', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to update user context');
        }

        const data = await response.json();
        setContext(data.data || data);
        return true;
      } catch (err) {
        // Rollback on error
        setContext(previousContext);
        const message =
          err instanceof Error ? err.message : 'Failed to update user context';
        setError(message);
        console.error('Failed to update user context:', err);
        return false;
      } finally {
        setIsUpdating(false);
      }
    },
    [context]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Initial Fetch
  // ─────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const fetchContext = async () => {
      setIsLoading(true);
      await refetch();
      setIsLoading(false);
    };

    fetchContext();
  }, [refetch]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Derived Values
  // ─────────────────────────────────────────────────────────────────────────────

  const { percent: completionPercent, incompleteSections } = useMemo(
    () => calculateCompletion(context),
    [context]
  );

  const isProfileComplete = completionPercent >= 80;

  return {
    context,
    isLoading,
    isUpdating,
    error,
    updateContext,
    refetch,
    completionPercent,
    isProfileComplete,
    incompleteSections,
  };
}

export default useUserContext;
