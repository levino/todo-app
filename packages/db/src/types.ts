/**
 * Row/domain types for the data layer.
 *
 * Field names match the SQL columns. Booleans surface as `boolean` from the
 * helpers (converted from the stored 0/1 INTEGER), and recurrenceDays surfaces
 * as `number[] | null` (parsed from the stored JSON TEXT).
 */

export interface User {
  id: string
  email: string
  name: string | null
  created: string
  updated: string
}

export interface Group {
  id: string
  name: string
  morningEnd: string
  eveningStart: string
  timezone: string
  created: string
  updated: string
}

export interface Child {
  id: string
  name: string
  color: string
  group_id: string
  created: string
  updated: string
}

export interface UserGroup {
  id: string
  user_id: string
  group_id: string
  created: string
  updated: string
}

export interface Task {
  id: string
  title: string
  child_id: string
  priority: number | null
  completed: boolean
  completedAt: string | null
  dueDate: string | null
  lastCompletedAt: string | null
  recurrenceType: string | null
  recurrenceInterval: number | null
  recurrenceDays: number[] | null
  timeOfDay: string
  completedBy: string | null
  previousDueDate: string | null
  points: number | null
  isChore: boolean
  dailyOnly: boolean
  isProject: boolean
  deferredUntil: string | null
  created: string
  updated: string
}

export interface Reward {
  id: string
  name: string
  description: string
  pointsCost: number
  group_id: string
  created: string
  updated: string
}

export interface PointTransaction {
  id: string
  child_id: string
  points: number
  type: string
  description: string
  reward_id: string | null
  task_id: string | null
  created: string
  updated: string
}

/**
 * Shape of a row from the tasks_page_view SQL view, matching the columns the
 * frontend/MCP expect (see packages/frontend/src/lib/tasks.ts TasksPageViewRow).
 */
export interface TasksPageViewRow {
  id: string
  child_id: string
  child_name: string
  child_color: string
  group_id: string
  child_points_balance: number | null
  task_id: string | null
  task_title: string | null
  task_priority: number | null
  task_time_of_day: string | null
  task_due_date: string | null
  task_completed: number | null
  task_completed_at: string | null
  task_last_completed_at: string | null
  task_recurrence_type: string | null
  task_points: number | null
  task_is_chore: number | null
  task_daily_only: number | null
  task_is_project: number | null
  task_deferred_until: string | null
}
