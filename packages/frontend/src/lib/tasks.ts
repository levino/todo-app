export interface Task {
  id: string
  title: string
  child: string
  priority: number | null
  completed: boolean
  completedAt: string | null
  dueDate: string | null
  recurrenceType: string | null
  recurrenceInterval: number | null
  recurrenceDays: number[] | null
  timeOfDay: string
  lastCompletedAt: string | null
  completedBy: string | null
  points: number
  isChore: boolean
  dailyOnly: boolean
  isProject: boolean
  deferredUntil: string | null
}

export interface Child {
  id: string
  name: string
  color: string
  group: string
}

export interface Group {
  id: string
  name: string
  morningEnd: string
  eveningStart: string
  timezone: string
}

export const PHASES = ['morning', 'afternoon', 'evening'] as const
export type Phase = (typeof PHASES)[number]

export interface TasksPageViewRow {
  id: string
  child_id: string
  child_name: string
  child_color: string
  group_id: string
  child_points_balance: number | null
  task_id: string
  task_title: string
  task_priority: number | null
  task_time_of_day: string
  task_due_date: string
  task_completed: boolean
  task_completed_at: string
  task_last_completed_at: string
  task_recurrence_type: string
  task_points: number
  task_is_chore: boolean
  task_daily_only: boolean
  task_is_project: boolean
  task_deferred_until: string | null
}

export const viewRowToTask = (row: TasksPageViewRow): Task => ({
  id: row.task_id,
  title: row.task_title,
  child: row.child_id,
  priority: row.task_priority,
  completed: row.task_completed,
  completedAt: row.task_completed_at || null,
  dueDate: row.task_due_date || null,
  recurrenceType: row.task_recurrence_type || null,
  recurrenceInterval: null,
  recurrenceDays: null,
  timeOfDay: row.task_time_of_day,
  lastCompletedAt: row.task_last_completed_at || null,
  completedBy: null,
  points: row.task_points,
  isChore: !!row.task_is_chore,
  dailyOnly: !!row.task_daily_only,
  isProject: !!row.task_is_project,
  deferredUntil: row.task_deferred_until || null,
})

export interface ChildTasksSplit {
  child: Child
  pointsBalance: number
  active: Task[]
  recentlyCompleted: Task[]
  future: Task[]
}

export const splitViewRowsByChild = (
  rows: TasksPageViewRow[],
  params: {
    phase: Phase
    todayDateStr: string
    timezone: string
    showFuture: boolean
  },
): ChildTasksSplit[] => {
  const byChildId = new Map<string, ChildTasksSplit>()

  for (const row of rows) {
    let bucket = byChildId.get(row.child_id)
    if (!bucket) {
      bucket = {
        child: {
          id: row.child_id,
          name: row.child_name,
          color: row.child_color,
          group: row.group_id,
        },
        pointsBalance: row.child_points_balance ?? 0,
        active: [],
        recentlyCompleted: [],
        future: [],
      }
      byChildId.set(row.child_id, bucket)
    }

    if (!row.task_id) continue

    const task = viewRowToTask(row)
    const dueDateStr = row.task_due_date ? row.task_due_date.slice(0, 10) : ''
    const completedAtDateStr = row.task_completed_at ? row.task_completed_at.slice(0, 10) : ''
    const lastCompletedAtDateStr = row.task_last_completed_at ? row.task_last_completed_at.slice(0, 10) : ''

    // Project tasks ("Projektaufgaben") can be marked "done for today": this
    // sets deferredUntil to the next day, hiding the task from the active list
    // until then. While deferred it appears in the "done today" section (with
    // an undo) so the child sees what they finished for the day.
    const deferredUntilStr = row.task_deferred_until ? row.task_deferred_until.slice(0, 10) : ''
    const isDeferred = !!deferredUntilStr && deferredUntilStr > params.todayDateStr

    // Daily-only ("Tagesaufgaben") tasks are bound to a single day: they are
    // only active exactly on their due date and expire silently afterwards
    // (no overdue, no carry-forward). Regular tasks stay active once due.
    const dailyOnly = !!row.task_daily_only
    const isActive =
      !row.task_completed &&
      !isDeferred &&
      row.task_time_of_day === params.phase &&
      (dailyOnly
        ? dueDateStr === params.todayDateStr
        : !dueDateStr || dueDateStr <= params.todayDateStr)

    const isRecentlyCompleted =
      isDeferred ||
      (row.task_completed && completedAtDateStr === params.todayDateStr) ||
      (!row.task_completed &&
        !!row.task_recurrence_type &&
        lastCompletedAtDateStr === params.todayDateStr)

    const isFuture =
      !row.task_completed && !!dueDateStr && dueDateStr > params.todayDateStr

    if (isActive) bucket.active.push(task)
    if (isRecentlyCompleted) bucket.recentlyCompleted.push(task)
    if (params.showFuture && isFuture) bucket.future.push(task)
  }

  for (const bucket of byChildId.values()) {
    bucket.active = sortTasks(bucket.active, params.timezone)
    bucket.future.sort((a, b) => {
      if (!a.dueDate) return 1
      if (!b.dueDate) return -1
      return a.dueDate.localeCompare(b.dueDate)
    })
  }

  return Array.from(byChildId.values()).sort((a, b) => a.child.name.localeCompare(b.child.name))
}

export const phaseLabels: Record<string, string> = {
  morning: 'Morgens',
  afternoon: 'Nachmittags',
  evening: 'Abends',
}

export const phaseIcons: Record<Phase, string> = {
  morning: '🌅',
  afternoon: '☀️',
  evening: '🌙',
}

export const isValidPhase = (value: string | null | undefined): value is Phase =>
  value === 'morning' || value === 'afternoon' || value === 'evening'

export const getLocalDateString = (timezone: string, now?: Date): string => {
  const tz = timezone || 'Europe/Berlin'
  const date = now || new Date()
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(date)
}

export const getLocalTimeMinutes = (timezone: string, now?: Date): number => {
  const tz = timezone || 'Europe/Berlin'
  const date = now || new Date()
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0)
  return hour * 60 + minute
}

export const getCurrentPhase = (morningEnd: string, eveningStart: string, timezone?: string, now?: Date): string => {
  const currentMinutes = getLocalTimeMinutes(timezone || 'Europe/Berlin', now)

  const [morningEndHour, morningEndMin] = (morningEnd || '09:00').split(':').map(Number)
  const morningEndMinutes = morningEndHour * 60 + morningEndMin

  const [eveningStartHour, eveningStartMin] = (eveningStart || '18:00').split(':').map(Number)
  const eveningStartMinutes = eveningStartHour * 60 + eveningStartMin

  if (currentMinutes < morningEndMinutes) return 'morning'
  if (currentMinutes < eveningStartMinutes) return 'afternoon'
  return 'evening'
}

export const getLocalWeekday = (timezone: string, date: Date): number => {
  const tz = timezone || 'Europe/Berlin'
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
  })
  const weekdayStr = formatter.format(date)
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return weekdayMap[weekdayStr] ?? date.getDay()
}

export const calculateNextDueDate = (
  recurrenceType: string | null,
  recurrenceInterval: number | null,
  recurrenceDays: number[] | null,
  completedAt: Date,
  timezone?: string,
): string | null => {
  const tz = timezone || 'Europe/Berlin'

  if (recurrenceType === 'interval' && recurrenceInterval) {
    const localDate = getLocalDateString(tz, completedAt)
    const next = new Date(localDate + 'T00:00:00Z')
    next.setUTCDate(next.getUTCDate() + recurrenceInterval)
    return next.toISOString()
  }

  if (recurrenceType === 'weekly' && recurrenceDays && recurrenceDays.length > 0) {
    const sorted = [...recurrenceDays].sort((a, b) => a - b)
    const currentDay = getLocalWeekday(tz, completedAt)
    const localDate = getLocalDateString(tz, completedAt)

    const nextDay = sorted.find((d) => d > currentDay) ?? sorted[0]
    const daysUntil = nextDay > currentDay
      ? nextDay - currentDay
      : 7 - currentDay + nextDay

    const next = new Date(localDate + 'T00:00:00Z')
    next.setUTCDate(next.getUTCDate() + daysUntil)
    return next.toISOString()
  }

  return null
}

// The task mutation operations are delegated to the shared SQLite data layer
// `@family-todo/db`, which ports the exact same recurrence/undo/delete logic
// from the original PocketBase implementation (verified identical). We re-wrap
// them here keeping the same exported names, argument order and return shape
// ({ error?: string }) so callers (actions, api routes) are unaffected — only
// the first argument changes from a PocketBase instance to a DB connection.
import {
  type DB,
  completeTask as dbCompleteTask,
  undoTask as dbUndoTask,
  deleteTask as dbDeleteTask,
  deferTask as dbDeferTask,
  getUserById,
} from '@family-todo/db'

export const completeTask = async (
  db: DB,
  taskId: string,
  childId: string,
  completedBy: string,
  groupId: string,
): Promise<{ error?: string }> => {
  // `completedBy` is a real FK to users(id) in the SQLite store. The app's
  // completion form posts the *child's* id (kids tap their own task), which is
  // not a user — under PocketBase the relation accepted any string, but SQLite
  // enforces the FK. Since the value is never surfaced (the page view always
  // reports completedBy as null) we normalise a non-user value to NULL, keeping
  // behaviour identical and avoiding a FOREIGN KEY violation.
  const validCompletedBy = getUserById(db, completedBy)
    ? completedBy
    : (null as unknown as string)
  return dbCompleteTask(db, taskId, childId, validCompletedBy, groupId)
}

export const undoTask = async (
  db: DB,
  taskId: string,
  timezone?: string,
): Promise<{ error?: string }> => {
  return dbUndoTask(db, taskId, timezone)
}

// Mark a project task as "done for today": defers it to the next day (so it
// drops out of the active list and reappears tomorrow).
export const deferTask = async (
  db: DB,
  taskId: string,
  timezone?: string,
): Promise<{ error?: string }> => {
  return dbDeferTask(db, taskId, timezone)
}

export const deleteTask = async (
  db: DB,
  taskId: string,
  timezone?: string,
): Promise<{ error?: string }> => {
  return dbDeleteTask(db, taskId, timezone)
}

// Sorts purely by priority. The "overdue" concept was removed, so past-due
// tasks are no longer hoisted to the top. (timezone/now are kept for call-site
// compatibility but are no longer needed.)
export const sortTasks = (tasks: Task[], _timezone?: string, _now?: Date): Task[] => {
  return tasks.sort((a, b) => {
    const priorityA = (a.priority === null || a.priority === undefined || a.priority === 0) ? Infinity : a.priority
    const priorityB = (b.priority === null || b.priority === undefined || b.priority === 0) ? Infinity : b.priority
    return priorityA - priorityB
  })
}
