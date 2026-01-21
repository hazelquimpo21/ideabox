/**
 * InboxFilterBar Component
 *
 * An interactive filter bar for the inbox that displays:
 * 1. AI Briefing - Natural language summary of what needs attention
 * 2. Quick Action Filters - Filter by AI-suggested actions (Reply, Review, etc.)
 * 3. Category Tabs - Filter by life-bucket categories
 *
 * DESIGN PHILOSOPHY (Jan 2026):
 * - Actionable over informational: Every element is interactive
 * - AI-first: Leverages quick_action field from AI analysis
 * - Human-centered: Uses natural language and semantic colors
 * - Scannable: User understands inbox state in 2 seconds
 *
 * @module components/email/InboxFilterBar
 */

'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { createLogger } from '@/lib/utils/logger';
import type { EmailCategory, QuickActionDb } from '@/types/database';
import {
  MessageSquare,
  FileText,
  Calendar,
  RotateCcw,
  Bookmark,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Briefcase,
  Building2,
  Users,
  GraduationCap,
  Heart,
  DollarSign,
  ShoppingBag,
  Newspaper,
  Globe,
  Wrench,
  MapPin,
  Plane,
  Inbox,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('InboxFilterBar');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Statistics for quick actions, used to display counts on filter chips.
 * These come from counting the quick_action field across all emails.
 */
export interface QuickActionStats {
  respond: number;
  review: number;
  calendar: number;
  follow_up: number;
  save: number;
  archive: number;
  unsubscribe: number;
  none: number;
}

/**
 * Statistics for life-bucket categories, used to display counts on category tabs.
 */
export interface CategoryStats {
  client_pipeline: number;
  business_work_general: number;
  personal_friends_family: number;
  family_kids_school: number;
  family_health_appointments: number;
  finance: number;
  shopping: number;
  newsletters_general: number;
  news_politics: number;
  product_updates: number;
  local: number;
  travel: number;
}

/**
 * Props for the InboxFilterBar component.
 */
export interface InboxFilterBarProps {
  /** Total number of emails in inbox */
  totalEmails: number;
  /** Number of unread emails */
  unreadCount: number;
  /** Quick action statistics for filter chip counts */
  quickActionStats: QuickActionStats;
  /** Category statistics for tab counts */
  categoryStats: CategoryStats;
  /** Currently active quick action filter (null = no filter) */
  activeQuickAction: QuickActionDb | null;
  /** Currently active category filter (null or 'all' = no filter) */
  activeCategory: EmailCategory | 'all' | null;
  /** Callback when quick action filter is clicked */
  onQuickActionChange: (action: QuickActionDb | null) => void;
  /** Callback when category filter is clicked */
  onCategoryChange: (category: EmailCategory | 'all') => void;
  /** Number of emails with deadlines this week (for briefing) */
  deadlinesThisWeek?: number;
  /** Number of upcoming events (for briefing) */
  upcomingEvents?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUICK ACTION CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for quick action filter chips.
 * Maps quick_action values to display properties.
 *
 * DESIGN NOTES:
 * - Colors are semantic: red for urgent actions, blue for review, etc.
 * - Only showing actionable quick actions (not archive/none/unsubscribe)
 * - Order is by typical urgency: reply > review > calendar > follow_up > save
 */
const QUICK_ACTION_CONFIG: Record<
  QuickActionDb,
  { label: string; icon: React.ReactNode; color: string; show: boolean }
> = {
  respond: {
    label: 'Reply',
    icon: <MessageSquare className="h-3.5 w-3.5" />,
    color: 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50',
    show: true,
  },
  review: {
    label: 'Review',
    icon: <FileText className="h-3.5 w-3.5" />,
    color: 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50',
    show: true,
  },
  calendar: {
    label: 'Calendar',
    icon: <Calendar className="h-3.5 w-3.5" />,
    color: 'bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-900/50',
    show: true,
  },
  follow_up: {
    label: 'Follow Up',
    icon: <RotateCcw className="h-3.5 w-3.5" />,
    color: 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:hover:bg-orange-900/50',
    show: true,
  },
  save: {
    label: 'Save',
    icon: <Bookmark className="h-3.5 w-3.5" />,
    color: 'bg-teal-100 text-teal-700 hover:bg-teal-200 dark:bg-teal-900/30 dark:text-teal-400 dark:hover:bg-teal-900/50',
    show: true,
  },
  // Hidden actions - not shown as filter chips but tracked for completeness
  archive: { label: 'Archive', icon: null, color: '', show: false },
  unsubscribe: { label: 'Unsubscribe', icon: null, color: '', show: false },
  none: { label: 'None', icon: null, color: '', show: false },
};

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for life-bucket category tabs.
 * Organized into logical groups for UI display.
 *
 * DESIGN NOTES:
 * - Categories are grouped by life area (Work, Personal, Finance, Content, Location)
 * - Show count only for categories with emails
 * - Primary categories (Work, Personal) are always visible
 * - Secondary categories can be collapsed for cleaner UI
 */
interface CategoryConfig {
  key: EmailCategory;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  group: 'work' | 'personal' | 'finance' | 'content' | 'location';
  primary: boolean; // Always visible vs collapsible
}

const CATEGORY_CONFIG: CategoryConfig[] = [
  // Work & Business (Primary)
  { key: 'client_pipeline', label: 'Clients', shortLabel: 'Clients', icon: <Briefcase className="h-3.5 w-3.5" />, group: 'work', primary: true },
  { key: 'business_work_general', label: 'Work', shortLabel: 'Work', icon: <Building2 className="h-3.5 w-3.5" />, group: 'work', primary: true },

  // Personal & Family (Primary)
  { key: 'personal_friends_family', label: 'Personal', shortLabel: 'Personal', icon: <Users className="h-3.5 w-3.5" />, group: 'personal', primary: true },
  { key: 'family_kids_school', label: 'Family & School', shortLabel: 'Family', icon: <GraduationCap className="h-3.5 w-3.5" />, group: 'personal', primary: false },
  { key: 'family_health_appointments', label: 'Health', shortLabel: 'Health', icon: <Heart className="h-3.5 w-3.5" />, group: 'personal', primary: false },

  // Finance & Shopping (Secondary)
  { key: 'finance', label: 'Finance', shortLabel: 'Finance', icon: <DollarSign className="h-3.5 w-3.5" />, group: 'finance', primary: true },
  { key: 'shopping', label: 'Shopping', shortLabel: 'Shopping', icon: <ShoppingBag className="h-3.5 w-3.5" />, group: 'finance', primary: false },

  // Content & News (Secondary)
  { key: 'newsletters_general', label: 'Newsletters', shortLabel: 'News', icon: <Newspaper className="h-3.5 w-3.5" />, group: 'content', primary: false },
  { key: 'news_politics', label: 'News & Politics', shortLabel: 'News', icon: <Globe className="h-3.5 w-3.5" />, group: 'content', primary: false },
  { key: 'product_updates', label: 'Product Updates', shortLabel: 'Updates', icon: <Wrench className="h-3.5 w-3.5" />, group: 'content', primary: false },

  // Location & Travel (Secondary)
  { key: 'local', label: 'Local', shortLabel: 'Local', icon: <MapPin className="h-3.5 w-3.5" />, group: 'location', primary: true },
  { key: 'travel', label: 'Travel', shortLabel: 'Travel', icon: <Plane className="h-3.5 w-3.5" />, group: 'location', primary: false },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * AI Briefing - Natural language summary of inbox state.
 * Tells the user what needs their attention in human terms.
 */
function AIBriefing({
  respondCount,
  reviewCount,
  deadlinesThisWeek,
  upcomingEvents,
  unreadCount,
}: {
  respondCount: number;
  reviewCount: number;
  deadlinesThisWeek: number;
  upcomingEvents: number;
  unreadCount: number;
}) {
  // Build briefing parts based on what's present
  const parts: string[] = [];

  if (respondCount > 0) {
    parts.push(`${respondCount} email${respondCount > 1 ? 's' : ''} waiting for your reply`);
  }

  if (reviewCount > 0) {
    parts.push(`${reviewCount} to review`);
  }

  if (deadlinesThisWeek > 0) {
    parts.push(`${deadlinesThisWeek} deadline${deadlinesThisWeek > 1 ? 's' : ''} this week`);
  }

  if (upcomingEvents > 0) {
    parts.push(`${upcomingEvents} upcoming event${upcomingEvents > 1 ? 's' : ''}`);
  }

  // If nothing urgent, show a calmer message
  if (parts.length === 0) {
    if (unreadCount > 0) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 text-green-500" />
          <span>You&apos;re all caught up! {unreadCount} unread email{unreadCount > 1 ? 's' : ''} to browse.</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="h-4 w-4 text-green-500" />
        <span>Inbox zero - you&apos;re all caught up!</span>
      </div>
    );
  }

  // Join parts with proper grammar
  let briefingText = '';
  if (parts.length === 1) {
    briefingText = `You have ${parts[0]}.`;
  } else if (parts.length === 2) {
    briefingText = `You have ${parts[0]} and ${parts[1]}.`;
  } else {
    const lastPart = parts.pop();
    briefingText = `You have ${parts.join(', ')}, and ${lastPart}.`;
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <Clock className="h-4 w-4 text-amber-500 shrink-0" />
      <span className="text-foreground">{briefingText}</span>
    </div>
  );
}

/**
 * Quick Action Filter Chip - Interactive filter button for a quick action.
 */
function QuickActionChip({
  action,
  count,
  isActive,
  onClick,
}: {
  action: QuickActionDb;
  count: number;
  isActive: boolean;
  onClick: () => void;
}) {
  const config = QUICK_ACTION_CONFIG[action];

  // Don't render hidden actions or actions with zero count
  if (!config.show || count === 0) {
    return null;
  }

  const baseClasses = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer select-none';
  const activeClasses = isActive
    ? `${config.color} ring-2 ring-offset-1 ring-current`
    : `${config.color} opacity-80 hover:opacity-100`;

  return (
    <button
      onClick={onClick}
      className={`${baseClasses} ${activeClasses}`}
      aria-pressed={isActive}
      aria-label={`Filter by ${config.label}: ${count} emails`}
    >
      {config.icon}
      <span>{config.label}</span>
      <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5 text-xs bg-white/50 dark:bg-black/30">
        {count}
      </Badge>
    </button>
  );
}

/**
 * Category Tab - Interactive filter button for a life-bucket category.
 */
function CategoryTab({
  config,
  count,
  isActive,
  onClick,
}: {
  config: CategoryConfig;
  count: number;
  isActive: boolean;
  onClick: () => void;
}) {
  // Don't render categories with zero count (except if active)
  if (count === 0 && !isActive) {
    return null;
  }

  const baseClasses = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm transition-all cursor-pointer select-none';
  const activeClasses = isActive
    ? 'bg-primary text-primary-foreground font-medium'
    : 'text-muted-foreground hover:text-foreground hover:bg-muted';

  return (
    <button
      onClick={onClick}
      className={`${baseClasses} ${activeClasses}`}
      aria-pressed={isActive}
      aria-label={`Filter by ${config.label}: ${count} emails`}
    >
      {config.icon}
      <span className="hidden sm:inline">{config.shortLabel}</span>
      {count > 0 && (
        <span className={`text-xs ${isActive ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
          ({count})
        </span>
      )}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * InboxFilterBar - The main interactive filter bar for the inbox.
 *
 * Renders three sections:
 * 1. AI Briefing - Natural language summary
 * 2. Quick Action Filters - Action-based filtering (Reply, Review, etc.)
 * 3. Category Tabs - Life-bucket filtering with expandable secondary categories
 *
 * @example
 * ```tsx
 * <InboxFilterBar
 *   totalEmails={47}
 *   unreadCount={12}
 *   quickActionStats={{ respond: 5, review: 8, calendar: 3, ... }}
 *   categoryStats={{ client_pipeline: 15, personal_friends_family: 8, ... }}
 *   activeQuickAction={null}
 *   activeCategory="all"
 *   onQuickActionChange={(action) => setQuickAction(action)}
 *   onCategoryChange={(category) => setCategory(category)}
 * />
 * ```
 */
export function InboxFilterBar({
  totalEmails,
  unreadCount,
  quickActionStats,
  categoryStats,
  activeQuickAction,
  activeCategory,
  onQuickActionChange,
  onCategoryChange,
  deadlinesThisWeek = 0,
  upcomingEvents = 0,
}: InboxFilterBarProps) {
  // Track whether secondary categories are expanded
  const [showAllCategories, setShowAllCategories] = React.useState(false);

  // Log filter changes for debugging
  React.useEffect(() => {
    logger.debug('Filter bar rendered', {
      totalEmails,
      unreadCount,
      activeQuickAction,
      activeCategory,
      quickActionStats,
    });
  }, [totalEmails, unreadCount, activeQuickAction, activeCategory, quickActionStats]);

  /**
   * Handles quick action chip click.
   * If the same action is clicked again, clears the filter.
   */
  const handleQuickActionClick = React.useCallback(
    (action: QuickActionDb) => {
      const newAction = activeQuickAction === action ? null : action;
      logger.info('Quick action filter changed', { from: activeQuickAction, to: newAction });
      onQuickActionChange(newAction);
    },
    [activeQuickAction, onQuickActionChange]
  );

  /**
   * Handles category tab click.
   * If the same category is clicked again, returns to 'all'.
   */
  const handleCategoryClick = React.useCallback(
    (category: EmailCategory | 'all') => {
      const newCategory = activeCategory === category ? 'all' : category;
      logger.info('Category filter changed', { from: activeCategory, to: newCategory });
      onCategoryChange(newCategory);
    },
    [activeCategory, onCategoryChange]
  );

  // Split categories into primary (always shown) and secondary (collapsible)
  const primaryCategories = CATEGORY_CONFIG.filter((c) => c.primary);
  const secondaryCategories = CATEGORY_CONFIG.filter((c) => !c.primary);

  // Count how many secondary categories have emails
  const secondaryCategoriesWithEmails = secondaryCategories.filter(
    (c) => categoryStats[c.key] > 0
  ).length;

  return (
    <Card className="mb-6">
      <CardContent className="py-4 space-y-4">
        {/* ─────────────────────────────────────────────────────────────────────
            Section 1: AI Briefing
            Natural language summary of what needs attention
        ───────────────────────────────────────────────────────────────────── */}
        <AIBriefing
          respondCount={quickActionStats.respond}
          reviewCount={quickActionStats.review}
          deadlinesThisWeek={deadlinesThisWeek}
          upcomingEvents={upcomingEvents}
          unreadCount={unreadCount}
        />

        {/* ─────────────────────────────────────────────────────────────────────
            Section 2: Quick Action Filters
            Horizontal row of action-based filter chips
        ───────────────────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide mr-1">
            Quick Actions:
          </span>
          {(Object.keys(QUICK_ACTION_CONFIG) as QuickActionDb[])
            .filter((action) => QUICK_ACTION_CONFIG[action].show)
            .map((action) => (
              <QuickActionChip
                key={action}
                action={action}
                count={quickActionStats[action]}
                isActive={activeQuickAction === action}
                onClick={() => handleQuickActionClick(action)}
              />
            ))}
          {/* Show message if no quick actions */}
          {Object.values(quickActionStats).every((count) => count === 0) && (
            <span className="text-sm text-muted-foreground">No actions needed</span>
          )}
        </div>

        {/* ─────────────────────────────────────────────────────────────────────
            Section 3: Category Tabs
            Life-bucket category filters with expandable secondary categories
        ───────────────────────────────────────────────────────────────────── */}
        <div className="border-t pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* All Emails tab */}
            <button
              onClick={() => handleCategoryClick('all')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm transition-all cursor-pointer select-none ${
                activeCategory === 'all' || activeCategory === null
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
              aria-pressed={activeCategory === 'all' || activeCategory === null}
            >
              <Inbox className="h-3.5 w-3.5" />
              <span>All</span>
              <span className={`text-xs ${activeCategory === 'all' || activeCategory === null ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                ({totalEmails})
              </span>
            </button>

            {/* Separator */}
            <div className="w-px h-5 bg-border mx-1" />

            {/* Primary categories - always visible */}
            {primaryCategories.map((config) => (
              <CategoryTab
                key={config.key}
                config={config}
                count={categoryStats[config.key]}
                isActive={activeCategory === config.key}
                onClick={() => handleCategoryClick(config.key)}
              />
            ))}

            {/* Secondary categories - shown when expanded */}
            {showAllCategories &&
              secondaryCategories.map((config) => (
                <CategoryTab
                  key={config.key}
                  config={config}
                  count={categoryStats[config.key]}
                  isActive={activeCategory === config.key}
                  onClick={() => handleCategoryClick(config.key)}
                />
              ))}

            {/* Expand/collapse button for secondary categories */}
            {secondaryCategoriesWithEmails > 0 && (
              <button
                onClick={() => {
                  setShowAllCategories(!showAllCategories);
                  logger.debug('Category expansion toggled', { showAllCategories: !showAllCategories });
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                aria-expanded={showAllCategories}
              >
                {showAllCategories ? (
                  <>
                    <ChevronUp className="h-3 w-3" />
                    <span>Less</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3" />
                    <span>+{secondaryCategoriesWithEmails} more</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default InboxFilterBar;
