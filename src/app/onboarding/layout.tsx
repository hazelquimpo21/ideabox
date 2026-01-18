/**
 * 🎯 Onboarding Layout
 *
 * Minimal layout for the onboarding flow. No sidebar or navbar -
 * keeps the user focused on completing setup.
 *
 * @module app/onboarding/layout
 */

import * as React from 'react';
import { Mail } from 'lucide-react';

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ─────────────────────────────────────────────────────────────────────
          Minimal Header
          ───────────────────────────────────────────────────────────────────── */}
      <header className="border-b border-border/40 py-4">
        <div className="container flex items-center justify-center px-4">
          <div className="flex items-center gap-2">
            <Mail className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold">IdeaBox</span>
          </div>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────────────
          Main Content
          ───────────────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex items-center justify-center p-4">
        {children}
      </main>

      {/* ─────────────────────────────────────────────────────────────────────
          Minimal Footer
          ───────────────────────────────────────────────────────────────────── */}
      <footer className="py-4 text-center text-sm text-muted-foreground">
        Setup takes less than 2 minutes
      </footer>
    </div>
  );
}
