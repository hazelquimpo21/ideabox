#!/usr/bin/env npx tsx
/**
 * One-Time Script: Backfill Contacts from Emails
 *
 * This script backfills the contacts table from existing email data for all users
 * or a specific user. It's intended for administrative use during deployment of
 * the Enhanced Email Intelligence feature.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Backfill for ALL users:
 *    npx tsx scripts/backfill-contacts.ts
 *
 * 2. Backfill for a SPECIFIC user:
 *    npx tsx scripts/backfill-contacts.ts --user-id=<uuid>
 *
 * 3. Dry run (preview without changes):
 *    npx tsx scripts/backfill-contacts.ts --dry-run
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * PREREQUISITES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Environment variables must be set:
 *    - NEXT_PUBLIC_SUPABASE_URL: Your Supabase project URL
 *    - SUPABASE_SERVICE_ROLE_KEY: Service role key (NOT anon key)
 *
 * 2. Database migrations must be applied (012_contacts.sql)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * WHAT IT DOES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * For each user:
 * 1. Calls backfill_contacts_from_emails(user_id) database function
 * 2. Function aggregates unique sender emails from emails table
 * 3. Creates/updates contacts with email counts, first/last seen dates
 * 4. Reports progress and total contacts processed
 *
 * Safe to run multiple times - uses upsert to prevent duplicates.
 *
 * @module scripts/backfill-contacts
 * @since January 2026
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Script configuration from environment and arguments.
 */
interface ScriptConfig {
  supabaseUrl: string;
  supabaseServiceKey: string;
  specificUserId: string | null;
  dryRun: boolean;
}

/**
 * Parse command line arguments and environment variables.
 */
function parseConfig(): ScriptConfig {
  const args = process.argv.slice(2);

  // Check for required environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL environment variable is not set');
    console.error('   Set it in your .env.local file or export it before running this script');
    process.exit(1);
  }

  if (!supabaseServiceKey) {
    console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable is not set');
    console.error('   This script requires the service role key (not anon key) for admin access');
    console.error('   Find it in your Supabase dashboard: Settings > API > service_role key');
    process.exit(1);
  }

  // Parse command line arguments
  let specificUserId: string | null = null;
  let dryRun = false;

  for (const arg of args) {
    if (arg.startsWith('--user-id=')) {
      specificUserId = arg.split('=')[1];
      if (!specificUserId || specificUserId.length < 36) {
        console.error('❌ Error: Invalid user ID format. Expected UUID.');
        process.exit(1);
      }
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      console.error(`❌ Error: Unknown argument: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }

  return {
    supabaseUrl,
    supabaseServiceKey,
    specificUserId,
    dryRun,
  };
}

/**
 * Print help message.
 */
function printHelp(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                     BACKFILL CONTACTS SCRIPT                                 ║
╚══════════════════════════════════════════════════════════════════════════════╝

DESCRIPTION:
  Populates the contacts table from existing email data for IdeaBox users.

USAGE:
  npx tsx scripts/backfill-contacts.ts [OPTIONS]

OPTIONS:
  --user-id=<uuid>   Backfill contacts for a specific user only
  --dry-run          Preview what would be done without making changes
  --help, -h         Show this help message

EXAMPLES:
  # Backfill all users
  npx tsx scripts/backfill-contacts.ts

  # Backfill specific user
  npx tsx scripts/backfill-contacts.ts --user-id=123e4567-e89b-12d3-a456-426614174000

  # Dry run to preview
  npx tsx scripts/backfill-contacts.ts --dry-run

ENVIRONMENT VARIABLES (required):
  NEXT_PUBLIC_SUPABASE_URL     Your Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY    Service role key for admin access

NOTE:
  This script is safe to run multiple times - it uses upsert to prevent duplicates.
`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * User record from the database.
 */
interface UserRecord {
  id: string;
  email?: string;
}

/**
 * Result of backfilling contacts for a single user.
 */
interface BackfillResult {
  userId: string;
  contactsProcessed: number;
  error?: string;
}

/**
 * Get list of users to backfill.
 *
 * @param supabase - Supabase admin client
 * @param specificUserId - If provided, only return this user
 * @returns Array of user records
 */
async function getUsersToBackfill(
  supabase: SupabaseClient,
  specificUserId: string | null
): Promise<UserRecord[]> {
  console.log('\n📋 Fetching users to backfill...');

  if (specificUserId) {
    // Verify the user exists
    const { data: user, error } = await supabase.auth.admin.getUserById(specificUserId);

    if (error) {
      console.error(`❌ Error fetching user: ${error.message}`);
      throw error;
    }

    if (!user || !user.user) {
      throw new Error(`User not found: ${specificUserId}`);
    }

    return [{ id: user.user.id, email: user.user.email }];
  }

  // Fetch all users
  // Note: This uses the admin API which requires service role key
  const { data, error } = await supabase.auth.admin.listUsers();

  if (error) {
    console.error(`❌ Error fetching users: ${error.message}`);
    throw error;
  }

  const users = data?.users ?? [];
  console.log(`   Found ${users.length} users`);

  return users.map(u => ({ id: u.id, email: u.email }));
}

/**
 * Backfill contacts for a single user.
 *
 * @param supabase - Supabase admin client
 * @param userId - User ID to backfill
 * @param dryRun - If true, don't make changes
 * @returns Backfill result
 */
async function backfillUserContacts(
  supabase: SupabaseClient,
  userId: string,
  dryRun: boolean
): Promise<BackfillResult> {
  if (dryRun) {
    // In dry run mode, count emails instead of backfilling
    const { count, error } = await supabase
      .from('emails')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      return { userId, contactsProcessed: 0, error: error.message };
    }

    // Estimate unique contacts (rough estimate: ~20% of emails are unique senders)
    const estimatedContacts = Math.round((count ?? 0) * 0.2);
    return { userId, contactsProcessed: estimatedContacts };
  }

  // Call the database function to perform the backfill
  const { data: contactsCount, error } = await supabase.rpc(
    'backfill_contacts_from_emails',
    { p_user_id: userId }
  );

  if (error) {
    return { userId, contactsProcessed: 0, error: error.message };
  }

  return { userId, contactsProcessed: contactsCount ?? 0 };
}

/**
 * Main function - orchestrates the backfill process.
 */
async function main(): Promise<void> {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║           IDEABOX CONTACT BACKFILL SCRIPT                        ║');
  console.log('║           Part of Enhanced Email Intelligence                    ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  // Parse configuration
  const config = parseConfig();

  if (config.dryRun) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be made');
  }

  // Create Supabase admin client
  console.log('\n🔌 Connecting to Supabase...');
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    // Get users to backfill
    const users = await getUsersToBackfill(supabase, config.specificUserId);

    if (users.length === 0) {
      console.log('\n⚠️  No users found to backfill');
      process.exit(0);
    }

    // Process each user
    console.log(`\n🚀 Starting backfill for ${users.length} user(s)...\n`);

    let totalContactsProcessed = 0;
    let successCount = 0;
    let errorCount = 0;
    const errors: { userId: string; error: string }[] = [];

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const progress = `[${i + 1}/${users.length}]`;

      process.stdout.write(`${progress} Processing user ${user.email || user.id}... `);

      const result = await backfillUserContacts(supabase, user.id, config.dryRun);

      if (result.error) {
        console.log(`❌ Error: ${result.error}`);
        errorCount++;
        errors.push({ userId: user.id, error: result.error });
      } else {
        console.log(`✅ ${result.contactsProcessed} contacts`);
        successCount++;
        totalContactsProcessed += result.contactsProcessed;
      }

      // Small delay to avoid rate limiting
      if (i < users.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Print summary
    console.log('\n' + '═'.repeat(70));
    console.log('                          SUMMARY');
    console.log('═'.repeat(70));
    console.log(`  Users processed:     ${users.length}`);
    console.log(`  Successful:          ${successCount}`);
    console.log(`  Failed:              ${errorCount}`);
    console.log(`  Total contacts:      ${totalContactsProcessed}${config.dryRun ? ' (estimated)' : ''}`);
    console.log('═'.repeat(70));

    if (errors.length > 0) {
      console.log('\n❌ ERRORS:');
      for (const err of errors) {
        console.log(`   - User ${err.userId}: ${err.error}`);
      }
    }

    if (config.dryRun) {
      console.log('\n💡 This was a dry run. Run without --dry-run to apply changes.');
    } else {
      console.log('\n✅ Backfill completed successfully!');
    }

    process.exit(errorCount > 0 ? 1 : 0);

  } catch (error) {
    console.error('\n❌ Fatal error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

main();
