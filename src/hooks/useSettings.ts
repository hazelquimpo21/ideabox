/**
 * useSettings Hook
 *
 * Manages user settings with optimistic updates.
 * Handles AI analysis settings, cost limits, and notification preferences.
 *
 * @example
 * ```tsx
 * const { settings, updateSettings, isLoading, error } = useSettings();
 *
 * // Update a single setting
 * await updateSettings({ auto_analyze: false });
 *
 * // Update multiple settings
 * await updateSettings({
 *   daily_cost_limit: 2.00,
 *   monthly_cost_limit: 20.00,
 * });
 * ```
 *
 * @module hooks/useSettings
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import type { UserSettings, CostUsageSummary } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface UsageData {
  daily: {
    cost: number;
    limit: number;
    percent: number;
    remaining: number;
  };
  monthly: {
    cost: number;
    limit: number;
    percent: number;
    remaining: number;
  };
  is_paused: boolean;
  is_over_daily_limit: boolean;
  is_over_monthly_limit: boolean;
  breakdown: Record<string, { count: number; cost: number; tokens: number }>;
  recent_count: number;
}

export interface UseSettingsReturn {
  // Settings data
  settings: UserSettings | null;
  usage: UsageData | null;

  // State
  isLoading: boolean;
  isUpdating: boolean;
  error: string | null;

  // Actions
  updateSettings: (updates: Partial<UserSettings>) => Promise<void>;
  refreshSettings: () => Promise<void>;
  refreshUsage: () => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT VALUES
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_SETTINGS: Partial<UserSettings> = {
  auto_analyze: true,
  extract_actions: true,
  categorize_emails: true,
  detect_clients: true,
  initial_sync_email_count: 50,
  max_emails_per_sync: 100,
  max_analysis_per_sync: 50,
  daily_cost_limit: 1.0,
  monthly_cost_limit: 10.0,
  cost_alert_threshold: 0.8,
  pause_on_limit_reached: false,
  email_digest_enabled: true,
  email_digest_frequency: 'daily',
  action_reminders: true,
  new_client_alerts: true,
  sync_error_alerts: true,
  cost_limit_alerts: true,
};

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch Settings
  // ─────────────────────────────────────────────────────────────────────────────

  const refreshSettings = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch('/api/settings');

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch settings');
      }

      const data = await response.json();
      setSettings(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch settings';
      setError(message);
      console.error('Failed to fetch settings:', err);
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch Usage
  // ─────────────────────────────────────────────────────────────────────────────

  const refreshUsage = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/usage');

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch usage');
      }

      const data = await response.json();
      setUsage(data);
    } catch (err) {
      console.error('Failed to fetch usage:', err);
      // Don't set error for usage - it's not critical
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Update Settings
  // ─────────────────────────────────────────────────────────────────────────────

  const updateSettings = useCallback(
    async (updates: Partial<UserSettings>) => {
      if (!settings) return;

      setIsUpdating(true);
      setError(null);

      // Optimistic update
      const previousSettings = settings;
      setSettings({ ...settings, ...updates } as UserSettings);

      try {
        const response = await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to update settings');
        }

        const data = await response.json();
        setSettings(data);

        // Refresh usage if cost limits changed
        if (
          'daily_cost_limit' in updates ||
          'monthly_cost_limit' in updates
        ) {
          refreshUsage();
        }
      } catch (err) {
        // Rollback on error
        setSettings(previousSettings);
        const message = err instanceof Error ? err.message : 'Failed to update settings';
        setError(message);
        console.error('Failed to update settings:', err);
        throw err;
      } finally {
        setIsUpdating(false);
      }
    },
    [settings, refreshUsage]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Initial Fetch
  // ─────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const fetchAll = async () => {
      setIsLoading(true);
      await Promise.all([refreshSettings(), refreshUsage()]);
      setIsLoading(false);
    };

    fetchAll();
  }, [refreshSettings, refreshUsage]);

  return {
    settings,
    usage,
    isLoading,
    isUpdating,
    error,
    updateSettings,
    refreshSettings,
    refreshUsage,
  };
}

export default useSettings;
