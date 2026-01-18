-- =============================================================================
-- IdeaBox Migration 010: Add Sync Progress Column
-- =============================================================================
-- Adds sync_progress JSONB column to user_profiles for tracking initial
-- email sync status during onboarding and discovery.
--
-- COLUMNS ADDED:
--   - sync_progress: JSONB column storing sync state (see types/discovery.ts)
--   - initial_sync_completed_at: Timestamp when initial sync finished
--
-- The sync_progress column stores:
--   {
--     "status": "pending" | "in_progress" | "completed" | "failed",
--     "progress": 0-100,
--     "currentStep": "Fetching emails...",
--     "discoveries": { "actionItems": 5, "events": 2, "clientsDetected": [] },
--     "startedAt": "2024-01-01T00:00:00Z",
--     "updatedAt": "2024-01-01T00:00:00Z",
--     "result": { ... full InitialSyncResponse when completed },
--     "error": "Error message if failed"
--   }
-- =============================================================================

-- Add sync_progress column
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS sync_progress JSONB;

-- Add initial_sync_completed_at timestamp
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS initial_sync_completed_at TIMESTAMPTZ;

-- Add comment for documentation
COMMENT ON COLUMN user_profiles.sync_progress IS
  'JSONB storing initial email sync progress. See types/discovery.ts StoredSyncProgress.';

COMMENT ON COLUMN user_profiles.initial_sync_completed_at IS
  'Timestamp when the initial email analysis was completed. NULL if never completed.';

-- Create index for querying users with active syncs
CREATE INDEX IF NOT EXISTS idx_user_profiles_sync_status
  ON user_profiles ((sync_progress->>'status'))
  WHERE sync_progress IS NOT NULL;
