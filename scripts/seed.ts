// @ts-nocheck - Seed script with dynamic Supabase types
/**
 * 🌱 Database Seed Script
 *
 * Populates the database with realistic test data for development.
 * This script requires the SUPABASE_SERVICE_ROLE_KEY environment variable.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Run with npm:
 *   npm run seed
 *
 * Or directly with tsx:
 *   npx tsx scripts/seed.ts
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * WHAT IT CREATES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - 5 Clients (Acme Corp, StartupXYZ, etc.)
 * - 15 Emails (across all categories)
 * - 8 Actions (pending, in-progress, completed)
 *
 * NOTE: This script is idempotent - it checks for existing data before inserting.
 *
 * @module scripts/seed
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing environment variables:');
  console.error('  - NEXT_PUBLIC_SUPABASE_URL');
  console.error('  - SUPABASE_SERVICE_ROLE_KEY');
  console.error('\nMake sure you have a .env.local file with these values.');
  process.exit(1);
}

// Create admin client (bypasses RLS)
const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// SEED DATA
// ═══════════════════════════════════════════════════════════════════════════════

const CLIENTS = [
  {
    name: 'Acme Corp',
    company: 'Acme Corporation',
    email: 'contact@acme.com',
    status: 'active' as const,
    priority: 'vip' as const,
    email_domains: ['@acme.com', '@acme.co'],
    keywords: ['project', 'timeline', 'enterprise'],
    notes: 'Key enterprise client. High-value contract.',
  },
  {
    name: 'StartupXYZ',
    company: 'XYZ Ventures',
    email: 'hello@xyz.io',
    status: 'active' as const,
    priority: 'high' as const,
    email_domains: ['@xyz.io'],
    keywords: ['mvp', 'funding', 'startup'],
    notes: 'Fast-growing startup. Quick decision makers.',
  },
  {
    name: 'TechCorp',
    company: 'TechCorp Industries',
    email: 'team@techcorp.com',
    status: 'active' as const,
    priority: 'medium' as const,
    email_domains: ['@techcorp.com'],
    keywords: ['tech', 'innovation'],
    notes: null,
  },
  {
    name: 'Creative Agency',
    company: 'Creative Design Co',
    email: 'projects@creative.design',
    status: 'active' as const,
    priority: 'medium' as const,
    email_domains: ['@creative.design'],
    keywords: ['design', 'branding'],
    notes: 'Great for design collaboration.',
  },
  {
    name: 'Legacy Systems',
    company: 'Legacy Systems Inc',
    email: 'support@legacy-systems.com',
    status: 'inactive' as const,
    priority: 'low' as const,
    email_domains: ['@legacy-systems.com'],
    keywords: ['maintenance', 'legacy'],
    notes: 'Occasional maintenance work.',
  },
];

const generateEmails = (userId: string, gmailAccountId: string, clientIds: Record<string, string>) => [
  // Action Required
  {
    user_id: userId,
    gmail_account_id: gmailAccountId,
    gmail_id: 'gmail-001',
    thread_id: 'thread-001',
    subject: 'Q4 Budget Review Required',
    sender_email: 'sarah@acme.com',
    sender_name: 'Sarah Chen',
    date: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 min ago
    snippet: 'Hi, please review the attached budget proposal for Q4. We need your approval by Friday...',
    category: 'clients' as const, // REFACTORED: was 'action_required'
    priority_score: 8,
    is_read: false,
    is_starred: true,
    is_archived: false,
    client_id: clientIds['Acme Corp'],
    topics: ['budget', 'Q4', 'review'],
  },
  {
    user_id: userId,
    gmail_account_id: gmailAccountId,
    gmail_id: 'gmail-002',
    thread_id: 'thread-002',
    subject: 'Contract Terms - Need Your Feedback',
    sender_email: 'legal@xyz.io',
    sender_name: 'XYZ Legal Team',
    date: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(), // 3 hours ago
    snippet: 'Please review the attached contract terms and let us know if you have any concerns...',
    category: 'clients' as const, // REFACTORED: was 'action_required'
    priority_score: 9,
    is_read: false,
    is_starred: true,
    is_archived: false,
    client_id: clientIds['StartupXYZ'],
    topics: ['contract', 'legal', 'review'],
  },
  {
    user_id: userId,
    gmail_account_id: gmailAccountId,
    gmail_id: 'gmail-003',
    thread_id: 'thread-003',
    subject: 'Quick Question About Timeline',
    sender_email: 'mike@techcorp.com',
    sender_name: 'Mike Johnson',
    date: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), // 5 hours ago
    snippet: 'Hey, quick question - can we push the deadline by a week? Let me know...',
    category: 'clients' as const, // REFACTORED: was 'action_required'
    priority_score: 6,
    is_read: true,
    is_starred: false,
    is_archived: false,
    client_id: clientIds['TechCorp'],
    topics: ['timeline', 'deadline'],
  },
  // Events
  {
    user_id: userId,
    gmail_account_id: gmailAccountId,
    gmail_id: 'gmail-004',
    thread_id: 'thread-004',
    subject: 'Team Standup - Tomorrow 10am',
    sender_email: 'calendar@company.com',
    sender_name: 'Calendar',
    date: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    snippet: 'You have been invited to: Team Standup. When: Tomorrow at 10:00 AM...',
    category: 'local' as const, // REFACTORED: was 'event'
    priority_score: 5,
    is_read: false,
    is_starred: false,
    is_archived: false,
    client_id: null,
    topics: ['meeting', 'standup'],
  },
  {
    user_id: userId,
    gmail_account_id: gmailAccountId,
    gmail_id: 'gmail-005',
    thread_id: 'thread-005',
    subject: 'Webinar: AI in Business - Register Now',
    sender_email: 'events@techconf.io',
    sender_name: 'TechConf',
    date: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    snippet: 'Join us for an exclusive webinar on AI applications in business...',
    category: 'local' as const, // REFACTORED: was 'event'
    priority_score: 3,
    is_read: true,
    is_starred: false,
    is_archived: false,
    client_id: null,
    topics: ['webinar', 'AI', 'business'],
  },
  // Newsletters
  {
    user_id: userId,
    gmail_account_id: gmailAccountId,
    gmail_id: 'gmail-006',
    thread_id: 'thread-006',
    subject: 'Weekly Industry Digest',
    sender_email: 'digest@techcrunch.com',
    sender_name: 'TechCrunch',
    date: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    snippet: 'This week in tech: AI breakthroughs, startup funding rounds, and more...',
    category: 'newsletters_creator' as const, // REFACTORED: was 'newsletter'
    priority_score: 2,
    is_read: true,
    is_starred: false,
    is_archived: false,
    client_id: null,
    topics: ['tech', 'news', 'digest'],
  },
  {
    user_id: userId,
    gmail_account_id: gmailAccountId,
    gmail_id: 'gmail-007',
    thread_id: 'thread-007',
    subject: 'JavaScript Weekly #625',
    sender_email: 'newsletter@javascriptweekly.com',
    sender_name: 'JavaScript Weekly',
    date: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    snippet: 'The latest JavaScript news, articles, and tutorials...',
    category: 'newsletters_creator' as const, // REFACTORED: was 'newsletter'
    priority_score: 2,
    is_read: false,
    is_starred: false,
    is_archived: false,
    client_id: null,
    topics: ['javascript', 'programming'],
  },
  // Admin
  {
    user_id: userId,
    gmail_account_id: gmailAccountId,
    gmail_id: 'gmail-008',
    thread_id: 'thread-008',
    subject: 'Your AWS Bill for December',
    sender_email: 'billing@aws.amazon.com',
    sender_name: 'AWS Billing',
    date: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    snippet: 'Your AWS bill for the billing period December 1-31 is now available...',
    category: 'finance' as const, // REFACTORED: was 'admin'
    priority_score: 4,
    is_read: true,
    is_starred: false,
    is_archived: false,
    client_id: null,
    topics: ['billing', 'AWS'],
  },
  {
    user_id: userId,
    gmail_account_id: gmailAccountId,
    gmail_id: 'gmail-009',
    thread_id: 'thread-009',
    subject: 'Password Reset Successful',
    sender_email: 'security@github.com',
    sender_name: 'GitHub',
    date: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    snippet: 'Your password has been successfully reset. If you did not request this...',
    category: 'finance' as const, // REFACTORED: was 'admin'
    priority_score: 3,
    is_read: true,
    is_starred: false,
    is_archived: false,
    client_id: null,
    topics: ['security', 'password'],
  },
  // Personal
  {
    user_id: userId,
    gmail_account_id: gmailAccountId,
    gmail_id: 'gmail-010',
    thread_id: 'thread-010',
    subject: 'Catch up soon?',
    sender_email: 'friend@gmail.com',
    sender_name: 'Alex Friend',
    date: new Date(Date.now() - 1000 * 60 * 60 * 96).toISOString(),
    snippet: "Hey! It's been a while. Would love to grab coffee and catch up...",
    category: 'personal_friends_family' as const, // REFACTORED: was 'personal'
    priority_score: 4,
    is_read: true,
    is_starred: false,
    is_archived: false,
    client_id: null,
    topics: ['personal', 'coffee'],
  },
  // Promo
  {
    user_id: userId,
    gmail_account_id: gmailAccountId,
    gmail_id: 'gmail-011',
    thread_id: 'thread-011',
    subject: '50% Off Premium Plan - Limited Time',
    sender_email: 'sales@saasproduct.com',
    sender_name: 'SaaS Product',
    date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    snippet: 'Upgrade to Premium and save 50%! This offer expires soon...',
    category: 'shopping' as const, // REFACTORED: was 'promo'
    priority_score: 1,
    is_read: false,
    is_starred: false,
    is_archived: false,
    client_id: null,
    topics: ['sale', 'promotion'],
  },
  // More action items
  {
    user_id: userId,
    gmail_account_id: gmailAccountId,
    gmail_id: 'gmail-012',
    thread_id: 'thread-012',
    subject: 'Design Review Needed',
    sender_email: 'design@creative.design',
    sender_name: 'Creative Team',
    date: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    snippet: 'We have finished the initial mockups. Please review and provide feedback...',
    category: 'clients' as const, // REFACTORED: was 'action_required'
    priority_score: 7,
    is_read: false,
    is_starred: false,
    is_archived: false,
    client_id: clientIds['Creative Agency'],
    topics: ['design', 'review', 'mockups'],
  },
  {
    user_id: userId,
    gmail_account_id: gmailAccountId,
    gmail_id: 'gmail-013',
    thread_id: 'thread-013',
    subject: 'Invoice #1234 - Payment Reminder',
    sender_email: 'billing@acme.com',
    sender_name: 'Acme Billing',
    date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    snippet: 'This is a reminder that invoice #1234 is due in 7 days...',
    category: 'finance' as const, // REFACTORED: was 'admin'
    priority_score: 6,
    is_read: true,
    is_starred: true,
    is_archived: false,
    client_id: clientIds['Acme Corp'],
    topics: ['invoice', 'billing', 'payment'],
  },
  {
    user_id: userId,
    gmail_account_id: gmailAccountId,
    gmail_id: 'gmail-014',
    thread_id: 'thread-014',
    subject: 'Project Kickoff Meeting - Next Week',
    sender_email: 'pm@xyz.io',
    sender_name: 'XYZ PM',
    date: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    snippet: 'Scheduling a kickoff meeting for next week. Please confirm your availability...',
    category: 'local' as const, // REFACTORED: was 'event'
    priority_score: 7,
    is_read: false,
    is_starred: true,
    is_archived: false,
    client_id: clientIds['StartupXYZ'],
    topics: ['meeting', 'kickoff', 'project'],
  },
  {
    user_id: userId,
    gmail_account_id: gmailAccountId,
    gmail_id: 'gmail-015',
    thread_id: 'thread-015',
    subject: 'FYI: Market Research Report',
    sender_email: 'research@techcorp.com',
    sender_name: 'TechCorp Research',
    date: new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString(),
    snippet: 'Sharing the latest market research report for your reference. No action needed...',
    category: 'newsletters_creator' as const, // REFACTORED: was 'newsletter'
    priority_score: 3,
    is_read: true,
    is_starred: false,
    is_archived: false,
    client_id: clientIds['TechCorp'],
    topics: ['research', 'market', 'report'],
  },
];

const generateActions = (userId: string, emailIds: Record<string, string>, clientIds: Record<string, string>) => [
  {
    user_id: userId,
    email_id: emailIds['Q4 Budget Review Required'],
    client_id: clientIds['Acme Corp'],
    title: 'Review Q4 budget proposal',
    description: 'Review the attached budget proposal and provide approval or feedback by Friday.',
    action_type: 'review' as const,
    priority: 'high' as const,
    urgency_score: 8,
    deadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString(), // 3 days
    estimated_minutes: 30,
    status: 'pending' as const,
  },
  {
    user_id: userId,
    email_id: emailIds['Contract Terms - Need Your Feedback'],
    client_id: clientIds['StartupXYZ'],
    title: 'Review contract terms',
    description: 'Review legal terms in contract and note any concerns.',
    action_type: 'review' as const,
    priority: 'urgent' as const,
    urgency_score: 9,
    deadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2).toISOString(), // 2 days
    estimated_minutes: 45,
    status: 'pending' as const,
  },
  {
    user_id: userId,
    email_id: emailIds['Quick Question About Timeline'],
    client_id: clientIds['TechCorp'],
    title: 'Reply to Mike about timeline',
    description: 'Respond to timeline extension request.',
    action_type: 'respond' as const,
    priority: 'medium' as const,
    urgency_score: 6,
    deadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 1).toISOString(), // 1 day
    estimated_minutes: 10,
    status: 'in_progress' as const,
  },
  {
    user_id: userId,
    email_id: emailIds['Design Review Needed'],
    client_id: clientIds['Creative Agency'],
    title: 'Review design mockups',
    description: 'Review the initial mockups and provide design feedback.',
    action_type: 'review' as const,
    priority: 'high' as const,
    urgency_score: 7,
    deadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 4).toISOString(), // 4 days
    estimated_minutes: 60,
    status: 'pending' as const,
  },
  {
    user_id: userId,
    email_id: emailIds['Project Kickoff Meeting - Next Week'],
    client_id: clientIds['StartupXYZ'],
    title: 'Confirm kickoff meeting availability',
    description: 'Reply with available times for next week kickoff meeting.',
    action_type: 'schedule' as const,
    priority: 'high' as const,
    urgency_score: 7,
    deadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2).toISOString(),
    estimated_minutes: 5,
    status: 'pending' as const,
  },
  {
    user_id: userId,
    email_id: null,
    client_id: clientIds['Acme Corp'],
    title: 'Prepare monthly status report',
    description: 'Create monthly status report for Acme Corp project.',
    action_type: 'create' as const,
    priority: 'medium' as const,
    urgency_score: 5,
    deadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(), // 1 week
    estimated_minutes: 90,
    status: 'pending' as const,
  },
  {
    user_id: userId,
    email_id: null,
    client_id: null,
    title: 'Update project documentation',
    description: 'Update README and API documentation.',
    action_type: 'create' as const,
    priority: 'low' as const,
    urgency_score: 3,
    deadline: null,
    estimated_minutes: 120,
    status: 'completed' as const,
    completed_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    user_id: userId,
    email_id: null,
    client_id: clientIds['TechCorp'],
    title: 'Send weekly progress update',
    description: 'Weekly update email to TechCorp stakeholders.',
    action_type: 'respond' as const,
    priority: 'medium' as const,
    urgency_score: 5,
    deadline: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(), // 12 hours ago (overdue)
    estimated_minutes: 15,
    status: 'completed' as const,
    completed_at: new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString(),
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SEED FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

async function getOrCreateTestUser(): Promise<string> {
  console.log('Checking for existing user...');

  // Get the first user in the system
  const { data: users } = await supabase
    .from('user_profiles')
    .select('id')
    .limit(1) as { data: Array<{ id: string }> | null };

  if (users && users.length > 0) {
    const firstUser = users[0]!;
    console.log(`  Found existing user: ${firstUser.id}`);
    return firstUser.id;
  }

  console.error('No users found. Please sign up first, then run seed.');
  console.error('Visit http://localhost:3000 to create an account.');
  process.exit(1);
}

async function getOrCreateGmailAccount(userId: string): Promise<string> {
  console.log('Checking for Gmail account...');

  // Check for existing Gmail account
  const { data: accounts } = await supabase
    .from('gmail_accounts')
    .select('id')
    .eq('user_id', userId)
    .limit(1) as { data: Array<{ id: string }> | null };

  if (accounts && accounts.length > 0) {
    const firstAccount = accounts[0]!;
    console.log(`  Found existing Gmail account: ${firstAccount.id}`);
    return firstAccount.id;
  }

  // Create a mock Gmail account for seeding
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: newAccount, error } = await (supabase as any)
    .from('gmail_accounts')
    .insert({
      user_id: userId,
      email: 'test@gmail.com',
      display_name: 'Test Account',
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      token_expiry: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      sync_enabled: false, // Disabled since it's mock
    })
    .select()
    .single() as { data: { id: string } | null; error: Error | null };

  if (error || !newAccount) {
    console.error('Failed to create Gmail account:', error?.message || 'Unknown error');
    process.exit(1);
  }

  console.log(`  Created mock Gmail account: ${newAccount.id}`);
  return newAccount.id;
}

async function seedClients(userId: string): Promise<Record<string, string>> {
  console.log('Seeding clients...');
  const clientIds: Record<string, string> = {};

  for (const client of CLIENTS) {
    // Check if client exists
    const { data: existing } = await supabase
      .from('clients')
      .select('id')
      .eq('user_id', userId)
      .eq('name', client.name)
      .single();

    if (existing) {
      console.log(`  Skipping existing client: ${client.name}`);
      clientIds[client.name] = existing.id;
      continue;
    }

    // Insert client
    const { data: newClient, error } = await supabase
      .from('clients')
      .insert({ ...client, user_id: userId })
      .select()
      .single();

    if (error) {
      console.error(`  Failed to create client ${client.name}:`, error.message);
      continue;
    }

    console.log(`  Created client: ${client.name}`);
    clientIds[client.name] = newClient.id;
  }

  return clientIds;
}

async function seedEmails(
  userId: string,
  gmailAccountId: string,
  clientIds: Record<string, string>
): Promise<Record<string, string>> {
  console.log('Seeding emails...');
  const emailIds: Record<string, string> = {};
  const emails = generateEmails(userId, gmailAccountId, clientIds);

  for (const email of emails) {
    // Check if email exists (by gmail_id)
    const { data: existing } = await supabase
      .from('emails')
      .select('id')
      .eq('user_id', userId)
      .eq('gmail_id', email.gmail_id)
      .single();

    if (existing) {
      console.log(`  Skipping existing email: ${email.subject}`);
      emailIds[email.subject] = existing.id;
      continue;
    }

    // Insert email
    const { data: newEmail, error } = await supabase
      .from('emails')
      .insert(email)
      .select()
      .single();

    if (error) {
      console.error(`  Failed to create email "${email.subject}":`, error.message);
      continue;
    }

    console.log(`  Created email: ${email.subject}`);
    emailIds[email.subject] = newEmail.id;
  }

  return emailIds;
}

async function seedActions(
  userId: string,
  emailIds: Record<string, string>,
  clientIds: Record<string, string>
): Promise<void> {
  console.log('Seeding actions...');
  const actions = generateActions(userId, emailIds, clientIds);

  for (const action of actions) {
    // Check if action exists (by title for simplicity)
    const { data: existing } = await supabase
      .from('actions')
      .select('id')
      .eq('user_id', userId)
      .eq('title', action.title)
      .single();

    if (existing) {
      console.log(`  Skipping existing action: ${action.title}`);
      continue;
    }

    // Insert action
    const { error } = await supabase.from('actions').insert(action);

    if (error) {
      console.error(`  Failed to create action "${action.title}":`, error.message);
      continue;
    }

    console.log(`  Created action: ${action.title}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('IdeaBox Database Seed Script');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // Get or create test user
    const userId = await getOrCreateTestUser();

    // Get or create Gmail account
    const gmailAccountId = await getOrCreateGmailAccount(userId);

    // Seed clients
    const clientIds = await seedClients(userId);

    // Seed emails
    const emailIds = await seedEmails(userId, gmailAccountId, clientIds);

    // Seed actions
    await seedActions(userId, emailIds, clientIds);

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('Seed completed successfully!');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`\nCreated data for user: ${userId}`);
    console.log('  - 5 clients');
    console.log('  - 15 emails');
    console.log('  - 8 actions');
    console.log('\nYou can now log in and see the data in the app.');
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
}

main();
