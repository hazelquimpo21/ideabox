/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type issues with profile_suggestions JSONB
/**
 * Profile Step — Multi-Section Profile Collection for Onboarding
 *
 * Replaces the single-card MadLibsProfileStep with a tabbed, multi-section
 * profile editor. Each section focuses on one area of the user's life context.
 *
 * SECTIONS:
 * 1. You — name, gender, birthday (pre-filled from Google)
 * 2. Household — family members, pets
 * 3. Where You Live — address, other cities
 * 4. Work — primary job, other hustles, employment type, clients
 * 5. Schedule & Priorities — work hours, priorities (from old Mad Libs)
 *
 * DATA FLOW:
 * - On mount, fetches existing user_context + AI profile suggestions
 * - Each section manages its own local state
 * - On "Save & Continue", all sections' data is persisted to user_context
 * - "Skip for now" advances without saving
 *
 * @module app/onboarding/components/ProfileStep
 */

'use client';

import * as React from 'react';
import { Button, Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui';
import { createLogger } from '@/lib/utils/logger';
import type { AuthUser } from '@/lib/auth';
import type { ProfileSuggestions } from '@/types/database';
import {
  ArrowRight,
  ArrowLeft,
  Sparkles,
  User,
  Home,
  MapPin,
  Briefcase,
  Clock,
  Check,
} from 'lucide-react';
import { IdentitySection } from './profile/IdentitySection';
import { HouseholdSection } from './profile/HouseholdSection';
import { LocationSection } from './profile/LocationSection';
import { WorkSection } from './profile/WorkSection';
import { ScheduleSection } from './profile/ScheduleSection';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('ProfileStep');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ProfileStepProps {
  user: AuthUser;
  onNext: () => void;
  onBack: () => void;
  isFirstStep?: boolean;
  isLastStep?: boolean;
}

/** Collects all profile data from sub-sections for saving. */
export interface ProfileData {
  // Identity
  full_name: string;
  gender: string | null;
  birthday: string | null;

  // Household
  household_members: Array<{
    name: string;
    relationship: string;
    gender?: string | null;
    birthday?: string | null;
    school?: string | null;
  }>;
  pets: Array<{ name: string; type: string }>;

  // Location
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  other_cities: Array<{ city: string; tag: string; note?: string }>;

  // Work
  role: string;
  company: string;
  employment_type: string;
  other_jobs: Array<{ role: string; company: string; is_self_employed: boolean }>;

  // Schedule
  priorities: string[];
  work_hours_start: string;
  work_hours_end: string;
  work_days: number[];
  vip_emails: string[];
}

type SectionId = 'you' | 'household' | 'location' | 'work' | 'schedule';

interface SectionConfig {
  id: SectionId;
  label: string;
  icon: React.ReactNode;
}

const SECTIONS: SectionConfig[] = [
  { id: 'you', label: 'You', icon: <User className="h-4 w-4" /> },
  { id: 'household', label: 'Household', icon: <Home className="h-4 w-4" /> },
  { id: 'location', label: 'Location', icon: <MapPin className="h-4 w-4" /> },
  { id: 'work', label: 'Work', icon: <Briefcase className="h-4 w-4" /> },
  { id: 'schedule', label: 'Schedule', icon: <Clock className="h-4 w-4" /> },
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function ProfileStep({
  user,
  onNext,
  onBack,
  isFirstStep = false,
  isLastStep = false,
}: ProfileStepProps) {
  // ─────────────────────────────────────────────────────────────────────────────
  // State: AI suggestions + existing context
  // ─────────────────────────────────────────────────────────────────────────────

  const [suggestions, setSuggestions] = React.useState<ProfileSuggestions | null>(null);
  const [existingContext, setExistingContext] = React.useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<SectionId>('you');

  // Track which sections the user has visited/edited
  const [visitedSections, setVisitedSections] = React.useState<Set<SectionId>>(new Set(['you']));

  // ─────────────────────────────────────────────────────────────────────────────
  // Refs for collecting data from each section
  // ─────────────────────────────────────────────────────────────────────────────

  const identityRef = React.useRef<{ getData: () => Partial<ProfileData> }>(null);
  const householdRef = React.useRef<{ getData: () => Partial<ProfileData> }>(null);
  const locationRef = React.useRef<{ getData: () => Partial<ProfileData> }>(null);
  const workRef = React.useRef<{ getData: () => Partial<ProfileData> }>(null);
  const scheduleRef = React.useRef<{ getData: () => Partial<ProfileData> }>(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch data on mount
  // ─────────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      logger.start('Fetching profile data', { userId: user.id.substring(0, 8) });

      try {
        const [suggestionsRes, contextRes] = await Promise.allSettled([
          fetch('/api/onboarding/profile-suggestions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          }),
          fetch('/api/user/context'),
        ]);

        if (cancelled) return;

        // Process suggestions
        if (suggestionsRes.status === 'fulfilled' && suggestionsRes.value.ok) {
          const result = await suggestionsRes.value.json();
          setSuggestions(result.data as ProfileSuggestions);
          logger.debug('Profile suggestions loaded', {
            emailsAnalyzed: result.data?.meta?.emailsAnalyzed ?? 0,
          });
        }

        // Process existing context
        if (contextRes.status === 'fulfilled' && contextRes.value.ok) {
          const result = await contextRes.value.json();
          const ctx = result.data ?? result;
          setExistingContext(ctx);
          logger.debug('Existing context loaded', {
            hasRole: !!ctx.role,
            hasHousehold: (ctx.household_members?.length ?? 0) > 0,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to fetch profile data', { error: message });
      }
    }

    setLoading(true);
    fetchData().finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [user.id]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Tab change handler
  // ─────────────────────────────────────────────────────────────────────────────

  const handleTabChange = React.useCallback((value: string) => {
    const section = value as SectionId;
    setActiveTab(section);
    setVisitedSections((prev) => new Set(prev).add(section));
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Save all sections and advance
  // ─────────────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setIsSaving(true);
    logger.start('Saving profile data', { userId: user.id.substring(0, 8) });

    try {
      // Collect data from all sections
      const identity = identityRef.current?.getData() ?? {};
      const household = householdRef.current?.getData() ?? {};
      const location = locationRef.current?.getData() ?? {};
      const work = workRef.current?.getData() ?? {};
      const schedule = scheduleRef.current?.getData() ?? {};

      // Merge into a single payload, filtering out empty values
      const payload: Record<string, unknown> = {};

      // Identity
      if (identity.full_name) payload.full_name = identity.full_name;
      if (identity.gender) payload.gender = identity.gender;
      if (identity.birthday) payload.birthday = identity.birthday;

      // Household
      if (household.household_members && household.household_members.length > 0) {
        payload.household_members = household.household_members;
      }
      if (household.pets && household.pets.length > 0) {
        payload.pets = household.pets;
      }

      // Location
      if (location.address_street) payload.address_street = location.address_street;
      if (location.address_city) payload.address_city = location.address_city;
      if (location.address_state) payload.address_state = location.address_state;
      if (location.address_zip) payload.address_zip = location.address_zip;
      if (location.other_cities && location.other_cities.length > 0) {
        payload.other_cities = location.other_cities;
      }
      // Also set location_city for AI analyzers (existing field)
      if (location.address_city && location.address_state) {
        payload.location_city = `${location.address_city}, ${location.address_state}`;
      }

      // Work
      if (work.role) payload.role = work.role;
      if (work.company) payload.company = work.company;
      if (work.employment_type) payload.employment_type = work.employment_type;
      if (work.other_jobs && work.other_jobs.length > 0) {
        payload.other_jobs = work.other_jobs;
      }

      // Schedule
      if (schedule.priorities && schedule.priorities.length > 0) {
        payload.priorities = schedule.priorities;
      }
      if (schedule.work_hours_start) payload.work_hours_start = schedule.work_hours_start;
      if (schedule.work_hours_end) payload.work_hours_end = schedule.work_hours_end;
      if (schedule.work_days && schedule.work_days.length > 0) {
        payload.work_days = schedule.work_days;
      }
      if (schedule.vip_emails && schedule.vip_emails.length > 0) {
        payload.vip_emails = schedule.vip_emails;
      }

      if (Object.keys(payload).length > 0) {
        logger.info('Saving profile to user context', {
          fields: Object.keys(payload),
          userId: user.id.substring(0, 8),
        });

        const response = await fetch('/api/user/context', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          logger.warn('Failed to save profile', { status: response.status });
        } else {
          logger.success('Profile saved', {
            fieldsCount: Object.keys(payload).length,
          });
        }
      }

      onNext();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error saving profile', { error: message });
      onNext(); // Don't block onboarding
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    logger.info('User skipped profile step');
    onNext();
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: Loading state
  // ─────────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
            <Sparkles className="h-6 w-6 text-primary animate-pulse" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Building your profile...</h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Analyzing your emails to pre-fill your profile. This only takes a moment.
          </p>
        </div>
        <div className="h-64 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: Main profile editor
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
          <User className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Your Profile</h2>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          Tell us about yourself so IdeaBox can organize your email intelligently.
          All fields are optional — fill in what you like.
        </p>
      </div>

      {/* Tabbed sections */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="w-full grid grid-cols-5 h-auto">
          {SECTIONS.map((section) => (
            <TabsTrigger
              key={section.id}
              value={section.id}
              className="flex flex-col items-center gap-1 py-2 px-1 text-xs relative"
            >
              {section.icon}
              <span>{section.label}</span>
              {visitedSections.has(section.id) && section.id !== activeTab && (
                <span className="absolute top-1 right-1">
                  <Check className="h-3 w-3 text-primary/60" />
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-4 min-h-[320px]">
          <TabsContent value="you" className="mt-0">
            <IdentitySection
              ref={identityRef}
              user={user}
              existingContext={existingContext}
            />
          </TabsContent>

          <TabsContent value="household" className="mt-0">
            <HouseholdSection
              ref={householdRef}
              existingContext={existingContext}
            />
          </TabsContent>

          <TabsContent value="location" className="mt-0">
            <LocationSection
              ref={locationRef}
              existingContext={existingContext}
            />
          </TabsContent>

          <TabsContent value="work" className="mt-0">
            <WorkSection
              ref={workRef}
              suggestions={suggestions}
              existingContext={existingContext}
            />
          </TabsContent>

          <TabsContent value="schedule" className="mt-0">
            <ScheduleSection
              ref={scheduleRef}
              suggestions={suggestions}
              existingContext={existingContext}
            />
          </TabsContent>
        </div>
      </Tabs>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4">
        <Button variant="ghost" onClick={onBack} disabled={isFirstStep}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={handleSkip} disabled={isSaving}>
            Skip for now
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Sparkles className="h-4 w-4 mr-2 animate-pulse" />
                Saving...
              </>
            ) : (
              <>
                {isLastStep ? 'Finish Setup' : 'Save & Continue'}
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ProfileStep;
