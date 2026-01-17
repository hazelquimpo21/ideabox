-- =============================================================================
-- IdeaBox Migration 005: Actions Table
-- =============================================================================
-- Stores to-do items extracted from emails by the Action Extractor analyzer.
--
-- DESIGN NOTES:
--   - email_id is nullable to support manual action creation (Phase 2)
--   - client_id links action to client for filtering
--   - urgency_score (1-10) is AI-generated for prioritization
-- =============================================================================

CREATE TABLE actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owner
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Source email (nullable to support manual actions in future)
  email_id UUID REFERENCES emails(id) ON DELETE SET NULL,

  -- Client association (for filtering actions by client)
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,

  -- Action content
  title TEXT NOT NULL,
  description TEXT,

  -- Action type (from AI extraction)
  -- respond: Need to reply to email
  -- review: Need to review content
  -- create: Need to create something
  -- schedule: Need to schedule meeting/event
  -- decide: Need to make a decision
  action_type TEXT CHECK (action_type IS NULL OR action_type IN (
    'respond',
    'review',
    'create',
    'schedule',
    'decide',
    'none'
  )),

  -- Priority and timing
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

  -- AI-generated urgency score (1-10)
  -- 1-3: Can wait a week or more
  -- 4-6: Should be done this week
  -- 7-8: Should be done in 1-2 days
  -- 9-10: Urgent, needs immediate attention
  urgency_score INTEGER DEFAULT 5 CHECK (urgency_score BETWEEN 1 AND 10),

  -- Deadline extracted from email (if mentioned)
  deadline TIMESTAMPTZ,

  -- AI's estimate of time needed (in minutes)
  estimated_minutes INTEGER,

  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',
    'in_progress',
    'completed',
    'cancelled'
  )),

  -- When action was completed
  completed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_actions_user_id ON actions(user_id);
CREATE INDEX idx_actions_email_id ON actions(email_id);
CREATE INDEX idx_actions_client_id ON actions(client_id);
CREATE INDEX idx_actions_status ON actions(user_id, status);

-- Index for pending actions with deadlines (for "due today" queries)
CREATE INDEX idx_actions_pending_deadline ON actions(user_id, deadline)
  WHERE status IN ('pending', 'in_progress');

-- Index for urgency-based sorting
CREATE INDEX idx_actions_urgency ON actions(user_id, urgency_score DESC)
  WHERE status IN ('pending', 'in_progress');

-- Enable Row Level Security
ALTER TABLE actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own actions"
  ON actions FOR ALL
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_actions_updated_at
  BEFORE UPDATE ON actions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
