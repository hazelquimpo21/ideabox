/**
 * Category Cards View Page
 *
 * Displays emails grouped by category in a Kanban-style horizontal layout.
 * Each category appears as a "pile" of email cards with AI-generated summaries.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Horizontal scrollable grid of category columns
 * - Each column shows emails in that category with AI summaries
 * - Click on card to view email details in side panel
 * - Quick actions (star, reply) from cards
 * - Filter to show only categories with emails
 * - Toggle to show/hide empty categories
 *
 * @module app/(auth)/inbox/categories/page
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, LayoutGrid, List, Filter, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';
import { CategoryColumn } from '@/components/categories';
import { CATEGORY_DISPLAY, type EmailCategory } from '@/types/discovery';
import type { Email } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('CategoryCardsPage');

/** All categories in display order */
const CATEGORY_ORDER: EmailCategory[] = [
  'client_pipeline',
  'business_work_general',
  'personal_friends_family',
  'family_kids_school',
  'family_health_appointments',
  'finance',
  'shopping',
  'newsletters_general',
  'news_politics',
  'product_updates',
  'local',
  'travel',
];

/** Max emails to fetch per category */
const EMAILS_PER_CATEGORY = 10;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface CategoryData {
  category: EmailCategory;
  emails: Email[];
  totalCount: number;
  unreadCount: number;
  isLoading: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function CategoryCardsPage() {
  // ───────────────────────────────────────────────────────────────────────────
  // State
  // ───────────────────────────────────────────────────────────────────────────

  const [categoryData, setCategoryData] = React.useState<Map<EmailCategory, CategoryData>>(
    new Map()
  );
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showEmptyCategories, setShowEmptyCategories] = React.useState(false);
  const [selectedEmail, setSelectedEmail] = React.useState<Email | null>(null);

  const supabase = React.useMemo(() => createClient(), []);

  // ───────────────────────────────────────────────────────────────────────────
  // Fetch All Categories
  // ───────────────────────────────────────────────────────────────────────────

  const fetchAllCategories = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    logger.start('Fetching emails for all categories');

    try {
      // Fetch emails grouped by category
      const { data: emails, error: queryError } = await supabase
        .from('emails')
        .select('*')
        .eq('is_archived', false)
        .order('date', { ascending: false })
        .limit(500); // Get enough emails to distribute across categories

      if (queryError) {
        throw new Error(queryError.message);
      }

      // Group emails by category
      const grouped = new Map<EmailCategory, Email[]>();
      CATEGORY_ORDER.forEach((cat) => grouped.set(cat, []));

      for (const email of emails || []) {
        const cat = email.category as EmailCategory | null;
        if (cat && grouped.has(cat)) {
          const list = grouped.get(cat)!;
          if (list.length < EMAILS_PER_CATEGORY) {
            list.push(email);
          }
        }
      }

      // Build category data map
      const newData = new Map<EmailCategory, CategoryData>();

      for (const category of CATEGORY_ORDER) {
        const catEmails = grouped.get(category) || [];
        const allCatEmails = (emails || []).filter(
          (e: Email) => e.category === category
        );

        newData.set(category, {
          category,
          emails: catEmails,
          totalCount: allCatEmails.length,
          unreadCount: allCatEmails.filter((e: Email) => !e.is_read).length,
          isLoading: false,
        });
      }

      setCategoryData(newData);
      logger.success('Categories loaded', {
        totalEmails: emails?.length || 0,
        categoriesWithEmails: CATEGORY_ORDER.filter(
          (c) => (newData.get(c)?.totalCount || 0) > 0
        ).length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to fetch categories', { error: message });
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  // Initial fetch
  React.useEffect(() => {
    fetchAllCategories();
  }, [fetchAllCategories]);

  // ───────────────────────────────────────────────────────────────────────────
  // Handlers
  // ───────────────────────────────────────────────────────────────────────────

  const handleEmailClick = (email: Email) => {
    setSelectedEmail(email);
  };

  const handleToggleStar = async (email: Email) => {
    const newStarred = !email.is_starred;

    // Optimistic update
    setCategoryData((prev: Map<EmailCategory, CategoryData>) => {
      const newMap = new Map(prev);
      const cat = email.category as EmailCategory;
      const catData = newMap.get(cat);
      if (catData) {
        newMap.set(cat, {
          ...catData,
          emails: catData.emails.map((e: Email) =>
            e.id === email.id ? { ...e, is_starred: newStarred } : e
          ),
        });
      }
      return newMap;
    });

    // Update in database
    try {
      await supabase
        .from('emails')
        .update({ is_starred: newStarred })
        .eq('id', email.id);
    } catch (err) {
      logger.error('Failed to toggle star', { emailId: email.id });
      // Revert on error
      setCategoryData((prev: Map<EmailCategory, CategoryData>) => {
        const newMap = new Map(prev);
        const cat = email.category as EmailCategory;
        const catData = newMap.get(cat);
        if (catData) {
          newMap.set(cat, {
            ...catData,
            emails: catData.emails.map((e: Email) =>
              e.id === email.id ? { ...e, is_starred: !newStarred } : e
            ),
          });
        }
        return newMap;
      });
    }
  };

  const handleCloseSheet = () => {
    setSelectedEmail(null);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Derived State
  // ───────────────────────────────────────────────────────────────────────────

  const visibleCategories = CATEGORY_ORDER.filter((cat) => {
    if (showEmptyCategories) return true;
    const data = categoryData.get(cat);
    return data && data.totalCount > 0;
  });

  const categoryValues = Array.from(categoryData.values());
  const totalEmails = categoryValues.reduce(
    (sum, d) => sum + (d?.totalCount || 0),
    0
  );

  const totalUnread = categoryValues.reduce(
    (sum, d) => sum + (d?.unreadCount || 0),
    0
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Render: Loading
  // ───────────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="border-b p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-8 w-48" />
            </div>
            <Skeleton className="h-8 w-32" />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 overflow-x-auto">
          <div className="flex gap-4 min-w-max">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="w-[300px] space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Render: Error
  // ───────────────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <p className="text-destructive">Failed to load emails: {error}</p>
        <Button onClick={fetchAllCategories}>Retry</Button>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b p-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          {/* Left: Back button and title */}
          <div className="flex items-center gap-3">
            <Link href="/inbox">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-semibold flex items-center gap-2">
                <LayoutGrid className="h-5 w-5" />
                Category View
              </h1>
              <p className="text-sm text-muted-foreground">
                {totalEmails} emails • {totalUnread} unread
              </p>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Toggle empty categories */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEmptyCategories(!showEmptyCategories)}
              className="gap-2"
            >
              {showEmptyCategories ? (
                <>
                  <EyeOff className="h-4 w-4" />
                  Hide Empty
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4" />
                  Show All
                </>
              )}
            </Button>

            {/* Switch to list view */}
            <Link href="/inbox">
              <Button variant="outline" size="sm" className="gap-2">
                <List className="h-4 w-4" />
                List View
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Category Columns - Horizontal Scroll */}
      <div className="flex-1 p-4 overflow-x-auto">
        <div className="flex gap-4 min-w-max pb-4">
          {visibleCategories.map((category) => {
            const data = categoryData.get(category);
            if (!data) return null;

            return (
              <CategoryColumn
                key={category}
                category={category}
                emails={data.emails}
                totalCount={data.totalCount}
                unreadCount={data.unreadCount}
                isLoading={data.isLoading}
                onEmailClick={handleEmailClick}
                onToggleStar={handleToggleStar}
                maxVisible={5}
              />
            );
          })}
        </div>
      </div>

      {/* Email Detail Sheet */}
      <Sheet open={!!selectedEmail} onOpenChange={handleCloseSheet}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selectedEmail && (
            <>
              <SheetHeader>
                <SheetTitle className="text-left pr-8">
                  {selectedEmail.subject || '(No subject)'}
                </SheetTitle>
              </SheetHeader>

              <div className="mt-4 space-y-4">
                {/* Sender info */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {selectedEmail.sender_name || selectedEmail.sender_email}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedEmail.sender_email}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {CATEGORY_DISPLAY[selectedEmail.category as EmailCategory]?.label ||
                      selectedEmail.category}
                  </Badge>
                </div>

                {/* AI Summary */}
                {selectedEmail.summary && (
                  <div className="bg-muted/50 rounded-lg p-4">
                    <p className="text-sm font-medium mb-1">AI Summary</p>
                    <p className="text-sm text-muted-foreground italic">
                      &ldquo;{selectedEmail.summary}&rdquo;
                    </p>
                  </div>
                )}

                {/* Email snippet/preview */}
                <div>
                  <p className="text-sm font-medium mb-2">Preview</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedEmail.snippet || 'No preview available'}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-4 border-t">
                  <Link href={`/inbox/${selectedEmail.id}`} className="flex-1">
                    <Button className="w-full">View Full Email</Button>
                  </Link>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
