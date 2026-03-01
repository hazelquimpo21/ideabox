-- Migration 041: Projects & Project Items
-- Adds project management layer with support for ideas, tasks, and routines.
-- Projects group related items and can be linked to contacts/clients.
-- Project items support due dates, date ranges, and recurrence for routines.
--
-- NEW TABLES:
--   projects       — Project containers with status, priority, date range
--   project_items  — Items (idea/task/routine) within projects
--
-- DESIGN:
--   - Items can exist without a project (project_id is nullable)
--   - Items can be promoted from email-extracted actions (source_action_id)
--   - Items can be linked to emails (source_email_id) and contacts (contact_id)
--   - Routines support recurrence via pattern + JSONB config

-- ═══════════════════════════════════════════════════════════════════════════════
-- PROJECTS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  priority TEXT NOT NULL DEFAULT 'medium',
  color TEXT,
  icon TEXT,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE projects IS 'User projects that group related items (ideas, tasks, routines)';
COMMENT ON COLUMN projects.status IS 'active, on_hold, completed, archived';
COMMENT ON COLUMN projects.priority IS 'low, medium, high';
COMMENT ON COLUMN projects.color IS 'Hex color for UI display (e.g. #3b82f6)';
COMMENT ON COLUMN projects.icon IS 'Emoji or icon name for UI display';
COMMENT ON COLUMN projects.contact_id IS 'Optional link to a client/contact';
COMMENT ON COLUMN projects.start_date IS 'When the project begins (nullable)';
COMMENT ON COLUMN projects.end_date IS 'When the project ends (nullable)';

-- ═══════════════════════════════════════════════════════════════════════════════
-- PROJECT ITEMS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS project_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL DEFAULT 'task',
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'medium',
  start_date DATE,
  due_date DATE,
  end_date DATE,
  recurrence_pattern TEXT,
  recurrence_config JSONB DEFAULT '{}'::jsonb,
  estimated_minutes INTEGER,
  source_action_id UUID REFERENCES actions(id) ON DELETE SET NULL,
  source_email_id UUID REFERENCES emails(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  tags TEXT[] DEFAULT '{}',
  sort_order INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE project_items IS 'Items within projects: ideas, tasks, and routines';
COMMENT ON COLUMN project_items.project_id IS 'Nullable — items can be unassigned to any project';
COMMENT ON COLUMN project_items.item_type IS 'idea, task, or routine';
COMMENT ON COLUMN project_items.status IS 'backlog, pending, in_progress, completed, cancelled';
COMMENT ON COLUMN project_items.priority IS 'low, medium, high, urgent';
COMMENT ON COLUMN project_items.start_date IS 'When work begins (nullable)';
COMMENT ON COLUMN project_items.due_date IS 'Single deadline date (nullable)';
COMMENT ON COLUMN project_items.end_date IS 'End of date range for multi-day work (nullable)';
COMMENT ON COLUMN project_items.recurrence_pattern IS 'daily, weekly, biweekly, monthly, or null';
COMMENT ON COLUMN project_items.recurrence_config IS '{ day_of_week?: number, interval?: number, ends_at?: string }';
COMMENT ON COLUMN project_items.source_action_id IS 'If promoted from an email-extracted action';
COMMENT ON COLUMN project_items.source_email_id IS 'If linked to a source email';
COMMENT ON COLUMN project_items.tags IS 'Freeform text tags for filtering';
COMMENT ON COLUMN project_items.sort_order IS 'Manual ordering within a project';

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — PROJECTS
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_select ON projects
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY projects_insert ON projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY projects_update ON projects
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY projects_delete ON projects
  FOR DELETE USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — PROJECT ITEMS
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE project_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_items_select ON project_items
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY project_items_insert ON project_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY project_items_update ON project_items
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY project_items_delete ON project_items
  FOR DELETE USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(user_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_contact ON projects(contact_id) WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_items_user_id ON project_items(user_id);
CREATE INDEX IF NOT EXISTS idx_project_items_project ON project_items(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_project_items_type ON project_items(user_id, item_type);
CREATE INDEX IF NOT EXISTS idx_project_items_status ON project_items(user_id, status);
CREATE INDEX IF NOT EXISTS idx_project_items_due_date ON project_items(user_id, due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_project_items_source_action ON project_items(source_action_id) WHERE source_action_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- UPDATED_AT TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER project_items_updated_at
  BEFORE UPDATE ON project_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
