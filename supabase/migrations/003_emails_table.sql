-- =============================================================================
-- IdeaBox Migration 003: Emails Table
-- =============================================================================
-- Creates the central emails table for storing synced Gmail messages.
--
-- KEY DESIGN DECISIONS:
--
-- 1. CATEGORY IS ACTION-FOCUSED:
--    Categories answer "what does the user need to DO with this email?"
--    NOT "who sent it." Client emails are linked via client_id instead.
--
-- 2. BODY TRUNCATION:
--    body_text may be truncated to 16K chars for AI cost efficiency.
--    body_html is stored in full for display purposes.
--
-- 3. FAILURE TRACKING:
--    analysis_error stores why analysis failed (if it did).
--    Emails with errors are NOT retried on subsequent syncs.
--
-- See docs/DECISIONS.md for full rationale.
-- =============================================================================

CREATE TABLE emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership and source
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_account_id UUID NOT NULL REFERENCES gmail_accounts(id) ON DELETE CASCADE,

  -- Gmail identifiers (critical for sync)
  -- gmail_id: Unique message ID from Gmail API
  -- thread_id: Groups related messages in a conversation
  gmail_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,

  -- Email metadata
  subject TEXT,
  sender_email TEXT NOT NULL,
  sender_name TEXT,
  recipient_email TEXT,
  date TIMESTAMPTZ NOT NULL,

  -- Email content
  -- snippet: Gmail's short preview (always available, good for list views)
  -- body_text: Plain text body (may be truncated to 16K chars for AI)
  -- body_html: HTML body (stored in full for rendering)
  snippet TEXT,
  body_text TEXT,
  body_html TEXT,

  -- Gmail labels and IdeaBox categorization
  -- gmail_labels: Original labels from Gmail (['INBOX', 'UNREAD', etc.])
  gmail_labels TEXT[],

  -- IMPORTANT: Category is action-focused, NOT sender-focused.
  -- "client" is NOT a valid category. Use client_id relationship instead.
  -- Valid categories: action_required, event, newsletter, promo, admin, personal, noise
  category TEXT CHECK (category IS NULL OR category IN (
    'action_required',
    'event',
    'newsletter',
    'promo',
    'admin',
    'personal',
    'noise'
  )),

  -- Priority score from AI (1-10, higher = more important)
  priority_score INTEGER DEFAULT 5 CHECK (priority_score BETWEEN 1 AND 10),

  -- AI-extracted topics (e.g., ['billing', 'meeting', 'project-update'])
  -- Useful for filtering and searching
  topics TEXT[],

  -- Client relationship (separate from category!)
  -- An email can be action_required AND from a client
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,

  -- Project tags for organization (e.g., ['PodcastPipeline'])
  project_tags TEXT[],

  -- Read/archive/star state
  is_read BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  is_starred BOOLEAN DEFAULT FALSE,

  -- Analysis state
  -- analyzed_at: When AI analysis completed (null = not yet analyzed)
  -- analysis_error: If analysis failed, why (null = success or not attempted)
  analyzed_at TIMESTAMPTZ,
  analysis_error TEXT,

  -- Gmail label sync tracking
  -- TRUE when we've synced our category back to Gmail as a label
  gmail_label_synced BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate imports of same email
  UNIQUE(user_id, gmail_id)
);

-- Indexes for common queries
CREATE INDEX idx_emails_user_id ON emails(user_id);
CREATE INDEX idx_emails_gmail_account_id ON emails(gmail_account_id);
CREATE INDEX idx_emails_date ON emails(user_id, date DESC);
CREATE INDEX idx_emails_category ON emails(user_id, category);
CREATE INDEX idx_emails_client_id ON emails(client_id);
CREATE INDEX idx_emails_thread_id ON emails(thread_id);

-- Index for finding unanalyzed emails
CREATE INDEX idx_emails_unanalyzed ON emails(user_id, analyzed_at)
  WHERE analyzed_at IS NULL AND analysis_error IS NULL;

-- Index for archived filter
CREATE INDEX idx_emails_not_archived ON emails(user_id, is_archived)
  WHERE is_archived = FALSE;

-- Full-text search on subject and snippet
CREATE INDEX idx_emails_search ON emails
  USING GIN(to_tsvector('english', COALESCE(subject, '') || ' ' || COALESCE(snippet, '')));

-- GIN indexes for array searches
CREATE INDEX idx_emails_topics ON emails USING GIN(topics);
CREATE INDEX idx_emails_project_tags ON emails USING GIN(project_tags);

-- Enable Row Level Security
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own emails"
  ON emails FOR ALL
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_emails_updated_at
  BEFORE UPDATE ON emails
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
