-- =============================================================================
-- IdeaBox Migration 020: Add UPDATE Policy for Email Analyses
-- =============================================================================
-- FIXES: "new row violates row-level security policy (USING expression)"
--
-- PROBLEM:
--   The email_analyses table only had SELECT and INSERT policies.
--   When the rescan API runs, it uses UPSERT which attempts to UPDATE
--   existing records. Without an UPDATE policy, these updates fail.
--
-- SOLUTION:
--   Add an UPDATE policy that allows users to update their own analyses.
-- =============================================================================

-- Add UPDATE policy for email_analyses
-- Users can update their own analyses (needed for rescan/re-analysis)
CREATE POLICY "Users can update own analyses"
  ON email_analyses FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Also add DELETE policy for completeness
-- Users may want to clear analyses and re-run them
CREATE POLICY "Users can delete own analyses"
  ON email_analyses FOR DELETE
  USING (auth.uid() = user_id);
