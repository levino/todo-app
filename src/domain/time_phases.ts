import { randomUUID } from 'node:crypto'
import type { Db } from '../db.ts'

export type TimePhase = {
  id: string
  groupId: string
  name: string
  startHour: number
  startMinute: number
  endHour: number
  endMinute: number
  daysOfWeek: number[]
  sortOrder: number
}

type Row = {
  id: string
  group_id: string
  name: string
  start_hour: number
  start_minute: number
  end_hour: number
  end_minute: number
  days_of_week: string
  sort_order: number
}

const fromRow = (r: Row): TimePhase => ({
  id: r.id,
  groupId: r.group_id,
  name: r.name,
  startHour: r.start_hour,
  startMinute: r.start_minute,
  endHour: r.end_hour,
  endMinute: r.end_minute,
  daysOfWeek: JSON.parse(r.days_of_week) as number[],
  sortOrder: r.sort_order,
})

export const createTimePhase = (
  db: Db,
  input: Omit<TimePhase, 'id'>,
): TimePhase => {
  const id = randomUUID()
  db.prepare(
    `INSERT INTO time_phases
     (id, group_id, name, start_hour, start_minute, end_hour, end_minute, days_of_week, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.groupId,
    input.name,
    input.startHour,
    input.startMinute,
    input.endHour,
    input.endMinute,
    JSON.stringify(input.daysOfWeek),
    input.sortOrder,
  )
  return { id, ...input }
}

export const listTimePhases = (db: Db, groupId: string): TimePhase[] => {
  const rows = db
    .prepare(
      `SELECT id, group_id, name, start_hour, start_minute, end_hour, end_minute, days_of_week, sort_order
       FROM time_phases WHERE group_id = ? ORDER BY sort_order ASC, start_hour ASC`,
    )
    .all(groupId) as Row[]
  return rows.map(fromRow)
}

export const getTimePhaseById = (db: Db, id: string): TimePhase | null => {
  const row = db
    .prepare(
      `SELECT id, group_id, name, start_hour, start_minute, end_hour, end_minute, days_of_week, sort_order
       FROM time_phases WHERE id = ?`,
    )
    .get(id) as Row | undefined
  return row ? fromRow(row) : null
}

export const deleteTimePhase = (db: Db, id: string): void => {
  db.prepare('DELETE FROM time_phases WHERE id = ?').run(id)
}

export const isPhaseActiveAt = (phase: TimePhase, at: Date): boolean => {
  if (!phase.daysOfWeek.includes(at.getDay())) return false
  const nowMins = at.getHours() * 60 + at.getMinutes()
  const startMins = phase.startHour * 60 + phase.startMinute
  const endMins = phase.endHour * 60 + phase.endMinute
  return nowMins >= startMins && nowMins < endMins
}

export const getActivePhases = (
  db: Db,
  groupId: string,
  at: Date,
): TimePhase[] =>
  listTimePhases(db, groupId).filter((p) => isPhaseActiveAt(p, at))
