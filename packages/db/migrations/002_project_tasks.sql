-- ---------------------------------------------------------------------------
-- Project tasks ("Projektaufgaben")
--
-- A project task is one a child chips away at over several days (e.g. a piece
-- of handwork). It has two completion actions in the UI:
--   * "Für heute geschafft"  -> deferred until the next day, then reappears.
--   * "Ganz fertig"          -> the existing complete behaviour (one-off done,
--                               recurring rescheduled to its next due date).
--
-- isProject     marks the task as this two-step type (UI shows two checkmarks).
-- deferredUntil holds the local date (ISO) up to which a "done for today" task
--               stays hidden; NULL means not deferred. Only project tasks ever
--               carry a value, set via deferTask and cleared on undo/complete.
-- ---------------------------------------------------------------------------
ALTER TABLE tasks ADD COLUMN isProject INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN deferredUntil TEXT;

-- Recreate tasks_page_view to expose the two new columns to the frontend/MCP.
DROP VIEW tasks_page_view;
CREATE VIEW tasks_page_view AS
SELECT
  (c.id || '-' || COALESCE(t.id, 'none')) AS id,
  c.id AS child_id,
  c.name AS child_name,
  c.color AS child_color,
  c.group_id AS group_id,
  CAST((SELECT SUM(pt.points) FROM point_transactions pt WHERE pt.child_id = c.id) AS REAL) AS child_points_balance,
  t.id AS task_id,
  t.title AS task_title,
  t.priority AS task_priority,
  t.timeOfDay AS task_time_of_day,
  t.dueDate AS task_due_date,
  t.completed AS task_completed,
  t.completedAt AS task_completed_at,
  t.lastCompletedAt AS task_last_completed_at,
  t.recurrenceType AS task_recurrence_type,
  t.points AS task_points,
  t.isChore AS task_is_chore,
  t.dailyOnly AS task_daily_only,
  t.isProject AS task_is_project,
  t.deferredUntil AS task_deferred_until
FROM children c
LEFT JOIN tasks t ON t.child_id = c.id;
