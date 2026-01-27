/**
 * Email Templates Hook
 *
 * React hook for fetching and managing email templates.
 * Provides CRUD operations and merge field extraction.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Fetches templates with category filtering
 * - Provides merge field detection
 * - Supports CRUD operations
 * - Tracks template usage statistics
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 * ```tsx
 * // Basic usage
 * const { templates, isLoading, createTemplate } = useTemplates();
 *
 * // With category filter
 * const { templates } = useTemplates({ category: 'follow_up' });
 * ```
 *
 * @module hooks/useTemplates
 */

'use client';

import * as React from 'react';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Logger instance for this hook */
const logger = createLogger('useTemplates');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Template data from the API.
 */
export interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  subject_template: string;
  body_html_template: string;
  body_text_template: string | null;
  merge_fields: string[];
  times_used: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Template statistics.
 */
export interface TemplateStats {
  total: number;
  byCategory: Record<string, number>;
}

/**
 * Options for filtering templates.
 */
export interface UseTemplatesOptions {
  /** Filter by category */
  category?: string;
}

/**
 * Create template request data.
 */
export interface CreateTemplateData {
  name: string;
  description?: string;
  category?: string;
  subjectTemplate: string;
  bodyHtmlTemplate: string;
  bodyTextTemplate?: string;
  mergeFields?: string[];
}

/**
 * Update template request data.
 */
export interface UpdateTemplateData {
  name?: string;
  description?: string | null;
  category?: string | null;
  subjectTemplate?: string;
  bodyHtmlTemplate?: string;
  bodyTextTemplate?: string | null;
  mergeFields?: string[];
}

/**
 * Return value from the useTemplates hook.
 */
export interface UseTemplatesReturn {
  /** Array of template objects */
  templates: Template[];
  /** Loading state */
  isLoading: boolean;
  /** Error object if fetch failed */
  error: Error | null;
  /** Template statistics */
  stats: TemplateStats;
  /** Unique categories from templates */
  categories: string[];
  /** Refetch templates */
  refetch: () => Promise<void>;
  /** Create a new template */
  createTemplate: (data: CreateTemplateData) => Promise<Template | null>;
  /** Update an existing template */
  updateTemplate: (id: string, data: UpdateTemplateData) => Promise<boolean>;
  /** Delete a template */
  deleteTemplate: (id: string) => Promise<boolean>;
  /** Get a single template */
  getTemplate: (id: string) => Template | undefined;
  /** Duplicate a template */
  duplicateTemplate: (id: string, newName?: string) => Promise<Template | null>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculates template statistics from an array of templates.
 */
function calculateStats(templates: Template[]): TemplateStats {
  const byCategory: Record<string, number> = {};

  for (const template of templates) {
    const category = template.category || 'uncategorized';
    byCategory[category] = (byCategory[category] || 0) + 1;
  }

  return {
    total: templates.length,
    byCategory,
  };
}

/**
 * Extracts unique categories from templates.
 */
function extractCategories(templates: Template[]): string[] {
  const categories = new Set<string>();
  for (const template of templates) {
    if (template.category) {
      categories.add(template.category);
    }
  }
  return Array.from(categories).sort();
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook for fetching and managing email templates.
 *
 * @param options - Filtering options
 * @returns Template data, loading state, and control functions
 */
export function useTemplates(options: UseTemplatesOptions = {}): UseTemplatesReturn {
  // ───────────────────────────────────────────────────────────────────────────
  // State
  // ───────────────────────────────────────────────────────────────────────────

  const [templates, setTemplates] = React.useState<Template[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);
  const [stats, setStats] = React.useState<TemplateStats>({
    total: 0,
    byCategory: {},
  });
  const [categories, setCategories] = React.useState<string[]>([]);

  // Destructure options
  const { category } = options;

  // ───────────────────────────────────────────────────────────────────────────
  // Fetch Templates
  // ───────────────────────────────────────────────────────────────────────────

  const fetchTemplates = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);

    logger.start('Fetching templates', { category });

    try {
      let url = '/api/templates';
      if (category) {
        url += `?category=${encodeURIComponent(category)}`;
      }

      const response = await fetch(url);
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to fetch templates');
      }

      const fetchedTemplates = result.data.templates || [];
      setTemplates(fetchedTemplates);
      setStats(calculateStats(fetchedTemplates));
      setCategories(extractCategories(fetchedTemplates));

      logger.success('Templates fetched', { count: fetchedTemplates.length });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to fetch templates', { error: errorMessage });
      setError(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setIsLoading(false);
    }
  }, [category]);

  // ───────────────────────────────────────────────────────────────────────────
  // Create Template
  // ───────────────────────────────────────────────────────────────────────────

  const createTemplate = React.useCallback(
    async (data: CreateTemplateData): Promise<Template | null> => {
      logger.start('Creating template', { name: data.name });

      try {
        const response = await fetch('/api/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to create template');
        }

        const template = result.data.template;
        logger.success('Template created', { id: template.id });

        // Add to local state
        setTemplates((prev) => [template, ...prev]);
        setStats((prev) => ({
          total: prev.total + 1,
          byCategory: {
            ...prev.byCategory,
            [template.category || 'uncategorized']:
              (prev.byCategory[template.category || 'uncategorized'] || 0) + 1,
          },
        }));

        return template;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Failed to create template', { error: errorMessage });
        setError(err instanceof Error ? err : new Error(errorMessage));
        return null;
      }
    },
    []
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Update Template
  // ───────────────────────────────────────────────────────────────────────────

  const updateTemplate = React.useCallback(
    async (id: string, data: UpdateTemplateData): Promise<boolean> => {
      logger.start('Updating template', { id: id.substring(0, 8) });

      const originalTemplate = templates.find((t) => t.id === id);
      if (!originalTemplate) {
        logger.warn('Template not found for update', { id: id.substring(0, 8) });
        return false;
      }

      // Optimistic update
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                ...(data.name !== undefined && { name: data.name }),
                ...(data.description !== undefined && { description: data.description }),
                ...(data.category !== undefined && { category: data.category }),
                ...(data.subjectTemplate !== undefined && { subject_template: data.subjectTemplate }),
                ...(data.bodyHtmlTemplate !== undefined && { body_html_template: data.bodyHtmlTemplate }),
                ...(data.bodyTextTemplate !== undefined && { body_text_template: data.bodyTextTemplate }),
                ...(data.mergeFields !== undefined && { merge_fields: data.mergeFields }),
              }
            : t
        )
      );

      try {
        const response = await fetch(`/api/templates/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to update template');
        }

        logger.success('Template updated', { id: id.substring(0, 8) });

        // Update with actual data from server
        setTemplates((prev) =>
          prev.map((t) => (t.id === id ? result.data.template : t))
        );

        return true;
      } catch (err) {
        // Revert on error
        setTemplates((prev) =>
          prev.map((t) => (t.id === id ? originalTemplate : t))
        );

        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Failed to update template', { error: errorMessage });
        setError(err instanceof Error ? err : new Error(errorMessage));
        return false;
      }
    },
    [templates]
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Delete Template
  // ───────────────────────────────────────────────────────────────────────────

  const deleteTemplate = React.useCallback(
    async (id: string): Promise<boolean> => {
      logger.start('Deleting template', { id: id.substring(0, 8) });

      const originalTemplates = [...templates];

      // Optimistic removal
      setTemplates((prev) => prev.filter((t) => t.id !== id));

      try {
        const response = await fetch(`/api/templates/${id}`, {
          method: 'DELETE',
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to delete template');
        }

        logger.success('Template deleted', { id: id.substring(0, 8) });

        // Update stats
        setStats(calculateStats(templates.filter((t) => t.id !== id)));

        return true;
      } catch (err) {
        // Revert on error
        setTemplates(originalTemplates);

        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Failed to delete template', { error: errorMessage });
        setError(err instanceof Error ? err : new Error(errorMessage));
        return false;
      }
    },
    [templates]
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Get Single Template
  // ───────────────────────────────────────────────────────────────────────────

  const getTemplate = React.useCallback(
    (id: string): Template | undefined => {
      return templates.find((t) => t.id === id);
    },
    [templates]
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Duplicate Template
  // ───────────────────────────────────────────────────────────────────────────

  const duplicateTemplate = React.useCallback(
    async (id: string, newName?: string): Promise<Template | null> => {
      logger.start('Duplicating template', { id: id.substring(0, 8) });

      const original = templates.find((t) => t.id === id);
      if (!original) {
        logger.warn('Template not found for duplication', { id: id.substring(0, 8) });
        return null;
      }

      return createTemplate({
        name: newName || `${original.name} (Copy)`,
        description: original.description || undefined,
        category: original.category || undefined,
        subjectTemplate: original.subject_template,
        bodyHtmlTemplate: original.body_html_template,
        bodyTextTemplate: original.body_text_template || undefined,
        mergeFields: original.merge_fields,
      });
    },
    [templates, createTemplate]
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Effects
  // ───────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // ───────────────────────────────────────────────────────────────────────────
  // Return
  // ───────────────────────────────────────────────────────────────────────────

  return {
    templates,
    isLoading,
    error,
    stats,
    categories,
    refetch: fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    getTemplate,
    duplicateTemplate,
  };
}

export default useTemplates;
