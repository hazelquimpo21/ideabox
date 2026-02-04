/**
 * Inbox Page Redirect
 *
 * DEPRECATED (Jan 2026): The inbox has been replaced by the Discover-first architecture.
 * This page redirects all traffic to /discover for backwards compatibility.
 *
 * If a category filter is present (?category=X), it opens the category modal.
 *
 * @module app/(auth)/inbox/page
 * @see /discover for the new primary email interface
 */

'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('InboxRedirect');

/**
 * Redirects to Discover page.
 * Preserves category filter by redirecting to /discover?modal=category
 */
export default function InboxRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const category = searchParams.get('category');

    if (category) {
      // Redirect to discover with modal open for that category
      logger.info('Redirecting inbox to discover with category', { category });
      router.replace(`/discover?modal=${category}`);
    } else {
      // Simple redirect to discover
      logger.info('Redirecting inbox to discover');
      router.replace('/discover');
    }
  }, [router, searchParams]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <Spinner size="lg" />
        <p className="mt-4 text-muted-foreground">Redirecting to Discover...</p>
      </div>
    </div>
  );
}
