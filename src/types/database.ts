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
  | 'clients'                       // Direct client correspondence, project work
  | 'work'                          // Team/internal, industry stuff, professional
  | 'personal_friends_family'       // Social, relationships, personal correspondence
  | 'family'                        // Kids, school, health, appointments, family scheduling
  | 'finance'                       // Bills, banking, investments, receipts
  | 'travel'                        // Flights, hotels, bookings, trip info
  | 'shopping'                      // Orders, shipping, deals, retail
  | 'local'                         // Community events, neighborhood, local orgs
  | 'newsletters_creator'           // Substacks, personal blogs, creator content
  | 'newsletters_industry'          // Tech/biz digests, industry roundups
  | 'news_politics'                 // News outlets, political updates
  | 'product_updates'               // Tech products, SaaS tools, subscriptions you use
  | 'notifications';                // Verification codes, OTPs, login alerts, password resets, system alerts

/**
 * Action types that can be extracted from emails.
 */
export type ActionType =
  | 'respond'
  | 'review'
  | 'create'
  | 'schedule'
  | 'decide'
  | 'pay'             // Pay a bill, invoice, or fee [NEW Feb 2026]
  | 'submit'          // Submit a form, application, or document [NEW Feb 2026]
  | 'register'        // Register or sign up for something [NEW Feb 2026]
  | 'book'            // Book travel, reservations, or appointments [NEW Feb 2026]
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
 * Project status values.
 */
export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived';

/**
 * Project priority levels.
 */
export type ProjectPriority = 'low' | 'medium' | 'high';

/**
 * Project item types — distinguishes ideas from tasks from routines.
 */
export type ProjectItemType = 'idea' | 'task' | 'routine';

/**
 * Project item status values.
 */
export type ProjectItemStatus =
  | 'backlog'
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

/**
 * Recurrence patterns for routine items.
 */
export type RecurrencePattern = 'daily' | 'weekly' | 'biweekly' | 'monthly';

/**
 * Recurrence configuration for routine items.
 */
export interface RecurrenceConfig {
  day_of_week?: number;   // 0=Sun, 1=Mon, ..., 6=Sat
  interval?: number;       // every N occurrences (default 1)
  ends_at?: string;        // ISO date when recurrence stops
}

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
          sync_progress: Record<string, unknown> | null;
          initial_sync_completed_at: string | null;
          initial_sync_pending: boolean;
          initial_sync_triggered_at: string | null;
          sender_patterns: Record<string, unknown>[];
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
          sync_progress?: Record<string, unknown> | null;
          initial_sync_completed_at?: string | null;
          initial_sync_pending?: boolean;
          initial_sync_triggered_at?: string | null;
          sender_patterns?: Record<string, unknown>[];
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
          sync_progress?: Record<string, unknown> | null;
          initial_sync_completed_at?: string | null;
          initial_sync_pending?: boolean;
          initial_sync_triggered_at?: string | null;
          sender_patterns?: Record<string, unknown>[];
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
          // Push notifications (migration 015)
          watch_expiration: string | null;
          watch_history_id: string | null;
          watch_resource_id: string | null;
          push_enabled: boolean;
          last_push_at: string | null;
          // Sync locking (migration 016)
          sync_lock_until: string | null;
          history_id_validated_at: string | null;
          needs_full_sync: boolean;
          watch_renewal_failures: number;
          watch_last_error: string | null;
          watch_alert_sent_at: string | null;
          // Google Contacts (migration 022)
          contacts_synced_at: string | null;
          contacts_sync_enabled: boolean;
          // Historical sync (migration 023)
          historical_sync_status: string;
          historical_sync_oldest_date: string | null;
          historical_sync_email_count: number;
          historical_sync_contacts_updated: number;
          historical_sync_started_at: string | null;
          historical_sync_completed_at: string | null;
          historical_sync_page_token: string | null;
          historical_sync_error: string | null;
          // Email sending (migration 026)
          has_send_scope: boolean;
          send_scope_granted_at: string | null;
          // Post-initial-sync backfill (migration 039)
          backfill_completed_at: string | null;
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
          watch_expiration?: string | null;
          watch_history_id?: string | null;
          watch_resource_id?: string | null;
          push_enabled?: boolean;
          last_push_at?: string | null;
          sync_lock_until?: string | null;
          history_id_validated_at?: string | null;
          needs_full_sync?: boolean;
          watch_renewal_failures?: number;
          watch_last_error?: string | null;
          watch_alert_sent_at?: string | null;
          contacts_synced_at?: string | null;
          contacts_sync_enabled?: boolean;
          historical_sync_status?: string;
          historical_sync_oldest_date?: string | null;
          historical_sync_email_count?: number;
          historical_sync_contacts_updated?: number;
          historical_sync_started_at?: string | null;
          historical_sync_completed_at?: string | null;
          historical_sync_page_token?: string | null;
          historical_sync_error?: string | null;
          has_send_scope?: boolean;
          send_scope_granted_at?: string | null;
          backfill_completed_at?: string | null;
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
          watch_expiration?: string | null;
          watch_history_id?: string | null;
          watch_resource_id?: string | null;
          push_enabled?: boolean;
          last_push_at?: string | null;
          sync_lock_until?: string | null;
          history_id_validated_at?: string | null;
          needs_full_sync?: boolean;
          watch_renewal_failures?: number;
          watch_last_error?: string | null;
          watch_alert_sent_at?: string | null;
          contacts_synced_at?: string | null;
          contacts_sync_enabled?: boolean;
          historical_sync_status?: string;
          historical_sync_oldest_date?: string | null;
          historical_sync_email_count?: number;
          historical_sync_contacts_updated?: number;
          historical_sync_started_at?: string | null;
          historical_sync_completed_at?: string | null;
          historical_sync_page_token?: string | null;
          historical_sync_error?: string | null;
          has_send_scope?: boolean;
          send_scope_granted_at?: string | null;
          backfill_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      // clients table archived as clients_deprecated in migration 030
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
          project_tags: string[] | null;
          // Content digest fields (migration 025)
          gist: string | null;
          key_points: string[] | null;
          // Signal strength and reply worthiness (NEW Feb 2026)
          signal_strength: SignalStrengthDb | null;
          reply_worthiness: ReplyWorthinessDb | null;
          // Additional categories for multi-bucket filtering (NEW Feb 2026)
          additional_categories: string[] | null;
          // Email type and AI brief (NEW Feb 2026)
          email_type: EmailTypeDb | null;
          ai_brief: string | null;
          // NOTE: urgency_score and relationship_signal are used in UI but have
          // no DB migration. They exist only in email_analyses JSONB. Reads from
          // the emails table will return null. A future migration should add these
          // columns if denormalization is desired.
          urgency_score: number | null;
          relationship_signal: 'positive' | 'neutral' | 'negative' | 'unknown' | null;
          // Sync type (migration 023)
          sync_type: string;
          is_read: boolean;
          is_archived: boolean;
          is_starred: boolean;
          analyzed_at: string | null;
          analysis_error: string | null;
          gmail_label_synced: boolean;
          // Contact reference (Phase 3 — migration 029)
          contact_id: string | null;
          // Review queue tracking (NEW Feb 2026 — migration 033)
          reviewed_at: string | null;
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
          project_tags?: string[] | null;
          gist?: string | null;
          key_points?: string[] | null;
          signal_strength?: SignalStrengthDb | null;
          reply_worthiness?: ReplyWorthinessDb | null;
          additional_categories?: string[] | null;
          email_type?: EmailTypeDb | null;
          ai_brief?: string | null;
          urgency_score?: number | null;
          relationship_signal?: 'positive' | 'neutral' | 'negative' | 'unknown' | null;
          sync_type?: string;
          is_read?: boolean;
          is_archived?: boolean;
          is_starred?: boolean;
          analyzed_at?: string | null;
          analysis_error?: string | null;
          gmail_label_synced?: boolean;
          // Review queue tracking (NEW Feb 2026 — migration 033)
          reviewed_at?: string | null;
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
          project_tags?: string[] | null;
          gist?: string | null;
          key_points?: string[] | null;
          signal_strength?: SignalStrengthDb | null;
          reply_worthiness?: ReplyWorthinessDb | null;
          additional_categories?: string[] | null;
          email_type?: EmailTypeDb | null;
          ai_brief?: string | null;
          urgency_score?: number | null;
          relationship_signal?: 'positive' | 'neutral' | 'negative' | 'unknown' | null;
          sync_type?: string;
          is_read?: boolean;
          is_archived?: boolean;
          is_starred?: boolean;
          analyzed_at?: string | null;
          analysis_error?: string | null;
          gmail_label_synced?: boolean;
          // Review queue tracking (NEW Feb 2026 — migration 033)
          reviewed_at?: string | null;
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
          content_digest: Record<string, unknown> | null;
          // Idea sparks (NEW Feb 2026 — migration 033)
          idea_sparks: Record<string, unknown> | null;
          // Insight extraction (NEW Feb 2026 — migration 034)
          insight_extraction: Record<string, unknown> | null;
          // News brief (NEW Feb 2026 — migration 034)
          news_brief: Record<string, unknown> | null;
          // Multi-event detection (NEW Feb 2026 — migration 035)
          multi_event_detection: Record<string, unknown> | null;
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
          content_digest?: Record<string, unknown> | null;
          // Idea sparks (NEW Feb 2026 — migration 033)
          idea_sparks?: Record<string, unknown> | null;
          // Insight extraction (NEW Feb 2026 — migration 034)
          insight_extraction?: Record<string, unknown> | null;
          // News brief (NEW Feb 2026 — migration 034)
          news_brief?: Record<string, unknown> | null;
          // Multi-event detection (NEW Feb 2026 — migration 035)
          multi_event_detection?: Record<string, unknown> | null;
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
          content_digest?: Record<string, unknown> | null;
          // Idea sparks (NEW Feb 2026 — migration 033)
          idea_sparks?: Record<string, unknown> | null;
          // Insight extraction (NEW Feb 2026 — migration 034)
          insight_extraction?: Record<string, unknown> | null;
          // News brief (NEW Feb 2026 — migration 034)
          news_brief?: Record<string, unknown> | null;
          // Multi-event detection (NEW Feb 2026 — migration 035)
          multi_event_detection?: Record<string, unknown> | null;
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
          // Contact reference (Phase 3 — migration 029)
          contact_id: string | null;
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
          contact_id?: string | null;
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
          contact_id?: string | null;
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
      // ═══════════════════════════════════════════════════════════════════════════
      // PROJECTS (migration 041)
      // ═══════════════════════════════════════════════════════════════════════════
      projects: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          status: ProjectStatus;
          priority: ProjectPriority;
          color: string | null;
          icon: string | null;
          contact_id: string | null;
          start_date: string | null;
          end_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          status?: ProjectStatus;
          priority?: ProjectPriority;
          color?: string | null;
          icon?: string | null;
          contact_id?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          description?: string | null;
          status?: ProjectStatus;
          priority?: ProjectPriority;
          color?: string | null;
          icon?: string | null;
          contact_id?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      project_items: {
        Row: {
          id: string;
          user_id: string;
          project_id: string | null;
          item_type: ProjectItemType;
          title: string;
          description: string | null;
          status: ProjectItemStatus;
          priority: string;
          start_date: string | null;
          due_date: string | null;
          end_date: string | null;
          recurrence_pattern: RecurrencePattern | null;
          recurrence_config: RecurrenceConfig;
          estimated_minutes: number | null;
          source_action_id: string | null;
          source_email_id: string | null;
          contact_id: string | null;
          tags: string[];
          sort_order: number;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id?: string | null;
          item_type?: ProjectItemType;
          title: string;
          description?: string | null;
          status?: ProjectItemStatus;
          priority?: string;
          start_date?: string | null;
          due_date?: string | null;
          end_date?: string | null;
          recurrence_pattern?: RecurrencePattern | null;
          recurrence_config?: RecurrenceConfig;
          estimated_minutes?: number | null;
          source_action_id?: string | null;
          source_email_id?: string | null;
          contact_id?: string | null;
          tags?: string[];
          sort_order?: number;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          project_id?: string | null;
          item_type?: ProjectItemType;
          title?: string;
          description?: string | null;
          status?: ProjectItemStatus;
          priority?: string;
          start_date?: string | null;
          due_date?: string | null;
          end_date?: string | null;
          recurrence_pattern?: RecurrencePattern | null;
          recurrence_config?: RecurrenceConfig;
          estimated_minutes?: number | null;
          source_action_id?: string | null;
          source_email_id?: string | null;
          contact_id?: string | null;
          tags?: string[];
          sort_order?: number;
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
      user_context: {
        Row: {
          id: string;
          user_id: string;
          role: string | null;
          company: string | null;
          industry: string | null;
          location_city: string | null;
          location_metro: string | null;
          priorities: string[] | null;
          projects: string[] | null;
          vip_emails: string[] | null;
          vip_domains: string[] | null;
          interests: string[] | null;
          family_context: Record<string, unknown>;
          work_hours_start: string;
          work_hours_end: string;
          work_days: number[];
          onboarding_completed: boolean;
          onboarding_completed_at: string | null;
          onboarding_step: number;
          // Profile suggestions (migration 031)
          profile_suggestions: ProfileSuggestions | null;
          profile_suggestions_generated_at: string | null;
          // Profile expansion (migration 040)
          gender: string | null;
          birthday: string | null;
          address_street: string | null;
          address_city: string | null;
          address_state: string | null;
          address_zip: string | null;
          address_country: string;
          other_cities: OtherCity[];
          employment_type: string;
          other_jobs: OtherJob[];
          household_members: HouseholdMember[];
          pets: Pet[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          role?: string | null;
          company?: string | null;
          industry?: string | null;
          location_city?: string | null;
          location_metro?: string | null;
          priorities?: string[] | null;
          projects?: string[] | null;
          vip_emails?: string[] | null;
          vip_domains?: string[] | null;
          interests?: string[] | null;
          family_context?: Record<string, unknown>;
          work_hours_start?: string;
          work_hours_end?: string;
          work_days?: number[];
          onboarding_completed?: boolean;
          onboarding_completed_at?: string | null;
          onboarding_step?: number;
          // Profile suggestions (migration 031)
          profile_suggestions?: ProfileSuggestions | null;
          profile_suggestions_generated_at?: string | null;
          // Profile expansion (migration 040)
          gender?: string | null;
          birthday?: string | null;
          address_street?: string | null;
          address_city?: string | null;
          address_state?: string | null;
          address_zip?: string | null;
          address_country?: string;
          other_cities?: OtherCity[];
          employment_type?: string;
          other_jobs?: OtherJob[];
          household_members?: HouseholdMember[];
          pets?: Pet[];
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['user_context']['Insert']>;
      };
      contacts: {
        Row: {
          id: string;
          user_id: string;
          email: string;
          name: string | null;
          display_name: string | null;
          avatar_url: string | null;
          email_count: number;
          sent_count: number;
          received_count: number;
          first_seen_at: string | null;
          last_seen_at: string | null;
          last_user_reply_at: string | null;
          avg_response_hours: number | null;
          sender_type: string;
          broadcast_subtype: string | null;
          sender_type_confidence: number | null;
          sender_type_detected_at: string | null;
          sender_type_source: string | null;
          relationship_type: string | null;
          relationship_strength: string;
          company: string | null;
          job_title: string | null;
          phone: string | null;
          linkedin_url: string | null;
          extraction_confidence: number | null;
          last_extracted_at: string | null;
          extraction_source: string | null;
          needs_enrichment: boolean;
          birthday: string | null;
          birthday_year_known: boolean;
          work_anniversary: string | null;
          custom_dates: Record<string, unknown>[];
          is_vip: boolean;
          is_muted: boolean;
          is_archived: boolean;
          google_resource_name: string | null;
          google_labels: string[];
          is_google_starred: boolean;
          google_synced_at: string | null;
          import_source: string;
          notes: string | null;
          // ═══════════════════════════════════════════════════════════════════
          // CLIENT FIELDS (NEW Feb 2026 — Phase 3 Navigation Redesign)
          // ═══════════════════════════════════════════════════════════════════
          is_client: boolean;
          client_status: string | null;
          client_priority: string | null;
          email_domains: string[] | null;
          keywords: string[] | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          email: string;
          name?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          email_count?: number;
          sent_count?: number;
          received_count?: number;
          first_seen_at?: string | null;
          last_seen_at?: string | null;
          last_user_reply_at?: string | null;
          avg_response_hours?: number | null;
          sender_type?: string;
          broadcast_subtype?: string | null;
          sender_type_confidence?: number | null;
          sender_type_detected_at?: string | null;
          sender_type_source?: string | null;
          relationship_type?: string | null;
          relationship_strength?: string;
          company?: string | null;
          job_title?: string | null;
          phone?: string | null;
          linkedin_url?: string | null;
          extraction_confidence?: number | null;
          last_extracted_at?: string | null;
          extraction_source?: string | null;
          needs_enrichment?: boolean;
          birthday?: string | null;
          birthday_year_known?: boolean;
          work_anniversary?: string | null;
          custom_dates?: Record<string, unknown>[];
          is_vip?: boolean;
          is_muted?: boolean;
          is_archived?: boolean;
          google_resource_name?: string | null;
          google_labels?: string[];
          is_google_starred?: boolean;
          google_synced_at?: string | null;
          import_source?: string;
          notes?: string | null;
          // Client fields (Phase 3)
          is_client?: boolean;
          client_status?: string | null;
          client_priority?: string | null;
          email_domains?: string[] | null;
          keywords?: string[] | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['contacts']['Insert']>;
      };
      contact_aliases: {
        Row: {
          id: string;
          user_id: string;
          primary_contact_id: string;
          alias_email: string;
          created_via: string;
          confidence: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          primary_contact_id: string;
          alias_email: string;
          created_via?: string;
          confidence?: number | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['contact_aliases']['Insert']>;
      };
      extracted_dates: {
        Row: {
          id: string;
          user_id: string;
          email_id: string | null;
          contact_id: string | null;
          date_type: string;
          date: string;
          event_time: string | null;
          end_date: string | null;
          end_time: string | null;
          timezone: string;
          title: string;
          description: string | null;
          source_snippet: string | null;
          related_entity: string | null;
          is_recurring: boolean;
          recurrence_pattern: string | null;
          recurrence_end_date: string | null;
          confidence: number | null;
          extracted_by: string;
          priority_score: number;
          is_acknowledged: boolean;
          acknowledged_at: string | null;
          is_hidden: boolean;
          snoozed_until: string | null;
          event_metadata: Record<string, unknown> | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          email_id?: string | null;
          contact_id?: string | null;
          date_type: string;
          date: string;
          event_time?: string | null;
          end_date?: string | null;
          end_time?: string | null;
          timezone?: string;
          title: string;
          description?: string | null;
          source_snippet?: string | null;
          related_entity?: string | null;
          is_recurring?: boolean;
          recurrence_pattern?: string | null;
          recurrence_end_date?: string | null;
          confidence?: number | null;
          extracted_by?: string;
          priority_score?: number;
          is_acknowledged?: boolean;
          acknowledged_at?: string | null;
          is_hidden?: boolean;
          snoozed_until?: string | null;
          event_metadata?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['extracted_dates']['Insert']>;
      };
      user_event_states: {
        Row: {
          id: string;
          user_id: string;
          email_id: string;
          state: 'dismissed' | 'maybe' | 'saved_to_calendar';
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          email_id: string;
          state: 'dismissed' | 'maybe' | 'saved_to_calendar';
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['user_event_states']['Insert']>;
      };
      email_templates: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          category: string | null;
          subject_template: string;
          body_html_template: string;
          body_text_template: string | null;
          merge_fields: string[];
          times_used: number;
          last_used_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          category?: string | null;
          subject_template: string;
          body_html_template: string;
          body_text_template?: string | null;
          merge_fields?: string[];
          times_used?: number;
          last_used_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['email_templates']['Insert']>;
      };
      email_campaigns: {
        Row: {
          id: string;
          user_id: string;
          gmail_account_id: string;
          name: string;
          description: string | null;
          template_id: string | null;
          subject_template: string;
          body_html_template: string;
          body_text_template: string | null;
          recipients: Record<string, unknown>[];
          status: string;
          scheduled_at: string | null;
          throttle_seconds: number;
          total_recipients: number;
          sent_count: number;
          failed_count: number;
          open_count: number;
          reply_count: number;
          current_index: number;
          follow_up_enabled: boolean;
          follow_up_condition: string | null;
          follow_up_delay_hours: number;
          follow_up_subject: string | null;
          follow_up_body_html: string | null;
          started_at: string | null;
          completed_at: string | null;
          paused_at: string | null;
          last_send_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          gmail_account_id: string;
          name: string;
          description?: string | null;
          template_id?: string | null;
          subject_template: string;
          body_html_template: string;
          body_text_template?: string | null;
          recipients?: Record<string, unknown>[];
          status?: string;
          scheduled_at?: string | null;
          throttle_seconds?: number;
          follow_up_enabled?: boolean;
          follow_up_condition?: string | null;
          follow_up_delay_hours?: number;
          follow_up_subject?: string | null;
          follow_up_body_html?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['email_campaigns']['Insert']>;
      };
      outbound_emails: {
        Row: {
          id: string;
          user_id: string;
          gmail_account_id: string;
          campaign_id: string | null;
          template_id: string | null;
          to_email: string;
          to_name: string | null;
          cc_emails: string[] | null;
          bcc_emails: string[] | null;
          reply_to: string | null;
          subject: string;
          body_html: string;
          body_text: string | null;
          gmail_message_id: string | null;
          gmail_thread_id: string | null;
          in_reply_to: string | null;
          references_header: string | null;
          status: string;
          scheduled_at: string | null;
          sent_at: string | null;
          tracking_id: string;
          tracking_enabled: boolean;
          open_count: number;
          first_opened_at: string | null;
          last_opened_at: string | null;
          has_reply: boolean;
          reply_received_at: string | null;
          reply_email_id: string | null;
          follow_up_enabled: boolean;
          follow_up_condition: string | null;
          follow_up_delay_hours: number;
          follow_up_email_id: string | null;
          follow_up_sent: boolean;
          error_message: string | null;
          error_code: string | null;
          retry_count: number;
          max_retries: number;
          last_retry_at: string | null;
          next_retry_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          gmail_account_id: string;
          campaign_id?: string | null;
          template_id?: string | null;
          to_email: string;
          to_name?: string | null;
          cc_emails?: string[] | null;
          bcc_emails?: string[] | null;
          reply_to?: string | null;
          subject: string;
          body_html: string;
          body_text?: string | null;
          in_reply_to?: string | null;
          references_header?: string | null;
          status?: string;
          scheduled_at?: string | null;
          tracking_enabled?: boolean;
          follow_up_enabled?: boolean;
          follow_up_condition?: string | null;
          follow_up_delay_hours?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['outbound_emails']['Insert']>;
      };
      email_open_events: {
        Row: {
          id: string;
          outbound_email_id: string;
          opened_at: string;
          ip_address: string | null;
          user_agent: string | null;
          country: string | null;
          city: string | null;
          device_type: string | null;
          email_client: string | null;
          fingerprint: string | null;
        };
        Insert: {
          id?: string;
          outbound_email_id: string;
          opened_at?: string;
          ip_address?: string | null;
          user_agent?: string | null;
          country?: string | null;
          city?: string | null;
          device_type?: string | null;
          email_client?: string | null;
          fingerprint?: string | null;
        };
        Update: Partial<Database['public']['Tables']['email_open_events']['Insert']>;
      };
      daily_send_quotas: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          emails_sent: number;
          quota_limit: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          date?: string;
          emails_sent?: number;
          quota_limit?: number;
        };
        Update: Partial<Database['public']['Tables']['daily_send_quotas']['Insert']>;
      };
      scheduled_sync_runs: {
        Row: {
          id: string;
          started_at: string;
          completed_at: string | null;
          duration_ms: number | null;
          accounts_processed: number;
          accounts_succeeded: number;
          accounts_failed: number;
          accounts_skipped: number;
          emails_fetched: number;
          emails_created: number;
          emails_analyzed: number;
          status: string;
          results: Record<string, unknown>[];
          error: string | null;
          trigger_source: string;
        };
        Insert: {
          id?: string;
          started_at?: string;
          completed_at?: string | null;
          duration_ms?: number | null;
          status?: string;
          results?: Record<string, unknown>[];
          error?: string | null;
          trigger_source?: string;
        };
        Update: Partial<Database['public']['Tables']['scheduled_sync_runs']['Insert']>;
      };
      /**
       * Saved email ideas (NEW Feb 2026 — migration 033).
       * Stores ideas that users choose to keep, develop, or act on.
       * Ideas are generated by the IdeaSparkAnalyzer and stored in email_analyses.idea_sparks.
       * When a user saves/stars an idea, a row is created here for persistence.
       */
      email_ideas: {
        Row: {
          id: string;
          user_id: string;
          email_id: string | null;
          idea: string;
          idea_type: string;
          relevance: string | null;
          status: 'new' | 'saved' | 'dismissed' | 'done';
          confidence: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          email_id?: string | null;
          idea: string;
          idea_type: string;
          relevance?: string | null;
          status?: 'new' | 'saved' | 'dismissed' | 'done';
          confidence?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['email_ideas']['Insert']>;
      };
      /**
       * Saved insights (NEW Feb 2026 — migration 034).
       * Stores insights that users choose to keep from InsightExtractor.
       * Insights are generated by InsightExtractorAnalyzer and stored in email_analyses.insight_extraction.
       * When a user saves an insight, a row is created here for persistence.
       */
      saved_insights: {
        Row: {
          id: string;
          user_id: string;
          email_id: string | null;
          insight: string;
          insight_type: string;
          topics: string[];
          status: 'new' | 'saved' | 'dismissed' | 'archived';
          confidence: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          email_id?: string | null;
          insight: string;
          insight_type: string;
          topics?: string[];
          status?: 'new' | 'saved' | 'dismissed' | 'archived';
          confidence?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['saved_insights']['Insert']>;
      };
      /**
       * Saved news items (NEW Feb 2026 — migration 034).
       * Stores news items that users choose to keep from NewsBrief.
       * News items are generated by NewsBriefAnalyzer and stored in email_analyses.news_brief.
       * When a user saves a news item, a row is created here for persistence.
       */
      saved_news: {
        Row: {
          id: string;
          user_id: string;
          email_id: string | null;
          headline: string;
          detail: string | null;
          topics: string[];
          date_mentioned: string | null;
          status: 'new' | 'saved' | 'dismissed' | 'archived';
          confidence: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          email_id?: string | null;
          headline: string;
          detail?: string | null;
          topics?: string[];
          date_mentioned?: string | null;
          status?: 'new' | 'saved' | 'dismissed' | 'archived';
          confidence?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['saved_news']['Insert']>;
      };
      // Email summaries (NEW Feb 2026 — migration 038)
      email_summaries: {
        Row: {
          id: string;
          user_id: string;
          headline: string;
          sections: Record<string, unknown>[];
          stats: Record<string, unknown>;
          period_start: string;
          period_end: string;
          emails_included: number;
          threads_included: number;
          tokens_used: number | null;
          estimated_cost: number | null;
          processing_time_ms: number | null;
          model: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          headline: string;
          sections?: Record<string, unknown>[];
          stats?: Record<string, unknown>;
          period_start: string;
          period_end: string;
          emails_included?: number;
          threads_included?: number;
          tokens_used?: number | null;
          estimated_cost?: number | null;
          processing_time_ms?: number | null;
          model?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['email_summaries']['Insert']>;
      };
      // Summary staleness tracking (NEW Feb 2026 — migration 038)
      user_summary_state: {
        Row: {
          user_id: string;
          last_summary_at: string | null;
          is_stale: boolean;
          emails_since_last: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          last_summary_at?: string | null;
          is_stale?: boolean;
          emails_since_last?: number;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['user_summary_state']['Insert']>;
      };
      gmail_push_logs: {
        Row: {
          id: string;
          gmail_account_id: string | null;
          email_address: string;
          history_id: string;
          pubsub_message_id: string | null;
          processed_at: string;
          processing_time_ms: number | null;
          messages_found: number;
          messages_synced: number;
          messages_analyzed: number;
          status: string;
          skip_reason: string | null;
          error: string | null;
        };
        Insert: {
          id?: string;
          gmail_account_id?: string | null;
          email_address: string;
          history_id: string;
          pubsub_message_id?: string | null;
          processed_at?: string;
          processing_time_ms?: number | null;
          status?: string;
          skip_reason?: string | null;
          error?: string | null;
        };
        Update: Partial<Database['public']['Tables']['gmail_push_logs']['Insert']>;
      };
    };
    Views: {
      accounts_needing_sync: {
        Row: {
          account_id: string;
          user_id: string;
          email: string;
          minutes_since_sync: number;
          needs_backfill: boolean;
        };
      };
    };
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
      can_send_email: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      increment_send_count: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      get_remaining_quota: {
        Args: { p_user_id: string };
        Returns: number;
      };
      acquire_sync_lock: {
        Args: { p_account_id: string; p_lock_duration_seconds?: number };
        Returns: boolean;
      };
      release_sync_lock: {
        Args: { p_account_id: string };
        Returns: void;
      };
      // Watch management (migration 039)
      update_gmail_watch: {
        Args: {
          p_account_id: string;
          p_history_id: string;
          p_expiration: string;
          p_resource_id?: string | null;
        };
        Returns: void;
      };
      clear_gmail_watch: {
        Args: { p_account_id: string };
        Returns: void;
      };
      get_expiring_watches: {
        Args: { p_hours_ahead?: number };
        Returns: Array<{
          account_id: string;
          user_id: string;
          email: string;
          hours_until_expiry: number;
        }>;
      };
      get_accounts_needing_watch: {
        Args: Record<string, never>;
        Returns: Array<{
          account_id: string;
          user_id: string;
          email: string;
        }>;
      };
      record_watch_failure: {
        Args: { p_account_id: string; p_error_message: string };
        Returns: void;
      };
      reset_watch_failures: {
        Args: { p_account_id: string };
        Returns: void;
      };
      get_accounts_with_watch_problems: {
        Args: { p_min_failures?: number };
        Returns: Array<{
          account_id: string;
          user_id: string;
          email: string;
          failure_count: number;
          last_error: string;
          alert_sent_at: string | null;
        }>;
      };
      mark_watch_alert_sent: {
        Args: { p_account_id: string };
        Returns: void;
      };
      // History management (migration 039)
      mark_history_stale: {
        Args: { p_account_id: string };
        Returns: void;
      };
      validate_history_id: {
        Args: { p_account_id: string; p_history_id: string };
        Returns: void;
      };
      // Cleanup (migration 039)
      cleanup_old_sync_runs: {
        Args: { p_days_to_keep?: number };
        Returns: number;
      };
      cleanup_old_push_logs: {
        Args: { p_days_to_keep?: number };
        Returns: number;
      };
      mark_backfill_complete: {
        Args: { p_account_id: string };
        Returns: void;
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
/**
 * @deprecated clients table archived as clients_deprecated in migration 030.
 * Use Contact with is_client=true instead. This type is kept for backward
 * compatibility with the analyzer pipeline (client-tagger, etc.).
 */
export interface Client {
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
}
export type Action = TableRow<'actions'>;
export type GmailAccount = TableRow<'gmail_accounts'>;
export type UserProfile = TableRow<'user_profiles'>;
export type EmailAnalysis = TableRow<'email_analyses'>;
export type SyncLog = TableRow<'sync_logs'>;
export type ApiUsageLog = TableRow<'api_usage_logs'>;
export type UserSettings = TableRow<'user_settings'>;
export type UserContext = TableRow<'user_context'>;
export type Contact = TableRow<'contacts'>;
export type ContactAlias = TableRow<'contact_aliases'>;
export type ExtractedDate = TableRow<'extracted_dates'>;
export type UserEventState = TableRow<'user_event_states'>;
export type EmailTemplate = TableRow<'email_templates'>;
export type EmailCampaign = TableRow<'email_campaigns'>;
export type OutboundEmail = TableRow<'outbound_emails'>;
export type EmailOpenEvent = TableRow<'email_open_events'>;
export type DailySendQuota = TableRow<'daily_send_quotas'>;
export type ScheduledSyncRun = TableRow<'scheduled_sync_runs'>;
export type GmailPushLog = TableRow<'gmail_push_logs'>;
export type EmailIdea = TableRow<'email_ideas'>;
export type SavedInsight = TableRow<'saved_insights'>;
export type SavedNews = TableRow<'saved_news'>;
export type EmailSummaryRow = TableRow<'email_summaries'>;
export type UserSummaryStateRow = TableRow<'user_summary_state'>;
export type Project = TableRow<'projects'>;
export type ProjectItem = TableRow<'project_items'>;

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
 * Signal strength type for email relevance assessment.
 * Stored in categorization JSONB as signal_strength and denormalized to emails table.
 * NEW (Feb 2026).
 */
export type SignalStrengthDb = 'high' | 'medium' | 'low' | 'noise';

/**
 * Reply worthiness type for reply assessment.
 * Stored in categorization JSONB as reply_worthiness and denormalized to emails table.
 * NEW (Feb 2026).
 */
export type ReplyWorthinessDb = 'must_reply' | 'should_reply' | 'optional_reply' | 'no_reply';

/**
 * Email type — the nature of the communication, orthogonal to category.
 * Stored in categorization JSONB as email_type and denormalized to emails table.
 * NEW (Feb 2026).
 */
export type EmailTypeDb = 'personal' | 'transactional' | 'newsletter' | 'notification' | 'promo' | 'cold_outreach' | 'needs_response' | 'fyi' | 'automated';

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
 * ENHANCED (Feb 2026): Added signal_strength, reply_worthiness, labels.
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
  /** Secondary classification labels */
  labels?: string[];
  /** Signal strength - how important is this email? (NEW Feb 2026) */
  signal_strength?: SignalStrengthDb;
  /** Reply worthiness - should the user reply? (NEW Feb 2026) */
  reply_worthiness?: ReplyWorthinessDb;
  /** Additional categories for multi-bucket filtering (NEW Feb 2026) */
  additional_categories?: string[];
  /** Email type — nature of the communication (NEW Feb 2026) */
  email_type?: EmailTypeDb;
  /** AI-internal brief for downstream AI batch-summarization (NEW Feb 2026) */
  ai_brief?: string;
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
 * Content digest JSONB structure (migration 025).
 * Extracts gist, key points, and links from emails.
 */
export interface ContentDigestJsonb {
  gist: string;
  key_points: { point: string; relevance?: string }[];
  links?: { url: string; type?: string; title?: string; description?: string }[];
  content_type?: 'single_topic' | 'multi_topic_digest' | 'curated_links' | 'personal_update';
  topics_highlighted?: string[];
  confidence: number;
}

/**
 * Idea sparks JSONB structure (NEW Feb 2026 — migration 033).
 * Stores 3 creative ideas generated from email content + user context.
 *
 * Each idea connects the email content to the user's actual life —
 * their role, interests, projects, location, family, and current season.
 */
export interface IdeaSparksJsonb {
  has_ideas: boolean;
  ideas: {
    idea: string;
    type: string;
    relevance: string;
    confidence: number;
  }[];
  confidence: number;
}

/**
 * Insight extraction JSONB structure (NEW Feb 2026 — migration 034).
 * Stores synthesized ideas, tips, and frameworks from email content.
 *
 * Generated by InsightExtractorAnalyzer for newsletter/substantive content.
 * Each insight is typed, tagged with topics, and confidence-scored.
 */
export interface InsightExtractionJsonb {
  has_insights: boolean;
  insights: {
    insight: string;
    type: string;    // tip, framework, observation, counterintuitive, trend
    topics: string[];
    confidence: number;
  }[];
  confidence: number;
}

/**
 * News brief JSONB structure (NEW Feb 2026 — migration 034).
 * Stores factual news items extracted from email content.
 *
 * Generated by NewsBriefAnalyzer for news/digest content.
 * Each item is a factual headline with detail and topic tags.
 */
export interface NewsBriefJsonb {
  has_news: boolean;
  news_items: {
    headline: string;
    detail: string;
    topics: string[];
    date_mentioned?: string;
    confidence: number;
  }[];
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
  content_digest: ContentDigestJsonb | null;
  idea_sparks: IdeaSparksJsonb | null; // NEW Feb 2026
  insight_extraction: InsightExtractionJsonb | null; // NEW Feb 2026
  news_brief: NewsBriefJsonb | null; // NEW Feb 2026
  multi_event_detection: Record<string, unknown> | null; // NEW Feb 2026 — migration 035
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
  return analysis as unknown as TypedEmailAnalysis;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROFILE EXPANSION TYPES (Migration 040)
// ═══════════════════════════════════════════════════════════════════════════════

/** A household member (spouse, child, parent, etc.) */
export interface HouseholdMember {
  name: string;
  relationship: 'spouse' | 'partner' | 'child' | 'parent' | 'sibling' | 'roommate' | 'other';
  gender?: 'male' | 'female' | 'non_binary' | null;
  birthday?: string | null;   // YYYY-MM-DD
  school?: string | null;     // For kids
}

/** A pet in the household */
export interface Pet {
  name: string;
  type: 'dog' | 'cat' | 'bird' | 'fish' | 'rabbit' | 'hamster' | 'reptile' | 'other';
}

/** A city the user cares about beyond their home address */
export interface OtherCity {
  city: string;               // e.g. "Chicago, IL"
  tag: 'hometown' | 'travel' | 'family' | 'vacation' | 'other';
  note?: string;              // optional free-text
}

/** An additional job or side hustle */
export interface OtherJob {
  role: string;
  company: string;
  is_self_employed: boolean;
}

/** Gender options for user identity */
export type GenderOption = 'male' | 'female' | 'non_binary' | 'prefer_not_to_say';

/** Employment type */
export type EmploymentType = 'employed' | 'self_employed' | 'both';

// ═══════════════════════════════════════════════════════════════════════════════
// PROFILE SUGGESTIONS (Phase 2 — Onboarding AI Autofill)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A single suggestion field with confidence and source metadata.
 * Confidence: 1.0 = found in signature, 0.5 = inferred, <0.3 = low confidence.
 */
export interface ProfileSuggestionField {
  value: string;
  confidence: number;
  source: string;
}

/**
 * AI-generated profile suggestions from analyzing the user's sent emails
 * and contacts. Stored in user_context.profile_suggestions JSONB column.
 *
 * These are NOT auto-saved to the user_context fields (role, company, etc.).
 * The user must confirm/edit them in the Mad Libs onboarding step (Phase 3)
 * before they become "real" context.
 *
 * Generated by: POST /api/onboarding/profile-suggestions
 * Stored in: user_context.profile_suggestions (JSONB)
 * Consumed by: Mad Libs onboarding step (Phase 3)
 */
export interface ProfileSuggestions {
  /** Detected role/title (e.g., "Freelance Designer", "Product Manager") */
  role: ProfileSuggestionField | null;

  /** Detected company (e.g., "Acme Corp", "Self-employed") */
  company: ProfileSuggestionField | null;

  /** Detected industry (e.g., "Technology", "Marketing", "Education") */
  industry: ProfileSuggestionField | null;

  /** Inferred work hours from email send-time distribution */
  workHours: {
    start: string;     // "09:00"
    end: string;       // "17:00"
    days: number[];    // [1,2,3,4,5] = Mon-Fri
    confidence: number;
    source: string;
  } | null;

  /** Key projects extracted from email subjects + content */
  projects: Array<{
    name: string;
    confidence: number;
    mentionCount: number;
  }>;

  /** Suggested priorities based on email patterns */
  priorities: Array<{
    label: string;
    confidence: number;
  }>;

  /** Overall analysis metadata */
  meta: {
    emailsAnalyzed: number;
    accountsUsed: string[];      // account emails analyzed
    processingTimeMs: number;
    totalTokensUsed: number;
    estimatedCost: number;
  };
}
