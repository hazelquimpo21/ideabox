/**
 * Supabase Browser Client
 *
 * Creates a Supabase client for use in browser/client components.
 * Uses the anon key which respects Row Level Security (RLS) policies.
 *
 * WHEN TO USE THIS:
 * - Client components (React components with 'use client')
 * - Browser-side data fetching
 * - Real-time subscriptions
 *
 * WHEN TO USE SERVER CLIENT INSTEAD:
 * - Server components
 * - API routes
 * - Server actions
 * - Operations needing service role key
 *
 * SECURITY NOTE:
 * The anon key is safe to expose in the browser because:
 * 1. It only grants access based on RLS policies
 * 2. Users can only access their own data
 * 3. All table operations are protected by RLS
 */

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

/**
 * Creates a Supabase client for browser use.
 *
 * This client:
 * - Uses the public anon key (safe for browser)
 * - Respects Row Level Security policies
 * - Automatically handles auth state
 *
 * @returns Supabase client instance typed with our database schema
 *
 * @example
 * ```typescript
 * 'use client';
 * import { createClient } from '@/lib/supabase/client';
 *
 * function MyComponent() {
 *   const supabase = createClient();
 *
 *   useEffect(() => {
 *     async function fetchEmails() {
 *       const { data, error } = await supabase
 *         .from('emails')
 *         .select('*')
 *         .order('date', { ascending: false });
 *       // RLS ensures only user's own emails are returned
 *     }
 *     fetchEmails();
 *   }, []);
 * }
 * ```
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables. ' +
      'Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.'
    );
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      // Disable lock to prevent "signal is aborted" errors with React StrictMode
      // This is safe because we handle session state in our own context
      lock: async (name, acquireTimeout, fn) => {
        // Just run the function without locking
        return await fn();
      },
    },
  });
}
