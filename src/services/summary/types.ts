/**
 * Email Summary Types
 *
 * Types for the AI-synthesized email summary feature.
 * Summaries are generated on-demand when stale + new data exists,
 * with a 1-hour minimum interval.
 *
 * @module services/summary/types
 * @since February 2026
 */

// ═══════════════════════════════════════════════════════════════════════════════
// AI OUTPUT TYPES (what the AI returns)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A single item within a summary section.
 * References source emails for linking.
 */
export interface SummaryItem {
  /** The narrative bullet point */
  text: string;
  /** Source email IDs for linking */
  email_ids: string[];
  /** Does this need user action? */
  action_needed: boolean;
  /** Urgency level */
  urgency: 'high' | 'medium' | 'low';
}

/**
 * A themed section within a summary.
 * The AI decides which themes to create based on content.
 */
export interface SummarySection {
  /** Theme name, e.g. "Clients", "Deadlines", "FYI", "News" */
  theme: string;
  /** Lucide icon name for display */
  icon: string;
  /** 2-5 narrative bullet points */
  items: SummaryItem[];
}

/**
 * Summary stats — quick numbers at a glance.
 */
export interface SummaryStats {
  new_emails: number;
  threads_active: number;
  actions_pending: number;
  deadlines_upcoming: number;
}

/**
 * The structured output from the AI synthesis call.
 * This is the function-calling schema result.
 */
export interface SummaryResult {
  /** Narrative opening — 1-2 sentences, conversational */
  headline: string;
  /** Themed sections (only present if there's content) */
  sections: SummarySection[];
  /** Quick stats */
  stats: SummaryStats;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL INDEX (for linking summary items back to source emails)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Lightweight metadata for a source email referenced in a summary.
 * Stored as part of the summary so the UI can render links without extra queries.
 */
export interface SummaryEmailRef {
  /** Email subject line */
  subject: string | null;
  /** Sender display name */
  sender: string | null;
  /** Life-bucket category (for building /inbox/[category]/[emailId] links) */
  category: string | null;
}

/**
 * Map of email_id → metadata for all emails referenced in this summary.
 * Enables the UI to render clickable links to source emails.
 */
export type SummaryEmailIndex = Record<string, SummaryEmailRef>;

// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Row from the email_summaries table.
 */
export interface EmailSummary {
  id: string;
  user_id: string;
  headline: string;
  sections: SummarySection[];
  stats: SummaryStats;
  /** Map of email_id → {subject, sender, category} for link rendering */
  email_index: SummaryEmailIndex;
  period_start: string;
  period_end: string;
  emails_included: number;
  threads_included: number;
  tokens_used: number | null;
  estimated_cost: number | null;
  processing_time_ms: number | null;
  model: string;
  created_at: string;
}

/**
 * Row from the user_summary_state table.
 */
export interface UserSummaryState {
  user_id: string;
  last_summary_at: string | null;
  is_stale: boolean;
  emails_since_last: number;
  updated_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// API RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Response from GET /api/summaries/latest.
 */
export interface SummaryLatestResponse {
  summary: EmailSummary | null;
  is_stale: boolean;
  generated_at: string | null;
}

/**
 * Response from POST /api/summaries/generate.
 */
export interface SummaryGenerateResponse {
  summary: EmailSummary;
  was_cached: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result of summary generation (internal).
 */
export interface GenerateSummaryResult {
  success: boolean;
  summary: EmailSummary | null;
  was_cached: boolean;
  error?: string;
}

/**
 * Input data gathered for summary synthesis (pre-AI).
 * This is what we query from the DB before calling the AI.
 */
export interface SummaryInputData {
  /** Emails since last summary, grouped by thread */
  threads: ThreadSummary[];
  /** Pending action items */
  actions: ActionSummary[];
  /** Upcoming deadlines/dates within 7 days */
  upcoming_dates: DateSummary[];
  /** New ideas since last summary */
  new_ideas: string[];
  /** New news items since last summary */
  new_news: string[];
}

/**
 * A thread (group of emails with same thread_id) for summarization.
 */
export interface ThreadSummary {
  thread_id: string;
  subject: string | null;
  sender_name: string | null;
  sender_email: string;
  category: string | null;
  signal_strength: string | null;
  reply_worthiness: string | null;
  ai_brief: string | null;
  email_count: number;
  email_ids: string[];
  latest_date: string;
}

/**
 * A pending action for summarization.
 */
export interface ActionSummary {
  id: string;
  title: string;
  action_type: string | null;
  priority: string;
  deadline: string | null;
  email_id: string | null;
}

/**
 * An upcoming date for summarization.
 */
export interface DateSummary {
  title: string;
  date: string;
  date_type: string;
}
