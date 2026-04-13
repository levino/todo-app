import { randomUUID } from 'node:crypto'
import type { Db } from '../db.ts'
import { getActivePhases } from './time_phases.ts'

export type RecurrenceType = 'daily' | 'weekly' | 'once' | 'none'

export type Task = {
  id: string
  childId: string
  timePhaseId: string | null
  title: string
  priority: number
  points: number
  recurrenceType: RecurrenceType
  recurrenceDays: number[] | null
  createdAt: number
  lastCompletedAt: number | null
}

type Row = {
  id: string
  child_id: string
  time_phase_id: string | null
  title: string
  priority: number
  points: number
  recurrence_type: string
  recurrence_days: string | null
  created_at: number
  last_completed_at: number | null
}

const fromRow = (r: Row): Task => ({
  id: r.id,
  childId: r.child_id,
  timePhaseId: r.time_phase_id,
  title: r.title,
  priority: r.priority,
  points: r.points,
  recurrenceType: r.recurrence_type as RecurrenceType,
  recurrenceDays: r.recurrence_days
    ? (JSON.parse(r.recurrence_days) as number[])
    : null,
  createdAt: r.created_at,
  lastCompletedAt: r.last_completed_at,
})

export const createTask = (
  db: Db,
  input: {
    childId: string
    timePhaseId?: string | null
    title: string
    priority?: number
    points?: number
    recurrenceType?: RecurrenceType
    recurrenceDays?: number[] | null
  },
): Task => {
  const id = randomUUID()
  const createdAt = Date.now()
  const recurrenceType = input.recurrenceType ?? 'daily'
  const recurrenceDays = input.recurrenceDays ?? null
  db.prepare(
    `INSERT INTO tasks (id, child_id, time_phase_id, title, priority, points,
       recurrence_type, recurrence_days, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.childId,
    input.timePhaseId ?? null,
    input.title,
    input.priority ?? 0,
    input.points ?? 0,
    recurrenceType,
    recurrenceDays ? JSON.stringify(recurrenceDays) : null,
    createdAt,
  )
  return {
    id,
    childId: input.childId,
    timePhaseId: input.timePhaseId ?? null,
    title: input.title,
    priority: input.priority ?? 0,
    points: input.points ?? 0,
    recurrenceType,
    recurrenceDays,
    createdAt,
    lastCompletedAt: null,
  }
}

export const getTaskById = (db: Db, id: string): Task | null => {
  const row = db
    .prepare(
      `SELECT id, child_id, time_phase_id, title, priority, points,
              recurrence_type, recurrence_days, created_at, last_completed_at
       FROM tasks WHERE id = ?`,
    )
    .get(id) as Row | undefined
  return row ? fromRow(row) : null
}

export const listTasksForChild = (db: Db, childId: string): Task[] => {
  const rows = db
    .prepare(
      `SELECT id, child_id, time_phase_id, title, priority, points,
              recurrence_type, recurrence_days, created_at, last_completed_at
       FROM tasks WHERE child_id = ?
       ORDER BY priority DESC, created_at ASC`,
    )
    .all(childId) as Row[]
  return rows.map(fromRow)
}

export const listTasksForGroup = (db: Db, groupId: string): Task[] => {
  const rows = db
    .prepare(
      `SELECT t.id, t.child_id, t.time_phase_id, t.title, t.priority, t.points,
              t.recurrence_type, t.recurrence_days, t.created_at, t.last_completed_at
       FROM tasks t
       INNER JOIN children c ON c.id = t.child_id
       WHERE c.group_id = ?
       ORDER BY t.priority DESC, t.created_at ASC`,
    )
    .all(groupId) as Row[]
  return rows.map(fromRow)
}

export const updateTask = (
  db: Db,
  id: string,
  updates: Partial<
    Omit<Task, 'id' | 'childId' | 'createdAt' | 'lastCompletedAt'>
  >,
): Task | null => {
  const existing = getTaskById(db, id)
  if (!existing) return null
  const next: Task = { ...existing, ...updates }
  db.prepare(
    `UPDATE tasks SET time_phase_id = ?, title = ?, priority = ?, points = ?,
      recurrence_type = ?, recurrence_days = ? WHERE id = ?`,
  ).run(
    next.timePhaseId,
    next.title,
    next.priority,
    next.points,
    next.recurrenceType,
    next.recurrenceDays ? JSON.stringify(next.recurrenceDays) : null,
    id,
  )
  return next
}

export const deleteTask = (db: Db, id: string): void => {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
}

export const resetTask = (db: Db, id: string): void => {
  db.prepare('UPDATE tasks SET last_completed_at = NULL WHERE id = ?').run(id)
}

const startOfDay = (at: Date): number => {
  const d = new Date(at)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const startOfWeek = (at: Date): number => {
  const d = new Date(at)
  const day = d.getDay()
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export const isTaskActiveNow = (
  task: Task,
  activePhaseIds: Set<string>,
  at: Date,
): boolean => {
  if (task.timePhaseId && !activePhaseIds.has(task.timePhaseId)) return false

  const last = task.lastCompletedAt
  switch (task.recurrenceType) {
    case 'daily':
      return last == null || last < startOfDay(at)
    case 'weekly': {
      if (task.recurrenceDays && !task.recurrenceDays.includes(at.getDay())) {
        return false
      }
      return last == null || last < startOfWeek(at)
    }
    case 'once':
      return last == null
    case 'none':
      return true
  }
}

export const listActiveTasksForChild = (
  db: Db,
  childId: string,
  at: Date,
): Task[] => {
  const child = db
    .prepare('SELECT group_id FROM children WHERE id = ?')
    .get(childId) as { group_id: string } | undefined
  if (!child) return []
  const activePhaseIds = new Set(
    getActivePhases(db, child.group_id, at).map((p) => p.id),
  )
  return listTasksForChild(db, childId).filter((t) =>
    isTaskActiveNow(t, activePhaseIds, at),
  )
}

export const completeTask = (
  db: Db,
  taskId: string,
  at: number = Date.now(),
): { task: Task; pointsEarned: number } | null => {
  const task = getTaskById(db, taskId)
  if (!task) return null
  const completionId = randomUUID()
  const pointsEarned = task.points

  db.transaction(() => {
    db.prepare(
      'INSERT INTO task_completions (id, task_id, child_id, completed_at, points_earned) VALUES (?, ?, ?, ?, ?)',
    ).run(completionId, taskId, task.childId, at, pointsEarned)
    db.prepare('UPDATE tasks SET last_completed_at = ? WHERE id = ?').run(
      at,
      taskId,
    )
    if (pointsEarned > 0) {
      db.prepare(
        `INSERT INTO point_transactions (id, child_id, points, type, description, task_id, created_at)
         VALUES (?, ?, ?, 'task', ?, ?, ?)`,
      ).run(
        randomUUID(),
        task.childId,
        pointsEarned,
        `Completed: ${task.title}`,
        taskId,
        at,
      )
    }
  })()

  return {
    task: { ...task, lastCompletedAt: at },
    pointsEarned,
  }
}
