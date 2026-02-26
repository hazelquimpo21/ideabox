/**
 * Identity Section — Name, Gender, Birthday
 *
 * Pre-fills name from Google account. Gender and birthday are new fields.
 * All fields are optional and editable.
 *
 * @module app/onboarding/components/profile/IdentitySection
 */

'use client';

import * as React from 'react';
import { Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import type { AuthUser } from '@/lib/auth';
import type { ProfileData } from '../ProfileStep';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface IdentitySectionProps {
  user: AuthUser;
  existingContext: Record<string, unknown> | null;
}

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const IdentitySection = React.forwardRef<
  { getData: () => Partial<ProfileData> },
  IdentitySectionProps
>(function IdentitySection({ user, existingContext }, ref) {
  const [fullName, setFullName] = React.useState('');
  const [gender, setGender] = React.useState<string>('');
  const [birthday, setBirthday] = React.useState('');

  // Initialize from existing context or Google account
  React.useEffect(() => {
    const ctx = existingContext as Record<string, string | null> | null;
    setFullName(ctx?.full_name ?? user.name ?? '');
    setGender((ctx?.gender as string) ?? '');
    setBirthday((ctx?.birthday as string) ?? '');
  }, [existingContext, user.name]);

  // Expose data collector
  React.useImperativeHandle(ref, () => ({
    getData: (): Partial<ProfileData> => ({
      full_name: fullName.trim(),
      gender: gender || null,
      birthday: birthday || null,
    }),
  }));

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Confirm your basic info. Your name was pulled from your Google account.
      </p>

      {/* Full Name */}
      <div className="space-y-2">
        <Label htmlFor="profile-name">Full Name</Label>
        <Input
          id="profile-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Your full name"
          className="max-w-sm"
        />
      </div>

      {/* Gender */}
      <div className="space-y-2">
        <Label htmlFor="profile-gender">Gender <span className="text-muted-foreground text-xs">(optional)</span></Label>
        <Select value={gender} onValueChange={setGender}>
          <SelectTrigger className="max-w-sm" id="profile-gender">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {GENDER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Birthday */}
      <div className="space-y-2">
        <Label htmlFor="profile-birthday">Birthday <span className="text-muted-foreground text-xs">(optional)</span></Label>
        <Input
          id="profile-birthday"
          type="date"
          value={birthday}
          onChange={(e) => setBirthday(e.target.value)}
          className="max-w-sm"
        />
      </div>
    </div>
  );
});

export default IdentitySection;
