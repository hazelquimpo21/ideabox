/**
 * Supabase Server Client
 *
 * Creates Supabase clients for use in server contexts (API routes,
 * server components, server actions).
 *
 * TWO CLIENT TYPES:
 * 1. createServerClient - Uses cookies for auth, respects RLS
 * 2. createServiceClient - Uses service role key, bypasses RLS
 *
 * WHEN TO USE createServerClient:
 * - Most server operations where user is logged in
 * - Server components fetching user data
 * - API routes that need user context
 *
 * WHEN TO USE createServiceClient:
 * - Background jobs (no user session)
 * - Admin operations
 * - Bulk operations across users
 * - Edge Functions triggered by pg_cron
 *
 * SECURITY WARNING:
 * The service role key bypasses ALL RLS policies.
 * Only use it when absolutely necessary and never expose it to clients.
 */

import { createServerClient as createSSRServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('SupabaseServer');

/**
 * Creates a Supabase client for server-side operations with user context.
 *
 * This client:
 * - Uses cookies for authentication
 * - Respects Row Level Security policies
 * - Has access to the current user's session
 *
 * @returns Supabase client instance typed with our database schema
 *
 * @example
 * ```typescript
 * // In a server component or API route
 * import { createServerClient } from '@/lib/supabase/server';
 *
 * export async function GET() {
 *   const supabase = await createServerClient();
 *   const { data: { user } } = await supabase.auth.getUser();
 *
 *   const { data: emails } = await supabase
 *     .from('emails')
 *     .select('*')
 *     .eq('user_id', user.id); // RLS would handle this anyway
 * }
 * ```
 */
export async function createServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    logger.error('Missing Supabase environment variables');
    throw new Error(
      'Missing Supabase environment variables. ' +
      'Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.'
    );
  }

  const cookieStore = await cookies();

  return createSSRServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing sessions.
        }
      },
    },
  });
}

/**
 * Creates a Supabase client with service role privileges.
 *
 * WARNING: This client BYPASSES all Row Level Security policies.
 * Use only for:
 * - Background jobs without user context
 * - Admin operations
 * - Bulk operations across multiple users
 * - Edge Functions triggered by pg_cron
 *
 * NEVER expose this client to the browser or client code.
 *
 * @returns Supabase client with service role privileges
 *
 * @example
 * ```typescript
 * // In a background job
 * import { createServiceClient } from '@/lib/supabase/server';
 *
 * export async function syncAllAccounts() {
 *   const supabase = createServiceClient();
 *
 *   // This query returns ALL users' accounts (bypasses RLS)
 *   const { data: accounts } = await supabase
 *     .from('gmail_accounts')
 *     .select('*')
 *     .eq('sync_enabled', true);
 * }
 * ```
 */
export function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    logger.error('Missing Supabase service role configuration');
    throw new Error(
      'Missing Supabase service role key. ' +
      'Ensure SUPABASE_SERVICE_ROLE_KEY is set (required for background jobs).'
    );
  }

  logger.debug('Creating service client (RLS bypassed)');

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
