/**
 * Shared helper functions for analysis section components.
 *
 * Extracted from EmailDetail.tsx in Phase 2 so that each section
 * component can import only what it needs.
 *
 * @module components/email/analysis/helpers
 */

import * as React from 'react';
import {
  Mail,
  User,
  Calendar,
  Newspaper,
  Building2,
  CheckCircle2,
  ExternalLink,
  MessageSquare,
  FileEdit,
  CalendarClock,
  HelpCircle,
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  Signal,
  Reply,
  Bell,
} from 'lucide-react';
import type { EmailCategory } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// IDEA TYPE HELPERS (used by IdeaSparksSection)
// ═══════════════════════════════════════════════════════════════════════════════

export const IDEA_TYPE_LABELS: Record<string, string> = {
  tweet_draft: 'Tweet', networking: 'Networking', business: 'Business',
  content_creation: 'Content', learning: 'Learning', tool_to_try: 'Tool',
  place_to_visit: 'Place', date_night: 'Date Night', family_activity: 'Family',
  personal_growth: 'Growth', community: 'Community',
  social_post: 'Tweet', hobby: 'Learning', // legacy
};

export const IDEA_TYPE_STYLES: Record<string, string> = {
  tweet_draft: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',
  networking: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800',
  business: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800',
  content_creation: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800',
  learning: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/20 dark:text-cyan-300 dark:border-cyan-800',
  tool_to_try: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800',
  place_to_visit: 'bg-lime-50 text-lime-700 border-lime-200 dark:bg-lime-900/20 dark:text-lime-300 dark:border-lime-800',
  date_night: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800',
  family_activity: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',
  personal_growth: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-300 dark:border-indigo-800',
  community: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/20 dark:text-teal-300 dark:border-teal-800',
  social_post: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',
  hobby: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/20 dark:text-cyan-300 dark:border-cyan-800',
};

export function getIdeaTypeLabel(type: string): string {
  return IDEA_TYPE_LABELS[type] || type.replace(/_/g, ' ');
}

export function getIdeaTypeStyle(type: string): string {
  return IDEA_TYPE_STYLES[type] || '';
}

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY BADGE (used by CategoriesSection + EmailSubject in EmailDetail)
// ═══════════════════════════════════════════════════════════════════════════════

export function getCategoryBadge(category: EmailCategory | null): {
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  label: string;
  icon: React.ReactNode;
} {
  if (!category) {
    return { variant: 'outline', label: 'Uncategorized', icon: React.createElement(Mail, { className: 'h-3 w-3' }) };
  }

  switch (category) {
    case 'clients':
      return { variant: 'default', label: 'Client', icon: React.createElement(Building2, { className: 'h-3 w-3' }) };
    case 'work':
      return { variant: 'secondary', label: 'Work', icon: React.createElement(Building2, { className: 'h-3 w-3' }) };
    case 'personal':
      return { variant: 'outline', label: 'Personal', icon: React.createElement(User, { className: 'h-3 w-3' }) };
    case 'family':
      return { variant: 'outline', label: 'Family', icon: React.createElement(User, { className: 'h-3 w-3' }) };
    case 'finance':
      return { variant: 'secondary', label: 'Finance', icon: React.createElement(Mail, { className: 'h-3 w-3' }) };
    case 'shopping':
      return { variant: 'outline', label: 'Shopping', icon: React.createElement(Mail, { className: 'h-3 w-3' }) };
    case 'newsletters':
      return { variant: 'secondary', label: 'Newsletter', icon: React.createElement(Newspaper, { className: 'h-3 w-3' }) };
    case 'news':
      return { variant: 'secondary', label: 'News', icon: React.createElement(Newspaper, { className: 'h-3 w-3' }) };
    case 'product_updates':
      return { variant: 'outline', label: 'Product Update', icon: React.createElement(Mail, { className: 'h-3 w-3' }) };
    case 'local':
      return { variant: 'default', label: 'Local', icon: React.createElement(Calendar, { className: 'h-3 w-3' }) };
    case 'travel':
      return { variant: 'outline', label: 'Travel', icon: React.createElement(Calendar, { className: 'h-3 w-3' }) };
    case 'notifications':
      return { variant: 'outline', label: 'Alert', icon: React.createElement(Bell, { className: 'h-3 w-3' }) };
    default: {
      const fallbackCategory = category as string;
      return { variant: 'outline', label: fallbackCategory.replace(/_/g, ' '), icon: React.createElement(Mail, { className: 'h-3 w-3' }) };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION TYPE HELPERS (used by ActionExtractionSection)
// ═══════════════════════════════════════════════════════════════════════════════

export function getActionTypeIcon(actionType: string): React.ReactNode {
  switch (actionType) {
    case 'respond': return React.createElement(MessageSquare, { className: 'h-4 w-4' });
    case 'review': return React.createElement(FileEdit, { className: 'h-4 w-4' });
    case 'create': return React.createElement(FileEdit, { className: 'h-4 w-4' });
    case 'schedule': return React.createElement(CalendarClock, { className: 'h-4 w-4' });
    case 'decide': return React.createElement(HelpCircle, { className: 'h-4 w-4' });
    case 'pay': return React.createElement(Mail, { className: 'h-4 w-4' });
    case 'submit': return React.createElement(ExternalLink, { className: 'h-4 w-4' });
    case 'register': return React.createElement(CheckCircle2, { className: 'h-4 w-4' });
    case 'book': return React.createElement(Calendar, { className: 'h-4 w-4' });
    default: return React.createElement(Target, { className: 'h-4 w-4' });
  }
}

export function getUrgencyColor(score: number): string {
  if (score >= 8) return 'text-red-600 dark:text-red-400';
  if (score >= 6) return 'text-orange-600 dark:text-orange-400';
  if (score >= 4) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-green-600 dark:text-green-400';
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT TAGGING HELPERS (used by ClientTaggingSection)
// ═══════════════════════════════════════════════════════════════════════════════

export function getRelationshipIcon(signal: string): React.ReactNode {
  switch (signal) {
    case 'positive': return React.createElement(TrendingUp, { className: 'h-4 w-4 text-green-500' });
    case 'negative': return React.createElement(TrendingDown, { className: 'h-4 w-4 text-red-500' });
    default: return React.createElement(Minus, { className: 'h-4 w-4 text-muted-foreground' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIGNAL / REPLY HELPERS (used by CategoriesSection)
// ═══════════════════════════════════════════════════════════════════════════════

export function getSignalBadge(signal: string): { label: string; className: string } {
  switch (signal) {
    case 'high': return { label: 'High Signal', className: 'bg-green-100 text-green-700 border-green-200' };
    case 'medium': return { label: 'Medium Signal', className: 'bg-blue-100 text-blue-700 border-blue-200' };
    case 'low': return { label: 'Low Signal', className: 'bg-gray-100 text-gray-600 border-gray-200' };
    case 'noise': return { label: 'Noise', className: 'bg-gray-50 text-gray-400 border-gray-100' };
    default: return { label: signal, className: 'bg-gray-100 text-gray-600 border-gray-200' };
  }
}

export function getReplyBadge(reply: string): { label: string; className: string } {
  switch (reply) {
    case 'must_reply': return { label: 'Must Reply', className: 'bg-red-100 text-red-700 border-red-200' };
    case 'should_reply': return { label: 'Should Reply', className: 'bg-orange-100 text-orange-700 border-orange-200' };
    case 'optional_reply': return { label: 'Optional Reply', className: 'bg-yellow-100 text-yellow-600 border-yellow-200' };
    case 'no_reply': return { label: 'No Reply Needed', className: 'bg-gray-50 text-gray-400 border-gray-100' };
    default: return { label: reply.replace(/_/g, ' '), className: 'bg-gray-100 text-gray-600 border-gray-200' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GOLDEN NUGGET HELPERS (used by GoldenNuggetsSection)
// ═══════════════════════════════════════════════════════════════════════════════

export function getNuggetBadgeColor(type: string): string {
  switch (type) {
    case 'deal': return 'bg-green-50 text-green-700 border-green-200';
    case 'tip': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'quote': return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'stat': return 'bg-cyan-50 text-cyan-700 border-cyan-200';
    case 'recommendation': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'remember_this': return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'sales_opportunity': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    default: return 'bg-gray-50 text-gray-600 border-gray-200';
  }
}
