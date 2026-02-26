/**
 * Work Section — Primary Job, Employment Type, Other Hustles, Clients
 *
 * Collects the user's professional context: primary role/company,
 * whether they're employed/self-employed/both, and additional jobs
 * or side hustles. AI suggestions pre-fill role/company.
 *
 * Client identification from email contacts is a future enhancement
 * (noted with TODO). For now, the ClientTaggerAnalyzer handles
 * client detection automatically from email patterns.
 *
 * @module app/onboarding/components/profile/WorkSection
 */

'use client';

import * as React from 'react';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Checkbox,
} from '@/components/ui';
import { Plus, X, Sparkles } from 'lucide-react';
import type { ProfileSuggestions } from '@/types/database';
import type { ProfileData } from '../ProfileStep';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface WorkSectionProps {
  suggestions: ProfileSuggestions | null;
  existingContext: Record<string, unknown> | null;
}

interface OtherJobForm {
  id: string;
  role: string;
  company: string;
  is_self_employed: boolean;
}

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: 'employed', label: 'Employed (work for someone)' },
  { value: 'self_employed', label: 'Self-employed' },
  { value: 'both', label: 'Both (employed + side business)' },
];

let nextJobId = 1;
function generateJobId() {
  return `job-${nextJobId++}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const WorkSection = React.forwardRef<
  { getData: () => Partial<ProfileData> },
  WorkSectionProps
>(function WorkSection({ suggestions, existingContext }, ref) {
  const [role, setRole] = React.useState('');
  const [company, setCompany] = React.useState('');
  const [employmentType, setEmploymentType] = React.useState('employed');
  const [otherJobs, setOtherJobs] = React.useState<OtherJobForm[]>([]);
  const [roleFromAi, setRoleFromAi] = React.useState(false);
  const [companyFromAi, setCompanyFromAi] = React.useState(false);

  // Initialize from existing context or AI suggestions
  React.useEffect(() => {
    const ctx = existingContext as Record<string, unknown> | null;

    // Priority: existing context > AI suggestions > empty
    if (ctx?.role) {
      setRole(ctx.role as string);
    } else if (suggestions?.role?.value) {
      setRole(suggestions.role.value);
      setRoleFromAi(true);
    }

    if (ctx?.company) {
      setCompany(ctx.company as string);
    } else if (suggestions?.company?.value) {
      setCompany(suggestions.company.value);
      setCompanyFromAi(true);
    }

    if (ctx?.employment_type) {
      setEmploymentType(ctx.employment_type as string);
    }

    const existing = ctx?.other_jobs as Array<{
      role: string;
      company: string;
      is_self_employed: boolean;
    }> | undefined;

    if (existing && existing.length > 0) {
      setOtherJobs(
        existing.map((j) => ({
          id: generateJobId(),
          role: j.role,
          company: j.company,
          is_self_employed: j.is_self_employed,
        }))
      );
    }
  }, [existingContext, suggestions]);

  // Expose data collector
  React.useImperativeHandle(ref, () => ({
    getData: (): Partial<ProfileData> => ({
      role: role.trim(),
      company: company.trim(),
      employment_type: employmentType,
      other_jobs: otherJobs
        .filter((j) => j.role.trim())
        .map((j) => ({
          role: j.role.trim(),
          company: j.company.trim(),
          is_self_employed: j.is_self_employed,
        })),
    }),
  }));

  // ─────────────────────────────────────────────────────────────────────────────
  // Other jobs handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const addJob = () => {
    setOtherJobs((prev) => [
      ...prev,
      { id: generateJobId(), role: '', company: '', is_self_employed: false },
    ]);
  };

  const removeJob = (id: string) => {
    setOtherJobs((prev) => prev.filter((j) => j.id !== id));
  };

  const updateJob = (id: string, field: keyof OtherJobForm, value: string | boolean) => {
    setOtherJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, [field]: value } : j))
    );
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Tell us about your work. This helps IdeaBox categorize client emails,
        project updates, and professional correspondence.
      </p>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* PRIMARY JOB */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      <div className="space-y-3">
        <Label className="text-base font-medium">Primary Job</Label>

        <div className="space-y-2">
          {/* Role */}
          <div className="space-y-1">
            <Label className="text-xs">Role / Title</Label>
            <div className="relative">
              <Input
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  setRoleFromAi(false);
                }}
                placeholder="e.g. Software Developer, Marketing Manager"
                className="text-sm pr-8"
              />
              {roleFromAi && role && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2" title="AI-suggested from your emails">
                  <Sparkles className="h-3.5 w-3.5 text-primary/60" />
                </span>
              )}
            </div>
          </div>

          {/* Company */}
          <div className="space-y-1">
            <Label className="text-xs">Company</Label>
            <div className="relative">
              <Input
                value={company}
                onChange={(e) => {
                  setCompany(e.target.value);
                  setCompanyFromAi(false);
                }}
                placeholder="e.g. Acme Corp, Self-employed, My Agency Name"
                className="text-sm pr-8"
              />
              {companyFromAi && company && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2" title="AI-suggested from your emails">
                  <Sparkles className="h-3.5 w-3.5 text-primary/60" />
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* EMPLOYMENT TYPE */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      <div className="space-y-2">
        <Label>Employment Type</Label>
        <Select value={employmentType} onValueChange={setEmploymentType}>
          <SelectTrigger className="max-w-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EMPLOYMENT_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* OTHER JOBS / HUSTLES */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      <div className="space-y-3 pt-2 border-t border-border/30">
        <Label className="text-base font-medium">Other Jobs or Side Hustles</Label>
        <p className="text-xs text-muted-foreground">
          Freelance work, consulting, a side business — anything that generates email.
        </p>

        {otherJobs.map((job) => (
          <div key={job.id} className="border border-border/50 rounded-lg p-3 space-y-2 relative">
            <button
              onClick={() => removeJob(job.id)}
              className="absolute top-2 right-2 text-muted-foreground hover:text-destructive transition-colors"
              aria-label="Remove job"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Role</Label>
                <Input
                  value={job.role}
                  onChange={(e) => updateJob(job.id, 'role', e.target.value)}
                  placeholder="Role or description"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Company / Client</Label>
                <Input
                  value={job.company}
                  onChange={(e) => updateJob(job.id, 'company', e.target.value)}
                  placeholder="Company name"
                  className="h-8 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id={`self-employed-${job.id}`}
                checked={job.is_self_employed}
                onCheckedChange={(checked) => updateJob(job.id, 'is_self_employed', !!checked)}
              />
              <Label htmlFor={`self-employed-${job.id}`} className="text-xs font-normal cursor-pointer">
                This is self-employed / freelance work
              </Label>
            </div>
          </div>
        ))}

        <Button variant="outline" size="sm" onClick={addJob} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Add job or hustle
        </Button>
      </div>

      {/* TODO: Client suggestions from email contacts — future enhancement.
          For now, clients are auto-detected by the ClientTaggerAnalyzer
          during email processing. A dedicated client picker from contacts
          could be added here to let users pre-identify clients. */}
    </div>
  );
});

export default WorkSection;
