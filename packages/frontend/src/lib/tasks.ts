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
  task_recurrence_interval: number | null
  task_recurrence_days: string | null
  task_points: number
  task_is_chore: boolean
}

const parseRecurrenceDays = (raw: string | null | undefined): number[] | null => {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'number') : null
  } catch {
    return null
  }
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
  recurrenceInterval: row.task_recurrence_interval ?? null,
  recurrenceDays: parseRecurrenceDays(row.task_recurrence_days),
  timeOfDay: row.task_time_of_day,
  lastCompletedAt: row.task_last_completed_at || null,
  completedBy: null,
  points: row.task_points,
  isChore: !!row.task_is_chore,
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

    const isActive =
      !row.task_completed &&
      row.task_time_of_day === params.phase &&
      (!dueDateStr || dueDateStr <= params.todayDateStr)

    const isRecentlyCompleted =
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

const weekdayShort = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

export const formatRecurrence = (task: Pick<Task, 'recurrenceType' | 'recurrenceInterval' | 'recurrenceDays'>): string => {
  if (task.recurrenceType === 'interval' && task.recurrenceInterval) {
    if (task.recurrenceInterval === 1) return 'Täglich'
    return `Alle ${task.recurrenceInterval} Tage`
  }

  if (task.recurrenceType === 'weekly' && task.recurrenceDays && task.recurrenceDays.length > 0) {
    const days = [...task.recurrenceDays].sort((a, b) => a - b)
    const set = new Set(days)
    const isWeekend = days.length === 2 && set.has(0) && set.has(6)
    if (isWeekend) return 'Wöchentlich (Wochenende)'
    const isMonFri = days.length === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))
    if (isMonFri) return 'Wöchentlich (Mo–Fr)'
    // Sort with Monday first (1..6, 0=Sunday last) so the label reads naturally
    const orderedDays = days.slice().sort((a, b) => {
      const aKey = a === 0 ? 7 : a
      const bKey = b === 0 ? 7 : b
      return aKey - bKey
    })
    return `Wöchentlich (${orderedDays.map((d) => weekdayShort[d]).join(', ')})`
  }

  return ''
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

export const completeTask = async (
  pb: import('pocketbase').default,
  taskId: string,
  childId: string,
  completedBy: string,
  groupId: string,
): Promise<{ error?: string }> => {
  const now = new Date()
  const task = await pb.collection('tasks').getOne(taskId)

  if (task.completed) {
    return { error: 'already-completed' }
  }

  const group = await pb.collection('groups').getOne(groupId)
  const timezone = group.timezone || 'Europe/Berlin'

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

  if (nextDueDate) {
    await pb.collection('tasks').update(taskId, {
      completed: false,
      completedAt: null,
      completedBy: '',
      lastCompletedAt: now.toISOString(),
      dueDate: nextDueDate,
      previousDueDate: task.dueDate || null,
    })
  } else {
    await pb.collection('tasks').update(taskId, {
      completed: true,
      completedAt: now.toISOString(),
      completedBy,
      lastCompletedAt: now.toISOString(),
      previousDueDate: task.dueDate || null,
    })
  }

  return {}
}

export const undoTask = async (
  pb: import('pocketbase').default,
  taskId: string,
  timezone?: string,
): Promise<{ error?: string }> => {
  const task = await pb.collection('tasks').getOne(taskId)
  const now = new Date()
  const tz = timezone || 'Europe/Berlin'
  const todayStr = getLocalDateString(tz, now)
  const todayStart = todayStr + ' 00:00:00.000Z'

  const completedToday = task.completed && task.completedAt && task.completedAt >= todayStart
  const recurringCompletedToday = !task.completed && task.lastCompletedAt && task.lastCompletedAt >= todayStart && task.recurrenceType

  if (!completedToday && !recurringCompletedToday) {
    return { error: 'not-completed-today' }
  }

  if (task.recurrenceType && recurringCompletedToday) {
    await pb.collection('tasks').update(taskId, {
      dueDate: task.previousDueDate || task.dueDate,
      lastCompletedAt: null,
      previousDueDate: null,
    })
  } else {
    await pb.collection('tasks').update(taskId, {
      completed: false,
      completedAt: null,
      completedBy: '',
      lastCompletedAt: null,
      previousDueDate: null,
    })
  }

  return {}
}

export const deleteTask = async (
  pb: import('pocketbase').default,
  taskId: string,
  timezone?: string,
): Promise<{ error?: string }> => {
  try {
    const task = await pb.collection('tasks').getOne(taskId)

    if (task.recurrenceType && task.dueDate) {
      const baseDate = new Date(task.dueDate.slice(0, 10) + 'T00:00:00Z')
      const nextDueDate = calculateNextDueDate(
        task.recurrenceType,
        task.recurrenceInterval,
        task.recurrenceDays,
        baseDate,
        timezone,
      )
      if (nextDueDate) {
        await pb.collection('tasks').update(taskId, { dueDate: nextDueDate })
        return {}
      }
    }

    await pb.collection('tasks').delete(taskId)
    return {}
  } catch {
    return { error: 'not-found' }
  }
}

export const sortTasks = (tasks: Task[], timezone?: string, now?: Date): Task[] => {
  const tz = timezone || 'Europe/Berlin'
  const todayStr = getLocalDateString(tz, now || new Date())
  return tasks.sort((a, b) => {
    const overdueA = !a.isChore && a.dueDate && a.dueDate.slice(0, 10) < todayStr ? 1 : 0
    const overdueB = !b.isChore && b.dueDate && b.dueDate.slice(0, 10) < todayStr ? 1 : 0
    if (overdueA !== overdueB) return overdueB - overdueA

    const priorityA = (a.priority === null || a.priority === undefined || a.priority === 0) ? Infinity : a.priority
    const priorityB = (b.priority === null || b.priority === undefined || b.priority === 0) ? Infinity : b.priority
    return priorityA - priorityB
  })
}
