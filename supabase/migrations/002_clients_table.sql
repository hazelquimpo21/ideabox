-- =============================================================================
-- IdeaBox Migration 002: Clients Table
-- =============================================================================
-- Creates the clients table for tracking business relationships.
--
-- DESIGN DECISION:
--   "client" is NOT an email category. Instead, emails are linked to clients
--   via foreign key (client_id). This allows a client email to be categorized
--   as "action_required" rather than hidden in a "client" category.
--
--   See docs/DECISIONS.md for full rationale.
-- =============================================================================

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owner of this client record
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Client identification
  name TEXT NOT NULL,           -- "Acme Corp" or "John Smith"
  company TEXT,                 -- Company name if name is a person
  email TEXT,                   -- Primary contact email

  -- Status tracking
  -- active: Currently working with this client
  -- inactive: On hold or between projects
  -- archived: No longer working together
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),

  -- Priority for sorting/filtering
  -- vip clients get highlighted in UI
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'vip')),

  -- Auto-learned patterns (populated by AI analyzer over time)
  -- email_domains: Domains associated with this client (e.g., '@acme.com')
  -- keywords: Common words in their emails (helps with matching)
  email_domains TEXT[],
  keywords TEXT[],

  -- Free-form notes about the client
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_clients_user_id ON clients(user_id);
CREATE INDEX idx_clients_status ON clients(user_id, status);
CREATE INDEX idx_clients_priority ON clients(user_id, priority);

-- GIN index for array searching (find clients by domain)
CREATE INDEX idx_clients_email_domains ON clients USING GIN(email_domains);

-- Enable Row Level Security
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own clients"
  ON clients FOR ALL
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
