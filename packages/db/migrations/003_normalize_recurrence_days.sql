-- ---------------------------------------------------------------------------
-- Normalize recurrenceDays to the canonical weekday encoding (issue #88).
--
-- Canonical encoding is JS Date.getDay(): 0=Sunday .. 6=Saturday, so Sunday is
-- only ever 0 (never 7). Validation now rejects 7 / out-of-range / duplicates
-- on write, but legacy rows (incl. data imported from the old PocketBase
-- instance) may still store 7 for Sunday, with duplicates or unsorted.
--
-- This rebuilds every non-NULL recurrenceDays array in place:
--   * map 7 -> 0  (CASE inside the json_each unpack)
--   * DISTINCT     (dedupe, so e.g. [0,7] collapses to [0])
--   * ORDER BY     (sort ascending, for a single canonical representation)
--
-- Uses SQLite's JSON1 functions (json_each / json_group_array), available in
-- the bundled better-sqlite3 build. Rows with NULL recurrenceDays are left
-- untouched. Idempotent: re-running on already-canonical data is a no-op.
-- ---------------------------------------------------------------------------
UPDATE tasks
SET recurrenceDays = (
  SELECT json_group_array(day)
  FROM (
    SELECT DISTINCT
      CASE WHEN je.value = 7 THEN 0 ELSE je.value END AS day
    FROM json_each(tasks.recurrenceDays) AS je
    ORDER BY day
  )
)
WHERE recurrenceDays IS NOT NULL;
