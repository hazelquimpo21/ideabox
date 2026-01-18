/**
 * 📬 Inbox Page for IdeaBox
 *
 * The main email inbox view. Displays a list of emails organized by
 * category with filtering, sorting, and search capabilities.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES (Planned)
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Email list with category badges
 * - Quick actions (archive, star, mark read)
 * - Category filtering
 * - Search integration
 * - Infinite scroll / pagination
 * - Email detail slide-over panel
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CURRENT STATUS
 * ═══════════════════════════════════════════════════════════════════════════════
 * Placeholder implementation. Requires:
 * - useEmails hook for data fetching
 * - EmailList, EmailCard, EmailDetail components
 * - API routes for email operations
 *
 * @module app/(auth)/inbox/page
 */

'use client';

import * as React from 'react';
import { PageHeader } from '@/components/layout';
import { Card, CardContent, Button, Badge, Skeleton } from '@/components/ui';
import {
  Mail,
  Inbox,
  AlertCircle,
  Calendar,
  Newspaper,
  Tag,
  Archive,
  Star,
  MoreHorizontal,
  RefreshCw,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mock email data structure.
 * Will be replaced with actual Email type from database.
 */
interface MockEmail {
  id: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  snippet: string;
  category: 'action_required' | 'event' | 'newsletter' | 'promo' | 'admin' | 'personal' | 'noise';
  isRead: boolean;
  isStarred: boolean;
  date: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK DATA (Remove when hooks are implemented)
// ═══════════════════════════════════════════════════════════════════════════════

const MOCK_EMAILS: MockEmail[] = [
  {
    id: '1',
    subject: 'Q4 Budget Review Required',
    senderName: 'Sarah Chen',
    senderEmail: 'sarah@acme.com',
    snippet: 'Hi, please review the attached budget proposal for Q4. We need your approval by Friday...',
    category: 'action_required',
    isRead: false,
    isStarred: true,
    date: new Date(Date.now() - 1000 * 60 * 30), // 30 min ago
  },
  {
    id: '2',
    subject: 'Team Standup - Tomorrow 10am',
    senderName: 'Calendar',
    senderEmail: 'calendar@company.com',
    snippet: 'You have been invited to: Team Standup. When: Tomorrow at 10:00 AM...',
    category: 'event',
    isRead: false,
    isStarred: false,
    date: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
  },
  {
    id: '3',
    subject: 'Weekly Industry Digest',
    senderName: 'TechCrunch',
    senderEmail: 'digest@techcrunch.com',
    snippet: 'This week in tech: AI breakthroughs, startup funding rounds, and more...',
    category: 'newsletter',
    isRead: true,
    isStarred: false,
    date: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5 hours ago
  },
  {
    id: '4',
    subject: 'Your AWS Bill for December',
    senderName: 'AWS Billing',
    senderEmail: 'billing@aws.amazon.com',
    snippet: 'Your AWS bill for the billing period December 1-31 is now available...',
    category: 'admin',
    isRead: true,
    isStarred: false,
    date: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
  },
  {
    id: '5',
    subject: 'Catch up soon?',
    senderName: 'Mike Johnson',
    senderEmail: 'mike@gmail.com',
    snippet: 'Hey! It\'s been a while. Would love to grab coffee and catch up...',
    category: 'personal',
    isRead: true,
    isStarred: false,
    date: new Date(Date.now() - 1000 * 60 * 60 * 48), // 2 days ago
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Format relative time (e.g., "5 min ago", "2 hours ago").
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) {
    return `${diffMins} min ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  } else {
    return date.toLocaleDateString();
  }
}

/**
 * Get category badge variant and label.
 */
function getCategoryInfo(category: MockEmail['category']): {
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  label: string;
  icon: React.ReactNode;
} {
  switch (category) {
    case 'action_required':
      return {
        variant: 'destructive',
        label: 'Action Required',
        icon: <AlertCircle className="h-3 w-3" />,
      };
    case 'event':
      return {
        variant: 'default',
        label: 'Event',
        icon: <Calendar className="h-3 w-3" />,
      };
    case 'newsletter':
      return {
        variant: 'secondary',
        label: 'Newsletter',
        icon: <Newspaper className="h-3 w-3" />,
      };
    case 'promo':
      return {
        variant: 'outline',
        label: 'Promo',
        icon: <Tag className="h-3 w-3" />,
      };
    case 'admin':
      return {
        variant: 'secondary',
        label: 'Admin',
        icon: <Mail className="h-3 w-3" />,
      };
    case 'personal':
      return {
        variant: 'outline',
        label: 'Personal',
        icon: <Mail className="h-3 w-3" />,
      };
    case 'noise':
      return {
        variant: 'outline',
        label: 'Noise',
        icon: <Archive className="h-3 w-3" />,
      };
    default:
      return {
        variant: 'outline',
        label: 'Unknown',
        icon: <Mail className="h-3 w-3" />,
      };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Email list item component.
 * TODO: Extract to separate file when building EmailCard component.
 */
function EmailListItem({ email }: { email: MockEmail }) {
  const categoryInfo = getCategoryInfo(email.category);

  return (
    <div
      className={`
        flex items-start gap-4 p-4 border-b border-border/50
        hover:bg-muted/30 transition-colors cursor-pointer
        ${!email.isRead ? 'bg-muted/10' : ''}
      `}
    >
      {/* Star button */}
      <button
        className={`
          mt-1 p-1 rounded hover:bg-muted transition-colors
          ${email.isStarred ? 'text-yellow-500' : 'text-muted-foreground'}
        `}
        aria-label={email.isStarred ? 'Unstar email' : 'Star email'}
      >
        <Star className="h-4 w-4" fill={email.isStarred ? 'currentColor' : 'none'} />
      </button>

      {/* Email content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className={`font-medium truncate ${!email.isRead ? 'text-foreground' : 'text-muted-foreground'}`}>
            {email.senderName}
          </span>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {formatRelativeTime(email.date)}
          </span>
        </div>

        <div className="flex items-center gap-2 mb-1">
          <span className={`text-sm truncate ${!email.isRead ? 'font-medium' : ''}`}>
            {email.subject}
          </span>
          <Badge variant={categoryInfo.variant} className="gap-1 text-xs shrink-0">
            {categoryInfo.icon}
            {categoryInfo.label}
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground truncate">
          {email.snippet}
        </p>
      </div>

      {/* Actions */}
      <button
        className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
        aria-label="More actions"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Loading skeleton for email list.
 */
function EmailListSkeleton() {
  return (
    <div className="space-y-0">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-start gap-4 p-4 border-b border-border/50">
          <Skeleton className="h-6 w-6 rounded" />
          <div className="flex-1 space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Empty state when no emails match filters.
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <Inbox className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-2">No emails yet</h3>
      <p className="text-muted-foreground max-w-sm">
        Your inbox is empty. Emails will appear here once they&apos;re synced from your Gmail account.
      </p>
      <Button variant="outline" className="mt-4 gap-2">
        <RefreshCw className="h-4 w-4" />
        Sync Now
      </Button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Inbox page component.
 *
 * Currently displays mock data. Will be connected to:
 * - useEmails hook for real data
 * - API routes for email operations
 * - Real-time updates via Supabase subscriptions
 */
export default function InboxPage() {
  // TODO: Replace with useEmails hook
  const [isLoading, setIsLoading] = React.useState(true);
  const [emails, setEmails] = React.useState<MockEmail[]>([]);

  // Simulate loading
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setEmails(MOCK_EMAILS);
      setIsLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ─────────────────────────────────────────────────────────────────────
          Page Header
          ───────────────────────────────────────────────────────────────────── */}
      <PageHeader
        title="Inbox"
        description="Your unified email inbox with AI-powered categorization"
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Inbox' },
        ]}
        actions={
          <Button variant="outline" size="sm" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Sync
          </Button>
        }
      />

      {/* ─────────────────────────────────────────────────────────────────────
          Email Stats Banner
          ───────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="text-2xl font-bold">3</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Action Required</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <span className="text-2xl font-bold">2</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Events Today</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">28</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Unread</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-500" />
              <span className="text-2xl font-bold">5</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Starred</p>
          </CardContent>
        </Card>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          Email List
          ───────────────────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <EmailListSkeleton />
          ) : emails.length === 0 ? (
            <EmptyState />
          ) : (
            <div>
              {emails.map((email) => (
                <EmailListItem key={email.id} email={email} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─────────────────────────────────────────────────────────────────────
          Developer Note
          ───────────────────────────────────────────────────────────────────── */}
      <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
        <p className="text-sm text-yellow-700 dark:text-yellow-400">
          <strong>Developer Note:</strong> This page displays mock data.
          Next steps: Create useEmails hook, EmailCard component, and API routes.
        </p>
      </div>
    </div>
  );
}
