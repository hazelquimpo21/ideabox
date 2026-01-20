#!/usr/bin/env tsx
/**
 * Migration Verification Script
 *
 * Verifies that critical database functions and tables exist.
 * Run this after deploying migrations to catch issues early.
 *
 * Usage:
 *   npx tsx scripts/verify-migrations.ts
 *   # or
 *   npm run verify:migrations
 *
 * Environment variables required:
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY (use service role for full access)
 *
 * @module scripts/verify-migrations
 */

import { createClient } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

interface VerificationResult {
  name: string;
  type: 'function' | 'table' | 'column' | 'index';
  exists: boolean;
  error?: string;
}

const REQUIRED_FUNCTIONS = [
  'upsert_contact_from_email',
  'get_top_contacts',
  'cleanup_old_sync_runs',
  'cleanup_old_push_logs',
  'update_gmail_watch',
  'clear_gmail_watch',
  'get_expiring_watches',
  'get_accounts_needing_watch',
];

const REQUIRED_TABLES = [
  'emails',
  'email_analyses',
  'actions',
  'clients',
  'contacts',
  'extracted_dates',
  'gmail_accounts',
  'user_profiles',
  'scheduled_sync_runs',
  'gmail_push_logs',
  'sync_logs',
];

const REQUIRED_COLUMNS = [
  { table: 'gmail_accounts', column: 'watch_expiration' },
  { table: 'gmail_accounts', column: 'watch_history_id' },
  { table: 'gmail_accounts', column: 'push_enabled' },
  { table: 'gmail_accounts', column: 'last_push_at' },
  { table: 'gmail_accounts', column: 'sync_lock_until' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('🔍 Verifying database migrations...\n');

  // Check environment
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing environment variables:');
    if (!supabaseUrl) console.error('   - SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
    if (!supabaseKey) console.error('   - SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const results: VerificationResult[] = [];

  // ─────────────────────────────────────────────────────────────────────────────
  // Verify tables
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('📋 Checking tables...');

  for (const table of REQUIRED_TABLES) {
    try {
      const { error } = await supabase.from(table).select('*').limit(0);

      if (error && error.code === '42P01') {
        // Table doesn't exist
        results.push({ name: table, type: 'table', exists: false, error: 'Table not found' });
        console.log(`   ❌ ${table} - NOT FOUND`);
      } else if (error) {
        results.push({ name: table, type: 'table', exists: false, error: error.message });
        console.log(`   ⚠️  ${table} - Error: ${error.message}`);
      } else {
        results.push({ name: table, type: 'table', exists: true });
        console.log(`   ✅ ${table}`);
      }
    } catch (err) {
      results.push({
        name: table,
        type: 'table',
        exists: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      console.log(`   ❌ ${table} - Error: ${err}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Verify functions
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n🔧 Checking functions...');

  for (const func of REQUIRED_FUNCTIONS) {
    try {
      // Query pg_proc to check if function exists
      const { data, error } = await supabase.rpc('check_function_exists', {
        function_name: func,
      });

      // If the helper function doesn't exist, try direct query
      if (error && error.code === '42883') {
        // Function not found error - try alternative check
        const { data: funcCheck, error: funcError } = await supabase
          .from('pg_proc')
          .select('proname')
          .eq('proname', func)
          .limit(1);

        // This likely won't work either due to permissions, so we'll test by calling
        results.push({
          name: func,
          type: 'function',
          exists: false,
          error: 'Could not verify - try calling directly',
        });
        console.log(`   ⚠️  ${func} - Could not verify`);
        continue;
      }

      if (data) {
        results.push({ name: func, type: 'function', exists: true });
        console.log(`   ✅ ${func}`);
      } else {
        results.push({ name: func, type: 'function', exists: false });
        console.log(`   ❌ ${func} - NOT FOUND`);
      }
    } catch {
      // Try calling the function directly to verify it exists
      results.push({
        name: func,
        type: 'function',
        exists: false,
        error: 'Verification method unavailable',
      });
      console.log(`   ⚠️  ${func} - Verification method unavailable`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Test critical functions
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n🧪 Testing critical functions...');

  // Test upsert_contact_from_email
  try {
    const testUserId = '00000000-0000-0000-0000-000000000000';
    const { error } = await supabase.rpc('upsert_contact_from_email', {
      p_user_id: testUserId,
      p_email: 'migration-test@example.com',
      p_name: 'Migration Test',
      p_email_date: new Date().toISOString(),
      p_is_sent: false,
    });

    if (error) {
      // Expected to fail with foreign key error (user doesn't exist)
      // But if it's a different error, the function might not exist
      if (error.code === '23503') {
        // Foreign key violation - function exists, just no valid user
        console.log('   ✅ upsert_contact_from_email - Function exists (FK test passed)');
        // Update result
        const idx = results.findIndex((r) => r.name === 'upsert_contact_from_email');
        if (idx >= 0) {
          results[idx] = { name: 'upsert_contact_from_email', type: 'function', exists: true };
        }
      } else if (error.code === '42883') {
        console.log('   ❌ upsert_contact_from_email - FUNCTION NOT FOUND');
        console.log('      Run migration: supabase/migrations/012_contacts.sql');
      } else {
        console.log(`   ⚠️  upsert_contact_from_email - Unexpected error: ${error.message}`);
      }
    } else {
      console.log('   ✅ upsert_contact_from_email - Function works');
      // Clean up test data
      await supabase.from('contacts').delete().eq('email', 'migration-test@example.com');
    }
  } catch (err) {
    console.log(`   ❌ upsert_contact_from_email - Error: ${err}`);
  }

  // Test get_sync_statistics
  try {
    const { data, error } = await supabase.rpc('get_sync_statistics', { p_hours: 1 });

    if (error && error.code === '42883') {
      console.log('   ❌ get_sync_statistics - FUNCTION NOT FOUND');
    } else if (error) {
      console.log(`   ⚠️  get_sync_statistics - Error: ${error.message}`);
    } else {
      console.log('   ✅ get_sync_statistics - Function works');
    }
  } catch (err) {
    console.log(`   ⚠️  get_sync_statistics - ${err}`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Check required columns
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n📊 Checking required columns...');

  for (const { table, column } of REQUIRED_COLUMNS) {
    try {
      // Try selecting the column - will fail if it doesn't exist
      const { error } = await supabase.from(table).select(column).limit(0);

      if (error && error.message.includes('column')) {
        results.push({
          name: `${table}.${column}`,
          type: 'column',
          exists: false,
          error: 'Column not found',
        });
        console.log(`   ❌ ${table}.${column} - NOT FOUND`);
      } else if (error) {
        console.log(`   ⚠️  ${table}.${column} - Error: ${error.message}`);
      } else {
        results.push({ name: `${table}.${column}`, type: 'column', exists: true });
        console.log(`   ✅ ${table}.${column}`);
      }
    } catch (err) {
      console.log(`   ⚠️  ${table}.${column} - ${err}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));

  const missing = results.filter((r) => !r.exists);
  const verified = results.filter((r) => r.exists);

  console.log(`\n✅ Verified: ${verified.length}`);
  console.log(`❌ Missing:  ${missing.length}`);

  if (missing.length > 0) {
    console.log('\n⚠️  Missing items require attention:');
    for (const item of missing) {
      console.log(`   - ${item.type}: ${item.name}`);
      if (item.error) console.log(`     Error: ${item.error}`);
    }

    console.log('\n📝 To fix missing migrations:');
    console.log('   1. Check that all migrations are applied:');
    console.log('      supabase db push');
    console.log('   2. Or run specific migrations in SQL Editor');
    console.log('   3. See supabase/migrations/ for migration files');

    process.exit(1);
  }

  console.log('\n🎉 All migrations verified successfully!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
