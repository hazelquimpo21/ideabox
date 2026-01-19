/**
 * Location Step Component
 *
 * Step 5 of 7 in the user context onboarding wizard.
 * Collects user's location (city and metro area).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * PURPOSE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Location information helps the AI:
 * - Identify local events and apply 'local_event' label
 * - Prioritize emails about events in the user's area
 * - Provide relevant local context in summaries
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FIELDS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - City: User's primary city (e.g., "Shorewood, WI")
 * - Metro area: Broader metro region (e.g., "Milwaukee metro")
 *
 * @module components/onboarding/LocationStep
 * @version 1.0.0
 * @since January 2026
 */

'use client';

import * as React from 'react';
import { Button, Input, Label } from '@/components/ui';
import { MapPin, Building } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('LocationStep');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Props for the LocationStep component.
 */
export interface LocationStepProps {
  /** User's city */
  locationCity: string;
  /** User's metro area */
  locationMetro: string;
  /** Callback when location data changes */
  onDataChange: (data: { locationCity: string; locationMetro: string }) => void;
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
 * Example locations for placeholder hints.
 */
const CITY_EXAMPLES = ['San Francisco, CA', 'Austin, TX', 'New York, NY', 'Chicago, IL'];
const METRO_EXAMPLES = ['Bay Area', 'Austin metro', 'NYC metro', 'Chicagoland'];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * LocationStep - Collects user's city and metro area.
 *
 * @example
 * ```tsx
 * <LocationStep
 *   locationCity={data.locationCity}
 *   locationMetro={data.locationMetro}
 *   onDataChange={(d) => setData(prev => ({ ...prev, ...d }))}
 *   onNext={handleNext}
 *   onBack={handleBack}
 *   isFirstStep={false}
 *   isLastStep={false}
 * />
 * ```
 */
export function LocationStep({
  locationCity,
  locationMetro,
  onDataChange,
  onNext,
  onBack,
  isFirstStep,
  isLastStep,
}: LocationStepProps) {
  // ─────────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Handles city input change.
   */
  const handleCityChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      logger.debug('City changed', { city: value });
      onDataChange({ locationCity: value, locationMetro });
    },
    [locationMetro, onDataChange]
  );

  /**
   * Handles metro area input change.
   */
  const handleMetroChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      logger.debug('Metro changed', { metro: value });
      onDataChange({ locationCity, locationMetro: value });
    },
    [locationCity, onDataChange]
  );

  /**
   * Handles continue button click.
   */
  const handleContinue = React.useCallback(() => {
    logger.info('LocationStep completed', {
      hasCity: !!locationCity,
      hasMetro: !!locationMetro,
    });
    onNext();
  }, [locationCity, locationMetro, onNext]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  const hasLocation = locationCity || locationMetro;

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────────────────────────────────────
          Header
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="text-center space-y-2">
        <div className="w-12 h-12 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
          <MapPin className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Where are you based?</h2>
        <p className="text-muted-foreground">
          This helps us identify local events and opportunities near you.
          <br />
          <span className="text-sm">This step is optional.</span>
        </p>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          City Input
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <Label htmlFor="city-input" className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          City
        </Label>
        <Input
          id="city-input"
          type="text"
          placeholder={`e.g., ${CITY_EXAMPLES[Math.floor(Math.random() * CITY_EXAMPLES.length)]}`}
          value={locationCity}
          onChange={handleCityChange}
          maxLength={200}
        />
        <p className="text-xs text-muted-foreground">
          Your primary city or town, including state/region if helpful.
        </p>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          Metro Area Input
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <Label htmlFor="metro-input" className="text-base flex items-center gap-2">
          <Building className="h-4 w-4 text-muted-foreground" />
          Metro Area
          <span className="text-muted-foreground text-sm font-normal">(optional)</span>
        </Label>
        <Input
          id="metro-input"
          type="text"
          placeholder={`e.g., ${METRO_EXAMPLES[Math.floor(Math.random() * METRO_EXAMPLES.length)]}`}
          value={locationMetro}
          onChange={handleMetroChange}
          maxLength={200}
        />
        <p className="text-xs text-muted-foreground">
          The broader metropolitan area for matching regional events.
        </p>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          Info Box
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="p-4 bg-muted/30 rounded-lg">
        <div className="flex items-start gap-3">
          <MapPin className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium mb-1">Why this matters</p>
            <ul className="text-muted-foreground space-y-1">
              <li>
                Emails about events in your area get the <code className="text-xs bg-muted px-1 rounded">local_event</code> label
              </li>
              <li>Local events are surfaced in your Hub</li>
              <li>AI summaries mention relevance to your location</li>
            </ul>
          </div>
        </div>
      </div>

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
          {!hasLocation && (
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

export default LocationStep;
