/**
 * Location Section — Home Address & Other Cities
 *
 * Collects the user's home address and other cities they care about
 * (hometown, frequent travel destinations, where family lives, etc.).
 *
 * @module app/onboarding/components/profile/LocationSection
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

interface LocationSectionProps {
  existingContext: Record<string, unknown> | null;
}

interface CityForm {
  id: string;
  city: string;
  tag: string;
  note: string;
}

const CITY_TAG_OPTIONS = [
  { value: 'hometown', label: 'Hometown' },
  { value: 'travel', label: 'Travel frequently' },
  { value: 'family', label: 'Family lives there' },
  { value: 'vacation', label: 'Vacation spot' },
  { value: 'other', label: 'Other' },
];

let nextCityId = 1;
function generateCityId() {
  return `city-${nextCityId++}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const LocationSection = React.forwardRef<
  { getData: () => Partial<ProfileData> },
  LocationSectionProps
>(function LocationSection({ existingContext }, ref) {
  const [street, setStreet] = React.useState('');
  const [city, setCity] = React.useState('');
  const [state, setState] = React.useState('');
  const [zip, setZip] = React.useState('');
  const [otherCities, setOtherCities] = React.useState<CityForm[]>([]);

  // Initialize from existing context
  React.useEffect(() => {
    if (!existingContext) return;

    const ctx = existingContext as Record<string, unknown>;
    setStreet((ctx.address_street as string) ?? '');
    setCity((ctx.address_city as string) ?? '');
    setState((ctx.address_state as string) ?? '');
    setZip((ctx.address_zip as string) ?? '');

    const existing = ctx.other_cities as Array<{
      city: string;
      tag: string;
      note?: string;
    }> | undefined;

    if (existing && existing.length > 0) {
      setOtherCities(
        existing.map((c) => ({
          id: generateCityId(),
          city: c.city,
          tag: c.tag,
          note: c.note ?? '',
        }))
      );
    }
  }, [existingContext]);

  // Expose data collector
  React.useImperativeHandle(ref, () => ({
    getData: (): Partial<ProfileData> => ({
      address_street: street.trim() || null,
      address_city: city.trim() || null,
      address_state: state.trim() || null,
      address_zip: zip.trim() || null,
      other_cities: otherCities
        .filter((c) => c.city.trim() && c.tag)
        .map((c) => ({
          city: c.city.trim(),
          tag: c.tag,
          ...(c.note.trim() ? { note: c.note.trim() } : {}),
        })),
    }),
  }));

  // ─────────────────────────────────────────────────────────────────────────────
  // Other cities handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const addCity = () => {
    setOtherCities((prev) => [
      ...prev,
      { id: generateCityId(), city: '', tag: '', note: '' },
    ]);
  };

  const removeCity = (id: string) => {
    setOtherCities((prev) => prev.filter((c) => c.id !== id));
  };

  const updateCity = (id: string, field: keyof CityForm, value: string) => {
    setOtherCities((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Your home address helps IdeaBox surface local events and community emails.
        Other cities help us track travel-related and family emails.
      </p>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* HOME ADDRESS */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      <div className="space-y-3">
        <Label className="text-base font-medium">Home Address</Label>

        <div className="space-y-2">
          <Input
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            placeholder="Street address"
            className="text-sm"
          />
          <div className="grid grid-cols-6 gap-2">
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City"
              className="text-sm col-span-3"
            />
            <Input
              value={state}
              onChange={(e) => setState(e.target.value)}
              placeholder="State"
              className="text-sm col-span-1"
            />
            <Input
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              placeholder="ZIP"
              className="text-sm col-span-2"
            />
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* OTHER CITIES */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      <div className="space-y-3 pt-2 border-t border-border/30">
        <Label className="text-base font-medium">Other cities you care about</Label>

        {otherCities.map((c) => (
          <div key={c.id} className="flex items-start gap-2">
            <div className="flex-1 space-y-2">
              <div className="flex gap-2">
                <Input
                  value={c.city}
                  onChange={(e) => updateCity(c.id, 'city', e.target.value)}
                  placeholder="City, State"
                  className="h-8 text-sm flex-1"
                />
                <Select
                  value={c.tag}
                  onValueChange={(v) => updateCity(c.id, 'tag', v)}
                >
                  <SelectTrigger className="h-8 text-sm w-40">
                    <SelectValue placeholder="Why?" />
                  </SelectTrigger>
                  <SelectContent>
                    {CITY_TAG_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                value={c.note}
                onChange={(e) => updateCity(c.id, 'note', e.target.value)}
                placeholder="Note (optional)"
                className="h-7 text-xs"
              />
            </div>
            <button
              onClick={() => removeCity(c.id)}
              className="text-muted-foreground hover:text-destructive transition-colors p-1 mt-1"
              aria-label="Remove city"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}

        <Button variant="outline" size="sm" onClick={addCity} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Add city
        </Button>
      </div>
    </div>
  );
});

export default LocationSection;
