/**
 * Loading state for Email Detail Page
 */

import { Card, CardContent, Skeleton } from '@/components/ui';
import { ArrowLeft } from 'lucide-react';

export default function EmailDetailLoading() {
  return (
    <div className="container max-w-4xl py-6">
      <div className="flex items-center gap-4 mb-6">
        <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
          <ArrowLeft className="h-4 w-4 text-muted-foreground" />
        </div>
        <Skeleton className="h-6 w-64" />
      </div>
      <Card>
        <CardContent className="p-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 p-6 border-b border-border bg-muted/30">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
            <div className="flex gap-1">
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </div>

          {/* Subject */}
          <div className="px-6 py-4 border-b border-border">
            <Skeleton className="h-6 w-3/4 mb-2" />
            <div className="flex gap-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </div>

          {/* Analysis Card */}
          <div className="mx-6 my-4">
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-4 space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
