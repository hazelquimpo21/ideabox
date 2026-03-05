/**
 * EmptyState — reusable empty state with positive framing.
 * Implements §3d from VIEW_REDESIGN_PLAN.md.
 *
 * Uses Lucide icons as illustrations and positive language
 * (e.g. "Your desk is clear" not "No items found").
 *
 * @module components/shared/EmptyState
 */

import { cn } from '@/lib/utils/cn';
import {
  CheckCircle,
  Calendar,
  Search,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui';

const VARIANT_CONFIG: Record<string, { icon: LucideIcon; iconColor: string }> = {
  'clean-desk': { icon: CheckCircle, iconColor: 'text-emerald-500' },
  'no-events': { icon: Calendar, iconColor: 'text-blue-400' },
  'no-results': { icon: Search, iconColor: 'text-slate-400' },
  'first-time': { icon: Sparkles, iconColor: 'text-amber-500' },
};

interface EmptyStateProps {
  /** Visual variant — selects icon and default styling */
  variant?: 'clean-desk' | 'no-events' | 'no-results' | 'first-time';
  /** Primary message */
  title: string;
  /** Optional secondary message */
  subtitle?: string;
  /** Optional CTA */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Override the default icon */
  icon?: LucideIcon;
  /** Additional className for the container */
  className?: string;
}

export function EmptyState({
  variant = 'clean-desk',
  title,
  subtitle,
  action,
  icon: IconOverride,
  className,
}: EmptyStateProps) {
  const config = VARIANT_CONFIG[variant] ?? VARIANT_CONFIG['clean-desk']!;
  const Icon = IconOverride ?? config.icon;

  return (
    <div className={cn('flex flex-col items-center justify-center py-8 text-center', className)}>
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
        <Icon className={cn('h-6 w-6', config.iconColor)} />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">{subtitle}</p>
      )}
      {action && (
        <Button variant="outline" size="sm" className="mt-3" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
