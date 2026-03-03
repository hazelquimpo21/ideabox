'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface CollapsibleAnalysisSectionProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  iconColor?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export const CollapsibleAnalysisSection = React.memo(function CollapsibleAnalysisSection({
  icon: Icon,
  title,
  subtitle,
  iconColor,
  defaultOpen = false,
  children,
}: CollapsibleAnalysisSectionProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <div className="pt-3 border-t">
      <button
        type="button"
        className="flex items-center gap-2 w-full cursor-pointer hover:bg-muted/50 rounded-md p-1 -m-1 transition-colors"
        onClick={() => setIsOpen((prev: boolean) => !prev)}
      >
        <Icon className={`h-4 w-4 ${iconColor || 'text-muted-foreground'}`} />
        <span className="text-sm font-medium">{title}</span>
        {subtitle && (
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        )}
        <ChevronDown
          className={`h-4 w-4 ml-auto text-muted-foreground transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
});
