/**
 * Start Analysis Card Component
 *
 * UI for users to initiate email analysis from the Discover page.
 * Provides options for Quick (10), Standard (25), or Deep (50) scans.
 */

'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Sparkles, Zap, Mail } from 'lucide-react';

interface StartAnalysisCardProps {
  error: string | null;
  isStartingSync: boolean;
  onStartAnalysis: (emailCount: number) => void;
  onSkip: () => void;
}

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
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Discover Your Inbox</h1>
            <p className="text-muted-foreground max-w-md mx-auto">
              Let AI analyze your recent emails to find action items, events, and patterns.
            </p>
          </div>

          {/* Error message if previous sync failed */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-center">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {/* Analysis Options */}
          <div className="space-y-4">
            <div className="text-center text-sm text-muted-foreground mb-4">
              Choose how many emails to analyze:
            </div>

            {/* Quick Scan - 10 emails (default/recommended) */}
            <button
              onClick={() => onStartAnalysis(10)}
              disabled={isStartingSync}
              className="w-full p-4 rounded-lg border-2 border-primary bg-primary/5 hover:bg-primary/10 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <Zap className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Quick Scan</span>
                    <Badge variant="secondary" className="text-xs">Recommended</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Analyze your last 10 emails. Fast and gets you started quickly.
                  </p>
                </div>
              </div>
            </button>

            {/* Standard Scan - 25 emails */}
            <button
              onClick={() => onStartAnalysis(25)}
              disabled={isStartingSync}
              className="w-full p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-accent/50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <span className="font-semibold">Standard Scan</span>
                  <p className="text-sm text-muted-foreground mt-1">
                    Analyze your last 25 emails. Better insights, takes about 30 seconds.
                  </p>
                </div>
              </div>
            </button>

            {/* Deep Scan - 50 emails */}
            <button
              onClick={() => onStartAnalysis(50)}
              disabled={isStartingSync}
              className="w-full p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-accent/50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <Sparkles className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <span className="font-semibold">Deep Scan</span>
                  <p className="text-sm text-muted-foreground mt-1">
                    Analyze your last 50 emails. Most comprehensive, takes about a minute.
                  </p>
                </div>
              </div>
            </button>
          </div>

          {/* Loading indicator when starting */}
          {isStartingSync && (
            <div className="flex items-center justify-center gap-2 mt-6 text-muted-foreground">
              <Spinner size="sm" />
              <span>Starting analysis...</span>
            </div>
          )}

          {/* Skip option */}
          <div className="text-center mt-6">
            <Button variant="ghost" onClick={onSkip}>
              Skip for now
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
