-- Migration 046: Category sparkline data RPC
-- Efficient server-side sparkline computation for large datasets.
-- Returns 7-day email volume per category for a given user.
--
-- Client-side computation works for small datasets; this RPC
-- is the optimization path for when the dataset is large.

CREATE OR REPLACE FUNCTION get_category_sparklines(p_user_id uuid)
RETURNS TABLE(category text, day date, count bigint) AS $$
SELECT
    category,
    date_trunc('day', date)::date as day,
    count(*)
FROM emails
WHERE user_id = p_user_id
  AND date >= now() - interval '7 days'
  AND category IS NOT NULL
GROUP BY category, date_trunc('day', date)
ORDER BY category, day;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
