import type { DB } from './connection.js'
import { generateId } from './ids.js'
import type { Child, Group, Task, TasksPageViewRow } from './types.js'

// ===========================================================================
// View / domain types re-exported for consumers (frontend & MCP).
// These mirror packages/frontend/src/lib/tasks.ts.
// ===========================================================================

export const PHASES = ['morning', 'afternoon', 'evening'] as const
export type Phase = (typeof PHASES)[number]

/**
 * The "view-shaped" Task the frontend consumes from tasks_page_view. It is a
 * narrower projection than the full Task row (e.g. no recurrenceInterval/Days,
 * no completedBy). Kept identical to frontend/lib/tasks.ts Task.
 */
export interface ViewTask {
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

export interface ViewChild {
  id: string
  name: string
  color: string
  group: string
}

export const viewRowToTask = (row: TasksPageViewRow): ViewTask => ({
  id: row.task_id as string,
  title: row.task_title as string,
  child: row.child_id,
  priority: row.task_priority,
  completed: !!row.task_completed,
  completedAt: row.task_completed_at || null,
  dueDate: row.task_due_date || null,
  recurrenceType: row.task_recurrence_type || null,
  recurrenceInterval: null,
  recurrenceDays: null,
  timeOfDay: row.task_time_of_day as string,
  lastCompletedAt: row.task_last_completed_at || null,
  completedBy: null,
  points: row.task_points as number,
  isChore: !!row.task_is_chore,
  dailyOnly: !!row.task_daily_only,
  isProject: !!row.task_is_project,
  deferredUntil: row.task_deferred_until || null,
})

export interface ChildTasksSplit {
  child: ViewChild
  pointsBalance: number
  active: ViewTask[]
  recentlyCompleted: ViewTask[]
  future: ViewTask[]
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
    const lastCompletedAtDateStr = row.task_last_completed_at
      ? row.task_last_completed_at.slice(0, 10)
      : ''

    // Project tasks ("Projektaufgaben") can be marked "done for today": this
    // sets deferredUntil to the next day, hiding the task from the active list
    // until then. While deferred it appears in the "done today" section (with
    // an undo) so the child sees what they finished for the day.
    const deferredUntilStr = row.task_deferred_until
      ? row.task_deferred_until.slice(0, 10)
      : ''
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
      (!!row.task_completed && completedAtDateStr === params.todayDateStr) ||
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

  return Array.from(byChildId.values()).sort((a, b) =>
    a.child.name.localeCompare(b.child.name),
  )
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

// ===========================================================================
// Pure timezone / phase / recurrence logic.
// Ported verbatim from frontend/lib/tasks.ts (+ MCP server.ts for
// calculateInitialDueDate & validateRecurrenceDays).
// ===========================================================================

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

export const getCurrentPhase = (
  morningEnd: string,
  eveningStart: string,
  timezone?: string,
  now?: Date,
): string => {
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
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
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
    const daysUntil = nextDay > currentDay ? nextDay - currentDay : 7 - currentDay + nextDay

    const next = new Date(localDate + 'T00:00:00Z')
    next.setUTCDate(next.getUTCDate() + daysUntil)
    return next.toISOString()
  }

  return null
}

export const calculateInitialDueDate = (
  recurrenceType: string | null,
  recurrenceInterval: number | null,
  recurrenceDays: number[] | null,
  today: Date,
  timezone?: string,
): string | null => {
  const tz = timezone || 'UTC'

  if (recurrenceType === 'interval' && recurrenceInterval) {
    const localDate = getLocalDateString(tz, today)
    return new Date(localDate + 'T00:00:00Z').toISOString()
  }

  if (recurrenceType === 'weekly' && recurrenceDays && recurrenceDays.length > 0) {
    const sorted = [...recurrenceDays].sort((a, b) => a - b)
    const currentDay = getLocalWeekday(tz, today)
    const localDate = getLocalDateString(tz, today)

    const nextDay = sorted.find((d) => d >= currentDay) ?? sorted[0]
    const daysUntil = nextDay >= currentDay ? nextDay - currentDay : 7 - currentDay + nextDay

    const next = new Date(localDate + 'T00:00:00Z')
    next.setUTCDate(next.getUTCDate() + daysUntil)
    return next.toISOString()
  }

  return null
}

/**
 * Validate the canonical weekday encoding for recurrenceDays.
 * Canonical encoding is JavaScript's Date.getDay(): 0=Sunday..6=Saturday.
 * Returns an error message string, or null when valid.
 */
export function validateRecurrenceDays(days: number[] | null | undefined): string | null {
  if (days == null) return null
  if (!Array.isArray(days)) return 'recurrenceDays must be an array of weekday numbers.'
  for (const d of days) {
    if (!Number.isInteger(d) || d < 0 || d > 6) {
      return `Invalid weekday ${d} in recurrenceDays. Use 0=Sunday, 1=Monday, ..., 6=Saturday (7 is not allowed; Sunday is 0).`
    }
  }
  if (new Set(days).size !== days.length) {
    return 'recurrenceDays must not contain duplicate weekdays.'
  }
  return null
}

/**
 * Sorts purely by priority. Past-due tasks are NOT hoisted (the "overdue"
 * concept was removed). timezone/now kept for call-site compatibility.
 */
export const sortTasks = <T extends { priority: number | null }>(
  tasks: T[],
  _timezone?: string,
  _now?: Date,
): T[] => {
  return tasks.sort((a, b) => {
    const priorityA =
      a.priority === null || a.priority === undefined || a.priority === 0
        ? Infinity
        : a.priority
    const priorityB =
      b.priority === null || b.priority === undefined || b.priority === 0
        ? Infinity
        : b.priority
    return priorityA - priorityB
  })
}

// ===========================================================================
// SQL row mapping
// ===========================================================================

interface TaskRow {
  id: string
  title: string
  child_id: string
  priority: number | null
  completed: number
  completedAt: string | null
  dueDate: string | null
  lastCompletedAt: string | null
  recurrenceType: string | null
  recurrenceInterval: number | null
  recurrenceDays: string | null
  timeOfDay: string
  completedBy: string | null
  previousDueDate: string | null
  points: number | null
  isChore: number
  dailyOnly: number
  isProject: number
  deferredUntil: string | null
  created: string
  updated: string
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    child_id: row.child_id,
    priority: row.priority,
    completed: !!row.completed,
    completedAt: row.completedAt,
    dueDate: row.dueDate,
    lastCompletedAt: row.lastCompletedAt,
    recurrenceType: row.recurrenceType,
    recurrenceInterval: row.recurrenceInterval,
    recurrenceDays: row.recurrenceDays ? (JSON.parse(row.recurrenceDays) as number[]) : null,
    timeOfDay: row.timeOfDay,
    completedBy: row.completedBy,
    previousDueDate: row.previousDueDate,
    points: row.points,
    isChore: !!row.isChore,
    dailyOnly: !!row.dailyOnly,
    isProject: !!row.isProject,
    deferredUntil: row.deferredUntil,
    created: row.created,
    updated: row.updated,
  }
}

// ===========================================================================
// CRUD + listing (mirrors MCP task tools)
// ===========================================================================

/**
 * Fetch the full task row by id, or null.
 */
export function getTask(db: DB, taskId: string): Task | null {
  const row = db.prepare<[string], TaskRow>('SELECT * FROM tasks WHERE id = ?').get(taskId)
  return row ? rowToTask(row) : null
}

/**
 * List tasks for a child. By default excludes completed tasks (matches MCP
 * list_tasks). Ordered by priority then title for determinism.
 */
export function listTasks(
  db: DB,
  childId: string,
  includeCompleted = false,
): Task[] {
  const sql = includeCompleted
    ? 'SELECT * FROM tasks WHERE child_id = ?'
    : 'SELECT * FROM tasks WHERE child_id = ? AND completed = 0'
  const rows = db.prepare<[string], TaskRow>(sql).all(childId)
  return rows.map(rowToTask)
}

export interface CreateTaskInput {
  title: string
  timeOfDay: string
  priority?: number | null
  dueDate?: string | null
  recurrenceType?: string | null
  recurrenceInterval?: number | null
  recurrenceDays?: number[] | null
  points?: number | null
  isChore?: boolean
  dailyOnly?: boolean
  isProject?: boolean
}

/**
 * Create a task for a child. Computes the effective dueDate the same way the
 * MCP create_task tool does: explicit dueDate wins, else calculateInitialDueDate
 * based on the child's group timezone.
 */
export function createTask(
  db: DB,
  childId: string,
  input: CreateTaskInput,
): Task {
  const child = db.prepare<[string], Child>('SELECT * FROM children WHERE id = ?').get(childId)
  if (!child) throw new Error(`child not found: ${childId}`)
  const group = db
    .prepare<[string], Group>('SELECT * FROM groups WHERE id = ?')
    .get(child.group_id)
  const timezone = group?.timezone || 'Europe/Berlin'

  const effectiveDueDate =
    input.dueDate ??
    calculateInitialDueDate(
      input.recurrenceType ?? null,
      input.recurrenceInterval ?? null,
      input.recurrenceDays ?? null,
      new Date(),
      timezone,
    )

  const now = new Date().toISOString()
  const id = generateId()
  db.prepare(
    `INSERT INTO tasks
      (id, title, child_id, priority, completed, completedAt, dueDate, lastCompletedAt,
       recurrenceType, recurrenceInterval, recurrenceDays, timeOfDay, completedBy,
       previousDueDate, points, isChore, dailyOnly, isProject, deferredUntil, created, updated)
     VALUES (?, ?, ?, ?, 0, NULL, ?, NULL, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, NULL, ?, ?)`,
  ).run(
    id,
    input.title,
    childId,
    input.priority ?? null,
    effectiveDueDate,
    input.recurrenceType ?? null,
    input.recurrenceInterval ?? null,
    input.recurrenceDays ? JSON.stringify(input.recurrenceDays) : null,
    input.timeOfDay,
    input.points ?? null,
    input.isChore ? 1 : 0,
    input.dailyOnly ? 1 : 0,
    input.isProject ? 1 : 0,
    now,
    now,
  )
  return getTask(db, id) as Task
}

export interface UpdateTaskInput {
  title?: string
  priority?: number
  childId?: string
  timeOfDay?: string
  isChore?: boolean
  dailyOnly?: boolean
  isProject?: boolean
  dueDate?: string
  recurrenceType?: string
  recurrenceInterval?: number
  recurrenceDays?: number[]
}

/**
 * Update a task. Only the provided fields are changed (matches MCP update_task
 * semantics: title/priority/childId/timeOfDay use truthy/!==undefined guards
 * exactly as the original handler).
 */
export function updateTask(db: DB, taskId: string, input: UpdateTaskInput): void {
  const sets: string[] = []
  const values: unknown[] = []
  if (input.title) {
    sets.push('title = ?')
    values.push(input.title)
  }
  if (input.priority !== undefined) {
    sets.push('priority = ?')
    values.push(input.priority)
  }
  if (input.childId) {
    sets.push('child_id = ?')
    values.push(input.childId)
  }
  if (input.timeOfDay) {
    sets.push('timeOfDay = ?')
    values.push(input.timeOfDay)
  }
  if (input.isChore !== undefined) {
    sets.push('isChore = ?')
    values.push(input.isChore ? 1 : 0)
  }
  if (input.dailyOnly !== undefined) {
    sets.push('dailyOnly = ?')
    values.push(input.dailyOnly ? 1 : 0)
  }
  if (input.isProject !== undefined) {
    sets.push('isProject = ?')
    values.push(input.isProject ? 1 : 0)
  }
  if (input.dueDate !== undefined) {
    sets.push('dueDate = ?')
    values.push(input.dueDate)
  }
  if (input.recurrenceType !== undefined) {
    sets.push('recurrenceType = ?')
    values.push(input.recurrenceType)
  }
  if (input.recurrenceInterval !== undefined) {
    sets.push('recurrenceInterval = ?')
    values.push(input.recurrenceInterval)
  }
  if (input.recurrenceDays !== undefined) {
    sets.push('recurrenceDays = ?')
    values.push(JSON.stringify(input.recurrenceDays))
  }
  if (sets.length === 0) return
  sets.push('updated = ?')
  values.push(new Date().toISOString())
  values.push(taskId)
  db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...(values as never[]))
}

/**
 * Hard-delete a task row. (See deleteTask below for the smarter recurring-aware
 * deletion ported from the frontend.) Mirrors MCP delete_task.
 */
export function deleteTaskRow(db: DB, taskId: string): void {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId)
}

/**
 * Reset a (recurring) task to incomplete. Mirrors MCP reset_task: optionally
 * sets a specific dueDate; otherwise restores dueDate to lastCompletedAt for
 * recurring tasks.
 */
export function resetTask(db: DB, taskId: string, dueDate?: string): void {
  const sets: string[] = ['completed = 0', 'completedAt = NULL']
  const values: unknown[] = []
  if (dueDate) {
    sets.push('dueDate = ?')
    values.push(dueDate)
  } else {
    const task = getTask(db, taskId)
    if (task?.lastCompletedAt && task.recurrenceType) {
      sets.push('dueDate = ?')
      values.push(task.lastCompletedAt)
    }
  }
  sets.push('updated = ?')
  values.push(new Date().toISOString())
  values.push(taskId)
  db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...(values as never[]))
}

// ===========================================================================
// Business ops ported from frontend/lib/tasks.ts (PocketBase -> SQL).
// Behaviour kept identical; signatures take (db, ...) instead of (pb, ...).
//
// Deviation: where the PocketBase code cleared the completedBy relation by
// writing the empty string ('' is PB's "no relation"), we write SQL NULL.
// completedBy is a real FK (REFERENCES users(id)) and, with foreign_keys=ON,
// '' is not a valid users.id and would raise FOREIGN KEY constraint failed.
// NULL is the correct "no relation" in SQL and matches the nullable column.
// ===========================================================================

/**
 * Mark a (project) task as "done for today": it stays incomplete but is hidden
 * from the active list until the next local day, after which it reappears.
 * Implemented by setting deferredUntil to tomorrow's local date.
 */
export function deferTask(db: DB, taskId: string, timezone?: string): { error?: string } {
  const task = getTask(db, taskId)
  if (!task) return { error: 'not-found' }
  if (task.completed) return { error: 'already-completed' }

  const tz = timezone || 'Europe/Berlin'
  const todayStr = getLocalDateString(tz, new Date())
  const next = new Date(todayStr + 'T00:00:00Z')
  next.setUTCDate(next.getUTCDate() + 1)
  const deferredUntil = next.toISOString()

  db.prepare('UPDATE tasks SET deferredUntil = ?, updated = ? WHERE id = ?').run(
    deferredUntil,
    new Date().toISOString(),
    taskId,
  )
  return {}
}

/**
 * Complete a task. For recurring tasks this reschedules to the next due date
 * (leaving it incomplete); for one-off tasks it marks completed. Returns an
 * error code for the same conditions the original raised.
 */
export function completeTask(
  db: DB,
  taskId: string,
  _childId: string,
  completedBy: string,
  groupId: string,
): { error?: string } {
  const now = new Date()
  const task = getTask(db, taskId)
  if (!task) return { error: 'not-found' }

  if (task.completed) {
    return { error: 'already-completed' }
  }

  const group = db.prepare<[string], Group>('SELECT * FROM groups WHERE id = ?').get(groupId)
  const timezone = group?.timezone || 'Europe/Berlin'

  if (task.dueDate) {
    const dueDateStr = task.dueDate.slice(0, 10)
    const todayStr = getLocalDateString(timezone, now)
    if (dueDateStr > todayStr) {
      return { error: 'not-yet-due' }
    }
  }

  const nextDueDate = calculateNextDueDate(
    task.recurrenceType,
    task.recurrenceInterval,
    task.recurrenceDays,
    now,
    timezone,
  )

  const updated = now.toISOString()
  if (nextDueDate) {
    db.prepare(
      `UPDATE tasks SET completed = 0, completedAt = NULL, completedBy = NULL,
         lastCompletedAt = ?, dueDate = ?, previousDueDate = ?, deferredUntil = NULL, updated = ?
       WHERE id = ?`,
    ).run(now.toISOString(), nextDueDate, task.dueDate || null, updated, taskId)
  } else {
    db.prepare(
      `UPDATE tasks SET completed = 1, completedAt = ?, completedBy = ?,
         lastCompletedAt = ?, previousDueDate = ?, deferredUntil = NULL, updated = ?
       WHERE id = ?`,
    ).run(now.toISOString(), completedBy, now.toISOString(), task.dueDate || null, updated, taskId)
  }

  return {}
}

/**
 * Undo a completion done today (one-off) or a recurring completion logged today
 * (restores previousDueDate). Ported verbatim from frontend undoTask.
 */
export function undoTask(db: DB, taskId: string, timezone?: string): { error?: string } {
  const task = getTask(db, taskId)
  if (!task) return { error: 'not-found' }
  const now = new Date()
  const tz = timezone || 'Europe/Berlin'
  const todayStr = getLocalDateString(tz, now)
  const todayStart = todayStr + ' 00:00:00.000Z'

  // A project task marked "done for today" carries a future deferredUntil.
  // Undoing it simply lifts the deferral so it returns to the active list.
  if (task.deferredUntil && task.deferredUntil.slice(0, 10) > todayStr) {
    db.prepare('UPDATE tasks SET deferredUntil = NULL, updated = ? WHERE id = ?').run(
      now.toISOString(),
      taskId,
    )
    return {}
  }

  const completedToday =
    task.completed && task.completedAt && task.completedAt >= todayStart
  const recurringCompletedToday =
    !task.completed &&
    task.lastCompletedAt &&
    task.lastCompletedAt >= todayStart &&
    task.recurrenceType

  if (!completedToday && !recurringCompletedToday) {
    return { error: 'not-completed-today' }
  }

  const updated = now.toISOString()
  if (task.recurrenceType && recurringCompletedToday) {
    db.prepare(
      `UPDATE tasks SET dueDate = ?, lastCompletedAt = NULL, previousDueDate = NULL, updated = ?
       WHERE id = ?`,
    ).run(task.previousDueDate || task.dueDate, updated, taskId)
  } else {
    db.prepare(
      `UPDATE tasks SET completed = 0, completedAt = NULL, completedBy = NULL,
         lastCompletedAt = NULL, previousDueDate = NULL, updated = ?
       WHERE id = ?`,
    ).run(updated, taskId)
  }

  return {}
}

/**
 * Delete a task. For recurring tasks with a dueDate this instead advances the
 * dueDate past today's backlog (skipping the current/overdue instance) rather
 * than removing the row. Ported verbatim from frontend deleteTask.
 */
export function deleteTask(db: DB, taskId: string, timezone?: string): { error?: string } {
  try {
    const task = getTask(db, taskId)
    if (!task) return { error: 'not-found' }

    if (task.recurrenceType && task.dueDate) {
      const tz = timezone || 'Europe/Berlin'
      const todayStr = getLocalDateString(tz, new Date())
      const dueDateStr = task.dueDate.slice(0, 10)
      const threshold = todayStr > dueDateStr ? todayStr : dueDateStr

      let nextDueDate: string | null = task.dueDate
      let guard = 0
      while (nextDueDate) {
        const base = new Date(nextDueDate.slice(0, 10) + 'T00:00:00Z')
        nextDueDate = calculateNextDueDate(
          task.recurrenceType,
          task.recurrenceInterval,
          task.recurrenceDays,
          base,
          tz,
        )
        if (!nextDueDate || nextDueDate.slice(0, 10) > threshold) break
        if (++guard > 4000) break
      }

      if (nextDueDate) {
        db.prepare(
          'UPDATE tasks SET dueDate = ?, deferredUntil = NULL, updated = ? WHERE id = ?',
        ).run(nextDueDate, new Date().toISOString(), taskId)
        return {}
      }
    }

    db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId)
    return {}
  } catch {
    return { error: 'not-found' }
  }
}

// ===========================================================================
// tasks_page_view access
// ===========================================================================

/**
 * Read the tasks_page_view rows for every child in a group (ownership scoping
 * is the caller's responsibility via userInGroup). This feeds splitViewRowsByChild.
 */
export function getTasksPageViewForGroup(db: DB, groupId: string): TasksPageViewRow[] {
  return db
    .prepare<[string], TasksPageViewRow>(
      `SELECT v.* FROM tasks_page_view v
       JOIN children c ON c.id = v.child_id
       WHERE c.group_id = ?`,
    )
    .all(groupId)
}

/**
 * Read the tasks_page_view rows for a single child.
 */
export function getTasksPageViewForChild(db: DB, childId: string): TasksPageViewRow[] {
  return db
    .prepare<[string], TasksPageViewRow>(
      'SELECT * FROM tasks_page_view WHERE child_id = ?',
    )
    .all(childId)
}
