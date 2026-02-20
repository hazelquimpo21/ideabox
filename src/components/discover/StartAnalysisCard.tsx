/**
 * Start Analysis Card Component
 *
 * UI for users to initiate their first email analysis from the Discover page.
 * Provides options for Quick (10), Standard (25), or Deep (50) analysis.
 *
 * Moved from src/app/(auth)/discover/components/ in Phase 4.
 *
 * @module components/discover/StartAnalysisCard
 * @since January 2026
 */

'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Sparkles, Zap, Mail, Info } from 'lucide-react';
import Link from 'next/link';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface StartAnalysisCardProps {
  error: string | null;
  isStartingSync: boolean;
  onStartAnalysis: (emailCount: number) => void;
  onSkip: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const ANALYSIS_OPTIONS = [
  {
    count: 10,
    name: 'Quick Start',
    description: 'Get started fast with your 10 most recent emails',
    time: '~15 seconds',
    cost: '~$0.01',
    isRecommended: true,
    icon: Zap,
    variant: 'primary' as const,
  },
  {
    count: 25,
    name: 'Standard',
    description: 'Analyze 25 emails for better initial insights',
    time: '~30 seconds',
    cost: '~$0.02',
    isRecommended: false,
    icon: Mail,
    variant: 'default' as const,
  },
  {
    count: 50,
    name: 'Comprehensive',
    description: 'Deep analysis of 50 emails for the full picture',
    time: '~1 minute',
    cost: '~$0.03',
    isRecommended: false,
    icon: Sparkles,
    variant: 'default' as const,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function StartAnalysisCard({
  error,
  isStartingSync,
  onStartAnalysis,
  onSkip,
}: StartAnalysisCardProps) {
  return (
    <div className="container max-w-2xl mx-auto py-12 px-4">
      <Card className="border-border/50">
        <CardContent className="pt-8 pb-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Analyze Your Inbox</h1>
            <p className="text-muted-foreground max-w-md mx-auto">
              AI will read your recent emails to find action items, categorize messages,
              and identify what needs your attention.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg p-4 mb-6 text-center">
              <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div className="text-center text-sm text-muted-foreground mb-4">
              Choose how many emails to analyze:
            </div>
            {ANALYSIS_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isPrimary = option.variant === 'primary';
              return (
                <button
                  key={option.count}
                  onClick={() => onStartAnalysis(option.count)}
                  disabled={isStartingSync}
                  className={`w-full p-4 rounded-lg transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed ${isPrimary ? 'border-2 border-primary bg-primary/5 hover:bg-primary/10' : 'border border-border hover:border-primary/50 hover:bg-accent/50'}`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isPrimary ? 'bg-primary/20' : 'bg-muted'}`}>
                      <Icon className={`h-5 w-5 ${isPrimary ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{option.name}</span>
                        {option.isRecommended && <Badge variant="secondary" className="text-xs">Recommended</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{option.description}</p>
                      <p className="text-xs text-muted-foreground mt-2">{option.count} emails &middot; {option.time} &middot; {option.cost}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {isStartingSync && (
            <div className="flex items-center justify-center gap-2 mt-6 text-muted-foreground">
              <Spinner size="sm" /><span>Starting analysis...</span>
            </div>
          )}

          <div className="flex items-start gap-2 mt-6 p-3 bg-muted/50 rounded-lg">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              You can always analyze more emails later or change these settings in{' '}
              <Link href="/settings?tab=ai" className="text-primary hover:underline">Settings</Link>.
            </p>
          </div>

          <div className="text-center mt-6">
            <Button variant="ghost" onClick={onSkip}>Skip for now</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
