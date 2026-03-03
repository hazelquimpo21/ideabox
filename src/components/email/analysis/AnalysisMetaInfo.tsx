'use client';

import * as React from 'react';

interface AnalysisMetaInfoProps {
  tokensUsed?: number;
  processingTimeMs?: number;
  analyzerVersion?: string;
}

export const AnalysisMetaInfo = React.memo(function AnalysisMetaInfo({
  tokensUsed,
  processingTimeMs,
  analyzerVersion,
}: AnalysisMetaInfoProps) {
  if (!tokensUsed && !processingTimeMs) return null;

  return (
    <div className="pt-3 border-t flex items-center gap-4 text-xs text-muted-foreground">
      {tokensUsed && <span>{tokensUsed} tokens</span>}
      {processingTimeMs && <span>{processingTimeMs}ms</span>}
      {analyzerVersion && <span>v{analyzerVersion}</span>}
    </div>
  );
});
