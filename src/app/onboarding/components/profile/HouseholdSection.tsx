/**
 * Household Section — Family Members & Pets
 *
 * Dynamic list of household members with relationship type, gender,
 * birthday, and school (for kids). Plus pets.
 *
 * @module app/onboarding/components/profile/HouseholdSection
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
} from '@/components/ui';
import { Plus, X } from 'lucide-react';
import type { ProfileData } from '../ProfileStep';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface HouseholdSectionProps {
  existingContext: Record<string, unknown> | null;
}

interface MemberForm {
  id: string;
  name: string;
  relationship: string;
  gender: string;
  birthday: string;
  school: string;
}

interface PetForm {
  id: string;
  name: string;
  type: string;
}

const RELATIONSHIP_OPTIONS = [
  { value: 'spouse', label: 'Spouse' },
  { value: 'partner', label: 'Partner' },
  { value: 'child', label: 'Child' },
  { value: 'parent', label: 'Parent' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'roommate', label: 'Roommate' },
  { value: 'other', label: 'Other' },
];

const PET_TYPE_OPTIONS = [
  { value: 'dog', label: 'Dog' },
  { value: 'cat', label: 'Cat' },
  { value: 'bird', label: 'Bird' },
  { value: 'fish', label: 'Fish' },
  { value: 'rabbit', label: 'Rabbit' },
  { value: 'hamster', label: 'Hamster' },
  { value: 'reptile', label: 'Reptile' },
  { value: 'other', label: 'Other' },
];

let nextId = 1;
function generateId() {
  return `member-${nextId++}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const HouseholdSection = React.forwardRef<
  { getData: () => Partial<ProfileData> },
  HouseholdSectionProps
>(function HouseholdSection({ existingContext }, ref) {
  const [members, setMembers] = React.useState<MemberForm[]>([]);
  const [pets, setPets] = React.useState<PetForm[]>([]);

  // Initialize from existing context
  React.useEffect(() => {
    if (!existingContext) return;

    const existing = existingContext.household_members as Array<{
      name: string;
      relationship: string;
      gender?: string | null;
      birthday?: string | null;
      school?: string | null;
    }> | undefined;

    if (existing && existing.length > 0) {
      setMembers(
        existing.map((m) => ({
          id: generateId(),
          name: m.name,
          relationship: m.relationship,
          gender: m.gender ?? '',
          birthday: m.birthday ?? '',
          school: m.school ?? '',
        }))
      );
    }

    const existingPets = existingContext.pets as Array<{
      name: string;
      type: string;
    }> | undefined;

    if (existingPets && existingPets.length > 0) {
      setPets(
        existingPets.map((p) => ({
          id: generateId(),
          name: p.name,
          type: p.type,
        }))
      );
    }
  }, [existingContext]);

  // Expose data collector
  React.useImperativeHandle(ref, () => ({
    getData: (): Partial<ProfileData> => ({
      household_members: members
        .filter((m) => m.name.trim() && m.relationship)
        .map((m) => ({
          name: m.name.trim(),
          relationship: m.relationship,
          gender: m.gender || null,
          birthday: m.birthday || null,
          school: m.school || null,
        })),
      pets: pets
        .filter((p) => p.name.trim() && p.type)
        .map((p) => ({
          name: p.name.trim(),
          type: p.type,
        })),
    }),
  }));

  // ─────────────────────────────────────────────────────────────────────────────
  // Member handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const addMember = () => {
    setMembers((prev) => [
      ...prev,
      { id: generateId(), name: '', relationship: '', gender: '', birthday: '', school: '' },
    ]);
  };

  const removeMember = (id: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  };

  const updateMember = (id: string, field: keyof MemberForm, value: string) => {
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, [field]: value } : m))
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Pet handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const addPet = () => {
    setPets((prev) => [
      ...prev,
      { id: generateId(), name: '', type: '' },
    ]);
  };

  const removePet = (id: string) => {
    setPets((prev) => prev.filter((p) => p.id !== id));
  };

  const updatePet = (id: string, field: keyof PetForm, value: string) => {
    setPets((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Who lives in your house? This helps IdeaBox understand family-related emails,
        school communications, and more.
      </p>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* HOUSEHOLD MEMBERS */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      <div className="space-y-3">
        <Label className="text-base font-medium">People in your household</Label>

        {members.map((member) => (
          <div key={member.id} className="border border-border/50 rounded-lg p-3 space-y-3 relative">
            <button
              onClick={() => removeMember(member.id)}
              className="absolute top-2 right-2 text-muted-foreground hover:text-destructive transition-colors"
              aria-label="Remove member"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="grid grid-cols-2 gap-3">
              {/* Name */}
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input
                  value={member.name}
                  onChange={(e) => updateMember(member.id, 'name', e.target.value)}
                  placeholder="Name"
                  className="h-8 text-sm"
                />
              </div>

              {/* Relationship */}
              <div className="space-y-1">
                <Label className="text-xs">Relationship</Label>
                <Select
                  value={member.relationship}
                  onValueChange={(v) => updateMember(member.id, 'relationship', v)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Gender (optional) */}
              <div className="space-y-1">
                <Label className="text-xs">Gender <span className="text-muted-foreground">(opt)</span></Label>
                <Select
                  value={member.gender}
                  onValueChange={(v) => updateMember(member.id, 'gender', v)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="non_binary">Non-binary</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Birthday (optional) */}
              <div className="space-y-1">
                <Label className="text-xs">Birthday <span className="text-muted-foreground">(opt)</span></Label>
                <Input
                  type="date"
                  value={member.birthday}
                  onChange={(e) => updateMember(member.id, 'birthday', e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>

            {/* School — only show for children */}
            {member.relationship === 'child' && (
              <div className="space-y-1">
                <Label className="text-xs">School <span className="text-muted-foreground">(opt)</span></Label>
                <Input
                  value={member.school}
                  onChange={(e) => updateMember(member.id, 'school', e.target.value)}
                  placeholder="School name"
                  className="h-8 text-sm"
                />
              </div>
            )}
          </div>
        ))}

        <Button variant="outline" size="sm" onClick={addMember} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Add person
        </Button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* PETS */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      <div className="space-y-3 pt-2 border-t border-border/30">
        <Label className="text-base font-medium">Pets</Label>

        {pets.map((pet) => (
          <div key={pet.id} className="flex items-center gap-2">
            <Input
              value={pet.name}
              onChange={(e) => updatePet(pet.id, 'name', e.target.value)}
              placeholder="Pet name"
              className="h-8 text-sm flex-1"
            />
            <Select
              value={pet.type}
              onValueChange={(v) => updatePet(pet.id, 'type', v)}
            >
              <SelectTrigger className="h-8 text-sm w-32">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                {PET_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              onClick={() => removePet(pet.id)}
              className="text-muted-foreground hover:text-destructive transition-colors p-1"
              aria-label="Remove pet"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}

        <Button variant="outline" size="sm" onClick={addPet} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Add pet
        </Button>
      </div>
    </div>
  );
});

export default HouseholdSection;
