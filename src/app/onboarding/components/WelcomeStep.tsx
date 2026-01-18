/**
 * 👋 Welcome Step Component
 *
 * First step of onboarding. Welcomes the user and explains
 * what IdeaBox will help them with.
 *
 * @module app/onboarding/components/WelcomeStep
 */

'use client';

import * as React from 'react';
import { Button } from '@/components/ui';
import { Mail, CheckSquare, Users, Sparkles } from 'lucide-react';
import type { AuthUser } from '@/lib/auth';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Props for step components.
 */
export interface StepProps {
  user: AuthUser;
  onNext: () => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Benefits shown on welcome step.
 */
const BENEFITS = [
  {
    icon: <Sparkles className="h-5 w-5 text-primary" />,
    text: 'AI-powered email categorization',
  },
  {
    icon: <CheckSquare className="h-5 w-5 text-primary" />,
    text: 'Automatic action item extraction',
  },
  {
    icon: <Users className="h-5 w-5 text-primary" />,
    text: 'Client relationship tracking',
  },
  {
    icon: <Mail className="h-5 w-5 text-primary" />,
    text: 'Multi-account inbox management',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Welcome step - introduces IdeaBox and gets user started.
 */
export function WelcomeStep({ user, onNext }: StepProps) {
  // Extract first name for personalized greeting
  const firstName = user.name?.split(' ')[0] || 'there';

  return (
    <div className="text-center">
      {/* ─────────────────────────────────────────────────────────────────────
          Greeting
          ───────────────────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">
          Welcome to IdeaBox, {firstName}!
        </h2>
        <p className="text-muted-foreground">
          Let&apos;s set up your account. This will only take about 2 minutes.
        </p>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          Benefits List
          ───────────────────────────────────────────────────────────────────── */}
      <div className="bg-muted/30 rounded-lg p-6 mb-8">
        <h3 className="text-sm font-medium text-muted-foreground mb-4">
          Here&apos;s what you&apos;ll get:
        </h3>
        <ul className="space-y-3">
          {BENEFITS.map((benefit, index) => (
            <li
              key={index}
              className="flex items-center gap-3 text-left"
            >
              {benefit.icon}
              <span>{benefit.text}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          Connected Account Info
          ───────────────────────────────────────────────────────────────────── */}
      <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mb-8">
        <p className="text-sm text-green-700 dark:text-green-400">
          <span className="font-medium">Account connected:</span>{' '}
          {user.email}
        </p>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          Actions
          ───────────────────────────────────────────────────────────────────── */}
      <Button
        size="lg"
        onClick={onNext}
        className="w-full sm:w-auto"
      >
        Get Started
      </Button>
    </div>
  );
}
