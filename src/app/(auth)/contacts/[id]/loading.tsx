/**
 * Contact Detail Loading State
 *
 * Next.js loading component that displays while the contact detail page
 * is being loaded. Uses skeleton components to match the layout of the
 * actual page content.
 *
 * @module app/(auth)/contacts/[id]/loading
 * @version 1.0.0
 * @since January 2026 (P6 Enhancement)
 */

import { Skeleton, Card, CardContent, CardHeader } from '@/components/ui';

/**
 * Loading skeleton for the contact detail page.
 * Automatically shown by Next.js while the page component is loading.
 */
export default function ContactDetailLoading() {
  return (
    <div className="container max-w-4xl py-6 space-y-6">
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* Header Skeleton */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <Skeleton className="h-10 w-10 rounded-md" />
        <div className="flex-1">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48 mt-2" />
        </div>
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-20" />
      </div>

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* Profile Card Skeleton */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-16" />
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-32" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* Stats Cards Skeleton */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-4">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-20 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* Notes Section Skeleton */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-12" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
          <div className="flex justify-end mt-3">
            <Skeleton className="h-9 w-24" />
          </div>
        </CardContent>
      </Card>

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* Email History Skeleton */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-8 w-20" />
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
