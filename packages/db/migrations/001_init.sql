-- 001_init.sql
-- Initial schema for the Family Todo App data layer.
--
-- Ported faithfully from the PocketBase migrations in
-- packages/api/pocketbase/pb_migrations. Notable adaptations:
--   * TEXT primary keys (15-char ids) preserved so existing relations survive
--     the later data migration.
--   * PB relation fields renamed to *_id (group -> group_id, child -> child_id,
--     user -> user_id, task -> task_id, reward -> reward_id) to avoid the SQL
--     reserved word `group` and for clarity.
--   * Booleans stored as INTEGER (0/1); datetimes as TEXT ISO-8601 strings,
--     matching PocketBase's on-disk format so migration is a straight copy.
--   * The `users` collection becomes a plain table keyed by email (auth is
--     handled by an external proxy presenting a verified email; no password).

-- ---------------------------------------------------------------------------
-- users
-- Identity = email. Populated/upserted by the auth proxy. No password column.
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id      TEXT PRIMARY KEY,
  email   TEXT NOT NULL UNIQUE,
  name    TEXT,
  created TEXT NOT NULL DEFAULT '',
  updated TEXT NOT NULL DEFAULT ''
);

-- ---------------------------------------------------------------------------
-- groups (family / household)
-- ---------------------------------------------------------------------------
CREATE TABLE groups (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  morningEnd   TEXT NOT NULL DEFAULT '09:00',
  eveningStart TEXT NOT NULL DEFAULT '18:00',
  timezone     TEXT NOT NULL DEFAULT 'Europe/Berlin',
  created      TEXT NOT NULL DEFAULT '',
  updated      TEXT NOT NULL DEFAULT ''
);

-- ---------------------------------------------------------------------------
-- children
-- ---------------------------------------------------------------------------
CREATE TABLE children (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  color    TEXT NOT NULL DEFAULT '',
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created  TEXT NOT NULL DEFAULT '',
  updated  TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_children_group ON children(group_id);

-- ---------------------------------------------------------------------------
-- user_groups (membership join table)
-- ---------------------------------------------------------------------------
CREATE TABLE user_groups (
  id       TEXT PRIMARY KEY,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created  TEXT NOT NULL DEFAULT '',
  updated  TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX idx_user_group ON user_groups(user_id, group_id);
CREATE INDEX idx_user_groups_group ON user_groups(group_id);

-- ---------------------------------------------------------------------------
-- tasks (formerly kiosk_tasks)
-- timeOfDay is one of 'morning' | 'afternoon' | 'evening'.
-- recurrenceDays is a JSON array of weekday numbers (0=Sun..6=Sat), or NULL.
-- ---------------------------------------------------------------------------
CREATE TABLE tasks (
  id                 TEXT PRIMARY KEY,
  title              TEXT NOT NULL,
  child_id           TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  priority           REAL,
  completed          INTEGER NOT NULL DEFAULT 0,
  completedAt        TEXT,
  dueDate            TEXT,
  lastCompletedAt    TEXT,
  recurrenceType     TEXT,
  recurrenceInterval REAL,
  recurrenceDays     TEXT,
  timeOfDay          TEXT NOT NULL DEFAULT 'afternoon',
  completedBy        TEXT REFERENCES users(id) ON DELETE SET NULL,
  previousDueDate    TEXT,
  points             INTEGER,
  isChore            INTEGER NOT NULL DEFAULT 0,
  dailyOnly          INTEGER NOT NULL DEFAULT 0,
  created            TEXT NOT NULL DEFAULT '',
  updated            TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_tasks_child ON tasks(child_id);

-- ---------------------------------------------------------------------------
-- rewards
-- ---------------------------------------------------------------------------
CREATE TABLE rewards (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  pointsCost  INTEGER NOT NULL,
  group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created     TEXT NOT NULL DEFAULT '',
  updated     TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_rewards_group ON rewards(group_id);

-- ---------------------------------------------------------------------------
-- point_transactions
-- A child's points balance is the SUM(points) of their transactions.
-- ---------------------------------------------------------------------------
CREATE TABLE point_transactions (
  id          TEXT PRIMARY KEY,
  child_id    TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  points      INTEGER NOT NULL,
  type        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  reward_id   TEXT REFERENCES rewards(id) ON DELETE SET NULL,
  task_id     TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  created     TEXT NOT NULL DEFAULT '',
  updated     TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_point_transactions_child ON point_transactions(child_id);

-- ---------------------------------------------------------------------------
-- tasks_page_view
-- Mirrors the PocketBase view consumed by the frontend/MCP (TasksPageViewRow).
-- One row per (child, task); children with no tasks still appear once with
-- NULL task_* columns. child_points_balance is the summed point_transactions.
-- ---------------------------------------------------------------------------
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
  t.dailyOnly AS task_daily_only
FROM children c
LEFT JOIN tasks t ON t.child_id = c.id;
