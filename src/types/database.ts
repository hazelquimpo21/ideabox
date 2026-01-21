/* eslint-disable max-lines */
/**
 * Database Types for IdeaBox
 *
 * These types represent the Supabase/PostgreSQL database schema.
 *
 * HOW TO REGENERATE:
 * After making database schema changes, regenerate this file:
 * ```bash
 * npx supabase gen types typescript --project-id <your-project-id> > src/types/database.ts
 * ```
 *
 * WHY TYPE THE DATABASE?
 * - Catch errors at compile time, not runtime
 * - IDE autocompletion for table/column names
 * - Refactoring safety
 *
 * NOTE: This is a placeholder file. The actual types will be generated
 * from the Supabase database schema once migrations are applied.
 */

/**
 * Email categories (life-bucket focused).
 *
 * These categories represent different areas of the user's life, not actions.
 * Actions are tracked separately via the `actions` table.
 *
 * REFACTORED (Jan 2026): Changed from action-focused to life-bucket categories.
 * This allows emails to be organized by what part of the user's life they touch,
 * while action tracking remains a separate concern.
 *
 * The AI analyzer uses human-eye inference to categorize - it considers sender
 * context, domain patterns, and content to make smart categorization decisions.
 */
export type EmailCategory =
  | 'newsletters_general'           // Substacks, digests, curated content
  | 'news_politics'                 // News outlets, political updates
  | 'product_updates'               // Tech products, SaaS tools, subscriptions you use
  | 'local'                         // Community events, neighborhood, local orgs
  | 'shopping'                      // Orders, shipping, deals, retail
  | 'travel'                        // Flights, hotels, bookings, trip info
  | 'finance'                       // Bills, banking, investments, receipts
  | 'family_kids_school'            // School emails, activities, kid logistics
  | 'family_health_appointments'    // Medical, appointments, family scheduling
  | 'client_pipeline'               // Direct client correspondence, project work
  | 'business_work_general'         // Team/internal, industry stuff, professional
  | 'personal_friends_family';      // Social, relationships, personal correspondence

/**
 * Action types that can be extracted from emails.
 */
export type ActionType =
  | 'respond'
  | 'review'
  | 'create'
  | 'schedule'
  | 'decide'
  | 'follow_up'
  | 'none';

/**
 * Action priority levels.
 */
export type ActionPriority = 'low' | 'medium' | 'high' | 'urgent';

/**
 * Action status tracking.
 */
export type ActionStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

/**
 * Client status.
 */
export type ClientStatus = 'active' | 'inactive' | 'archived';

/**
 * Client priority levels.
 */
export type ClientPriority = 'low' | 'medium' | 'high' | 'vip';

/**
 * Sync log status.
 */
export type SyncStatus = 'started' | 'completed' | 'failed';

/**
 * Database schema types.
 * This will be replaced by auto-generated types from Supabase CLI.
 */
export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          timezone: string;
          onboarding_completed: boolean;
          default_view: string;
          emails_per_page: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          timezone?: string;
          onboarding_completed?: boolean;
          default_view?: string;
          emails_per_page?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          timezone?: string;
          onboarding_completed?: boolean;
          default_view?: string;
          emails_per_page?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      gmail_accounts: {
        Row: {
          id: string;
          user_id: string;
          email: string;
          display_name: string | null;
          access_token: string;
          refresh_token: string;
          token_expiry: string;
          last_sync_at: string | null;
          last_history_id: string | null;
          sync_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          email: string;
          display_name?: string | null;
          access_token: string;
          refresh_token: string;
          token_expiry: string;
          last_sync_at?: string | null;
          last_history_id?: string | null;
          sync_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          email?: string;
          display_name?: string | null;
          access_token?: string;
          refresh_token?: string;
          token_expiry?: string;
          last_sync_at?: string | null;
          last_history_id?: string | null;
          sync_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      clients: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          company: string | null;
          email: string | null;
          status: ClientStatus;
          priority: ClientPriority;
          email_domains: string[] | null;
          keywords: string[] | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          company?: string | null;
          email?: string | null;
          status?: ClientStatus;
          priority?: ClientPriority;
          email_domains?: string[] | null;
          keywords?: string[] | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          company?: string | null;
          email?: string | null;
          status?: ClientStatus;
          priority?: ClientPriority;
          email_domains?: string[] | null;
          keywords?: string[] | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      emails: {
        Row: {
          id: string;
          user_id: string;
          gmail_account_id: string;
          gmail_id: string;
          thread_id: string;
          subject: string | null;
          sender_email: string;
          sender_name: string | null;
          recipient_email: string | null;
          date: string;
          snippet: string | null;
          body_text: string | null;
          body_html: string | null;
          gmail_labels: string[] | null;
          category: EmailCategory | null;
          priority_score: number;
          topics: string[] | null;
          // Analysis display fields (denormalized from email_analyses for fast list queries)
          summary: string | null;
          quick_action: QuickActionDb | null;
          labels: string[] | null;
          client_id: string | null;
          project_tags: string[] | null;
          is_read: boolean;
          is_archived: boolean;
          is_starred: boolean;
          analyzed_at: string | null;
          analysis_error: string | null;
          gmail_label_synced: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          gmail_account_id: string;
          gmail_id: string;
          thread_id: string;
          subject?: string | null;
          sender_email: string;
          sender_name?: string | null;
          recipient_email?: string | null;
          date: string;
          snippet?: string | null;
          body_text?: string | null;
          body_html?: string | null;
          gmail_labels?: string[] | null;
          category?: EmailCategory | null;
          priority_score?: number;
          topics?: string[] | null;
          summary?: string | null;
          quick_action?: QuickActionDb | null;
          labels?: string[] | null;
          client_id?: string | null;
          project_tags?: string[] | null;
          is_read?: boolean;
          is_archived?: boolean;
          is_starred?: boolean;
          analyzed_at?: string | null;
          analysis_error?: string | null;
          gmail_label_synced?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          gmail_account_id?: string;
          gmail_id?: string;
          thread_id?: string;
          subject?: string | null;
          sender_email?: string;
          sender_name?: string | null;
          recipient_email?: string | null;
          date?: string;
          snippet?: string | null;
          body_text?: string | null;
          body_html?: string | null;
          gmail_labels?: string[] | null;
          category?: EmailCategory | null;
          priority_score?: number;
          topics?: string[] | null;
          summary?: string | null;
          quick_action?: QuickActionDb | null;
          labels?: string[] | null;
          client_id?: string | null;
          project_tags?: string[] | null;
          is_read?: boolean;
          is_archived?: boolean;
          is_starred?: boolean;
          analyzed_at?: string | null;
          analysis_error?: string | null;
          gmail_label_synced?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      email_analyses: {
        Row: {
          id: string;
          email_id: string;
          user_id: string;
          categorization: Record<string, unknown> | null;
          action_extraction: Record<string, unknown> | null;
          client_tagging: Record<string, unknown> | null;
          event_detection: Record<string, unknown> | null;
          url_extraction: Record<string, unknown> | null;
          content_opportunity: Record<string, unknown> | null;
          analyzer_version: string;
          tokens_used: number | null;
          processing_time_ms: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email_id: string;
          user_id: string;
          categorization?: Record<string, unknown> | null;
          action_extraction?: Record<string, unknown> | null;
          client_tagging?: Record<string, unknown> | null;
          event_detection?: Record<string, unknown> | null;
          url_extraction?: Record<string, unknown> | null;
          content_opportunity?: Record<string, unknown> | null;
          analyzer_version?: string;
          tokens_used?: number | null;
          processing_time_ms?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email_id?: string;
          user_id?: string;
          categorization?: Record<string, unknown> | null;
          action_extraction?: Record<string, unknown> | null;
          client_tagging?: Record<string, unknown> | null;
          event_detection?: Record<string, unknown> | null;
          url_extraction?: Record<string, unknown> | null;
          content_opportunity?: Record<string, unknown> | null;
          analyzer_version?: string;
          tokens_used?: number | null;
          processing_time_ms?: number | null;
          created_at?: string;
        };
      };
      actions: {
        Row: {
          id: string;
          user_id: string;
          email_id: string | null;
          client_id: string | null;
          title: string;
          description: string | null;
          action_type: ActionType | null;
          priority: string;
          urgency_score: number;
          deadline: string | null;
          estimated_minutes: number | null;
          status: ActionStatus;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          email_id?: string | null;
          client_id?: string | null;
          title: string;
          description?: string | null;
          action_type?: ActionType | null;
          priority?: string;
          urgency_score?: number;
          deadline?: string | null;
          estimated_minutes?: number | null;
          status?: ActionStatus;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          email_id?: string | null;
          client_id?: string | null;
          title?: string;
          description?: string | null;
          action_type?: ActionType | null;
          priority?: string;
          urgency_score?: number;
          deadline?: string | null;
          estimated_minutes?: number | null;
          status?: ActionStatus;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      sync_logs: {
        Row: {
          id: string;
          user_id: string;
          gmail_account_id: string | null;
          sync_type: string;
          emails_fetched: number;
          emails_analyzed: number;
          errors_count: number;
          status: SyncStatus;
          error_message: string | null;
          duration_ms: number | null;
          started_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          gmail_account_id?: string | null;
          sync_type: string;
          emails_fetched?: number;
          emails_analyzed?: number;
          errors_count?: number;
          status: SyncStatus;
          error_message?: string | null;
          duration_ms?: number | null;
          started_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          gmail_account_id?: string | null;
          sync_type?: string;
          emails_fetched?: number;
          emails_analyzed?: number;
          errors_count?: number;
          status?: SyncStatus;
          error_message?: string | null;
          duration_ms?: number | null;
          started_at?: string;
          completed_at?: string | null;
        };
      };
      api_usage_logs: {
        Row: {
          id: string;
          user_id: string | null;
          service: string;
          endpoint: string | null;
          model: string | null;
          tokens_input: number;
          tokens_output: number;
          tokens_total: number;
          estimated_cost: number | null;
          email_id: string | null;
          analyzer_name: string | null;
          duration_ms: number | null;
          success: boolean;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          service: string;
          endpoint?: string | null;
          model?: string | null;
          tokens_input?: number;
          tokens_output?: number;
          tokens_total?: number;
          estimated_cost?: number | null;
          email_id?: string | null;
          analyzer_name?: string | null;
          duration_ms?: number | null;
          success?: boolean;
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          service?: string;
          endpoint?: string | null;
          model?: string | null;
          tokens_input?: number;
          tokens_output?: number;
          tokens_total?: number;
          estimated_cost?: number | null;
          email_id?: string | null;
          analyzer_name?: string | null;
          duration_ms?: number | null;
          success?: boolean;
          error_message?: string | null;
          created_at?: string;
        };
      };
      user_settings: {
        Row: {
          id: string;
          user_id: string;
          // AI Analysis Settings
          auto_analyze: boolean;
          extract_actions: boolean;
          categorize_emails: boolean;
          detect_clients: boolean;
          // Analysis limits
          initial_sync_email_count: number;
          max_emails_per_sync: number;
          max_analysis_per_sync: number;
          // Cost Control Settings
          daily_cost_limit: number;
          monthly_cost_limit: number;
          cost_alert_threshold: number;
          pause_on_limit_reached: boolean;
          // Notification Settings
          email_digest_enabled: boolean;
          email_digest_frequency: 'daily' | 'weekly' | 'never';
          action_reminders: boolean;
          new_client_alerts: boolean;
          sync_error_alerts: boolean;
          cost_limit_alerts: boolean;
          // Metadata
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          auto_analyze?: boolean;
          extract_actions?: boolean;
          categorize_emails?: boolean;
          detect_clients?: boolean;
          initial_sync_email_count?: number;
          max_emails_per_sync?: number;
          max_analysis_per_sync?: number;
          daily_cost_limit?: number;
          monthly_cost_limit?: number;
          cost_alert_threshold?: number;
          pause_on_limit_reached?: boolean;
          email_digest_enabled?: boolean;
          email_digest_frequency?: 'daily' | 'weekly' | 'never';
          action_reminders?: boolean;
          new_client_alerts?: boolean;
          sync_error_alerts?: boolean;
          cost_limit_alerts?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          auto_analyze?: boolean;
          extract_actions?: boolean;
          categorize_emails?: boolean;
          detect_clients?: boolean;
          initial_sync_email_count?: number;
          max_emails_per_sync?: number;
          max_analysis_per_sync?: number;
          daily_cost_limit?: number;
          monthly_cost_limit?: number;
          cost_alert_threshold?: number;
          pause_on_limit_reached?: boolean;
          email_digest_enabled?: boolean;
          email_digest_frequency?: 'daily' | 'weekly' | 'never';
          action_reminders?: boolean;
          new_client_alerts?: boolean;
          sync_error_alerts?: boolean;
          cost_limit_alerts?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_daily_api_cost: {
        Args: { p_user_id: string; p_date?: string };
        Returns: number;
      };
      get_monthly_api_cost: {
        Args: { p_user_id: string; p_month?: string };
        Returns: number;
      };
      is_within_daily_limit: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      is_within_monthly_limit: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      get_cost_usage_summary: {
        Args: { p_user_id: string };
        Returns: {
          daily_cost: number;
          daily_limit: number;
          daily_percent: number;
          monthly_cost: number;
          monthly_limit: number;
          monthly_percent: number;
          is_paused: boolean;
        };
      };
    };
    Enums: Record<string, never>;
  };
}

/**
 * Helper type to get a table row type.
 */
export type TableRow<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

/**
 * Helper type to get a table insert type.
 */
export type TableInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

/**
 * Helper type to get a table update type.
 */
export type TableUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

/**
 * Convenient type aliases for common table rows.
 */
export type Email = TableRow<'emails'>;
export type Client = TableRow<'clients'>;
export type Action = TableRow<'actions'>;
export type GmailAccount = TableRow<'gmail_accounts'>;
export type UserProfile = TableRow<'user_profiles'>;
export type EmailAnalysis = TableRow<'email_analyses'>;
export type SyncLog = TableRow<'sync_logs'>;
export type ApiUsageLog = TableRow<'api_usage_logs'>;
export type UserSettings = TableRow<'user_settings'>;

/**
 * Cost usage summary from database function.
 */
export interface CostUsageSummary {
  daily_cost: number;
  daily_limit: number;
  daily_percent: number;
  monthly_cost: number;
  monthly_limit: number;
  monthly_percent: number;
  is_paused: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// JSONB STRUCTURE TYPES FOR EMAIL ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════
//
// These types define the structure of JSONB columns in email_analyses table.
// Use these when reading analysis data back from the database.
//
// IMPORTANT: These must stay in sync with what EmailProcessor writes.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Quick action type for inbox triage.
 * Stored in categorization JSONB as quick_action.
 */
export type QuickActionDb =
  | 'respond'
  | 'review'
  | 'archive'
  | 'save'
  | 'calendar'
  | 'unsubscribe'
  | 'follow_up'
  | 'none';

/**
 * Event format type - describes how attendees participate.
 * Stored in event_detection JSONB as location_type.
 */
export type EventLocationTypeDb = 'in_person' | 'virtual' | 'hybrid' | 'unknown';

/**
 * Event locality type - describes where the event is relative to the user.
 * Stored in event_detection JSONB as event_locality.
 *
 * ADDED (Jan 2026): Helps users understand if travel is required.
 * - local: Event is in or near the user's metro area
 * - out_of_town: Event requires travel to another city
 * - virtual: Event is online-only (no physical location)
 * - null: Unknown or not applicable
 */
export type EventLocalityDb = 'local' | 'out_of_town' | 'virtual' | null;

/**
 * Categorization JSONB structure.
 * ENHANCED (Jan 2026): Added summary and quick_action fields.
 */
export interface CategorizationJsonb {
  category: EmailCategory;
  confidence: number;
  reasoning: string;
  topics: string[];
  /** One-sentence assistant-style summary of the email */
  summary: string;
  /** Suggested quick action for inbox triage */
  quick_action: QuickActionDb;
}

/**
 * Action extraction JSONB structure.
 */
export interface ActionExtractionJsonb {
  has_action: boolean;
  action_type: ActionType;
  title?: string;
  description?: string;
  urgency_score: number;
  deadline?: string;
  estimated_minutes?: number;
}

/**
 * Client tagging JSONB structure.
 */
export interface ClientTaggingJsonb {
  client_match: boolean;
  client_id?: string | null;
  client_name?: string | null;
  confidence: number;
  project_name?: string;
  relationship_signal?: 'positive' | 'neutral' | 'negative' | 'unknown';
}

/**
 * Event detection JSONB structure.
 * Only present when email contains an event.
 * Added Jan 2026 for calendar integration.
 *
 * ENHANCED (Jan 2026): Added event_locality field to distinguish between
 * local events, out-of-town events, and virtual events.
 */
export interface EventDetectionJsonb {
  has_event: boolean;
  event_title: string;
  event_date: string;           // Start date (required) - ISO YYYY-MM-DD
  event_time?: string;          // Start time - HH:MM 24-hour format
  event_end_date?: string;      // End date (for multi-day events) - ISO YYYY-MM-DD
  event_end_time?: string;      // End time - HH:MM 24-hour format
  location_type: EventLocationTypeDb;
  event_locality?: EventLocalityDb;  // NEW: local, out_of_town, virtual
  location?: string;
  registration_deadline?: string;
  rsvp_required: boolean;
  rsvp_url?: string;
  organizer?: string;
  cost?: string;
  additional_details?: string;
  /** Is this a key date (deadline, registration date) rather than an event? */
  is_key_date?: boolean;
  /** Type of key date if applicable */
  key_date_type?: 'registration_deadline' | 'open_house' | 'deadline' | 'release_date' | 'other';
  confidence: number;
}

/**
 * Typed email analysis with properly typed JSONB columns.
 * Use this instead of EmailAnalysis when you need type-safe access to analysis data.
 */
export interface TypedEmailAnalysis {
  id: string;
  email_id: string;
  user_id: string;
  categorization: CategorizationJsonb | null;
  action_extraction: ActionExtractionJsonb | null;
  client_tagging: ClientTaggingJsonb | null;
  event_detection: EventDetectionJsonb | null;
  url_extraction: Record<string, unknown> | null; // Future: URLExtractionJsonb
  content_opportunity: Record<string, unknown> | null; // Future: ContentOpportunityJsonb
  analyzer_version: string;
  tokens_used: number | null;
  processing_time_ms: number | null;
  created_at: string;
}

/**
 * Helper function to cast EmailAnalysis to TypedEmailAnalysis.
 * Use this when reading from the database to get proper typing.
 *
 * @example
 * ```typescript
 * const analysis = await supabase
 *   .from('email_analyses')
 *   .select('*')
 *   .eq('email_id', emailId)
 *   .single();
 *
 * const typed = toTypedAnalysis(analysis.data);
 * console.log(typed.categorization?.summary);
 * console.log(typed.event_detection?.event_date);
 * ```
 */
export function toTypedAnalysis(analysis: EmailAnalysis): TypedEmailAnalysis {
  return analysis as TypedEmailAnalysis;
}
