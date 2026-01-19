/**
 * Projects Step Component
 *
 * Step 3 of 7 in the user context onboarding wizard.
 * Collects user's active project names.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * PURPOSE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Project names help the AI:
 * - Link emails to specific projects for better organization
 * - Identify project-related emails from subject lines and content
 * - Provide context for action items and priorities
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * INTERACTION
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - User types project name and presses Enter or clicks Add
 * - Projects appear as removable tags
 * - Optional step - users can continue without adding any projects
 *
 * @module components/onboarding/ProjectsStep
 * @version 1.0.0
 * @since January 2026
 */

'use client';

import * as React from 'react';
import { Button, Input, Label, Badge } from '@/components/ui';
import { FolderKanban, Plus, X } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('ProjectsStep');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Props for the ProjectsStep component.
 */
export interface ProjectsStepProps {
  /** Currently added projects */
  projects: string[];
  /** Callback when projects change */
  onDataChange: (data: { projects: string[] }) => void;
  /** Callback to proceed to next step */
  onNext: () => void;
  /** Callback to go back to previous step */
  onBack: () => void;
  /** Whether this is the first step */
  isFirstStep: boolean;
  /** Whether this is the last step */
  isLastStep: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maximum number of projects allowed.
 */
const MAX_PROJECTS = 20;

/**
 * Maximum length for a single project name.
 */
const MAX_PROJECT_LENGTH = 100;

/**
 * Example project names to inspire users.
 */
const PROJECT_EXAMPLES = [
  'Website Redesign',
  'Q1 Marketing Campaign',
  'Mobile App v2',
  'Client Onboarding',
  'Internal Tools',
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ProjectsStep - Collects user's active project names.
 *
 * @example
 * ```tsx
 * <ProjectsStep
 *   projects={data.projects}
 *   onDataChange={(d) => setData(prev => ({ ...prev, ...d }))}
 *   onNext={handleNext}
 *   onBack={handleBack}
 *   isFirstStep={false}
 *   isLastStep={false}
 * />
 * ```
 */
export function ProjectsStep({
  projects,
  onDataChange,
  onNext,
  onBack,
  isFirstStep,
  isLastStep,
}: ProjectsStepProps) {
  // ─────────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────────
  const [inputValue, setInputValue] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Validates and adds a new project to the list.
   */
  const handleAddProject = React.useCallback(() => {
    const trimmed = inputValue.trim();

    // Clear any previous errors
    setError(null);

    // Validation checks
    if (!trimmed) {
      logger.debug('Empty project name, ignoring');
      return;
    }

    if (trimmed.length > MAX_PROJECT_LENGTH) {
      const message = `Project name must be ${MAX_PROJECT_LENGTH} characters or less`;
      logger.warn('Project name too long', { length: trimmed.length });
      setError(message);
      return;
    }

    if (projects.length >= MAX_PROJECTS) {
      const message = `Maximum ${MAX_PROJECTS} projects allowed`;
      logger.warn('Max projects reached');
      setError(message);
      return;
    }

    // Check for duplicates (case-insensitive)
    const normalizedNew = trimmed.toLowerCase();
    const isDuplicate = projects.some((p) => p.toLowerCase() === normalizedNew);
    if (isDuplicate) {
      const message = 'This project is already in your list';
      logger.debug('Duplicate project', { project: trimmed });
      setError(message);
      return;
    }

    // Add the project
    const newProjects = [...projects, trimmed];
    logger.debug('Project added', { project: trimmed, total: newProjects.length });
    onDataChange({ projects: newProjects });
    setInputValue('');
  }, [inputValue, projects, onDataChange]);

  /**
   * Handles keyboard events in the input field.
   * Adds project on Enter key.
   */
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddProject();
      }
    },
    [handleAddProject]
  );

  /**
   * Handles input value change.
   */
  const handleInputChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
      // Clear error when user starts typing
      if (error) {
        setError(null);
      }
    },
    [error]
  );

  /**
   * Removes a project from the list.
   */
  const handleRemoveProject = React.useCallback(
    (projectToRemove: string) => {
      const newProjects = projects.filter((p) => p !== projectToRemove);
      logger.debug('Project removed', { project: projectToRemove, remaining: newProjects.length });
      onDataChange({ projects: newProjects });
    },
    [projects, onDataChange]
  );

  /**
   * Handles continue button click.
   */
  const handleContinue = React.useCallback(() => {
    logger.info('ProjectsStep completed', { projectCount: projects.length });
    onNext();
  }, [projects.length, onNext]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────────────────────────────────────
          Header
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="text-center space-y-2">
        <div className="w-12 h-12 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
          <FolderKanban className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">What projects are you working on?</h2>
        <p className="text-muted-foreground">
          Add your active projects so we can link related emails.
          <br />
          <span className="text-sm">This step is optional.</span>
        </p>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          Project Input
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <Label htmlFor="project-input" className="text-base">
          Add a project
        </Label>

        <div className="flex gap-2">
          <Input
            id="project-input"
            type="text"
            placeholder="e.g., Website Redesign"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            maxLength={MAX_PROJECT_LENGTH}
            className={error ? 'border-destructive' : ''}
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleAddProject}
            disabled={!inputValue.trim() || projects.length >= MAX_PROJECTS}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>

        {/* Error message */}
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {/* Helper text */}
        <p className="text-xs text-muted-foreground">
          Press Enter to add. Examples: {PROJECT_EXAMPLES.slice(0, 3).join(', ')}
        </p>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          Project List
          ───────────────────────────────────────────────────────────────────────── */}
      {projects.length > 0 && (
        <div className="space-y-3">
          <Label className="text-base">
            Your projects ({projects.length}/{MAX_PROJECTS})
          </Label>

          <div className="flex flex-wrap gap-2">
            {projects.map((project) => (
              <Badge
                key={project}
                variant="secondary"
                className="text-sm py-1.5 px-3 flex items-center gap-2"
              >
                <FolderKanban className="h-3.5 w-3.5" />
                {project}
                <button
                  type="button"
                  onClick={() => handleRemoveProject(project)}
                  className="ml-1 hover:text-destructive transition-colors"
                  aria-label={`Remove ${project}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          Empty State
          ───────────────────────────────────────────────────────────────────────── */}
      {projects.length === 0 && (
        <div className="text-center py-6 bg-muted/30 rounded-lg">
          <FolderKanban className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No projects added yet. Add some to help organize your emails!
          </p>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          Navigation
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="flex justify-between pt-4">
        {!isFirstStep ? (
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
        ) : (
          <div />
        )}
        <div className="flex gap-2">
          {projects.length === 0 && (
            <Button variant="ghost" onClick={handleContinue}>
              Skip
            </Button>
          )}
          <Button onClick={handleContinue}>
            {isLastStep ? 'Finish' : 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ProjectsStep;
