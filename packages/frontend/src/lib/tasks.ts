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

export const phaseLabels: Record<string, string> = {
  morning: 'Morgens',
  afternoon: 'Nachmittags',
  evening: 'Abends',
}

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
  const currentPhase = getCurrentPhase(group.morningEnd, group.eveningStart, timezone)
  if (task.timeOfDay !== currentPhase) {
    return { error: 'wrong-phase' }
  }

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

export const sortTasks = (tasks: Task[], timezone?: string, now?: Date): Task[] => {
  const tz = timezone || 'Europe/Berlin'
  const todayStr = getLocalDateString(tz, now || new Date())
  return tasks.sort((a, b) => {
    const overdueA = a.dueDate && a.dueDate.slice(0, 10) < todayStr ? 1 : 0
    const overdueB = b.dueDate && b.dueDate.slice(0, 10) < todayStr ? 1 : 0
    if (overdueA !== overdueB) return overdueB - overdueA

    const priorityA = (a.priority === null || a.priority === undefined || a.priority === 0) ? Infinity : a.priority
    const priorityB = (b.priority === null || b.priority === undefined || b.priority === 0) ? Infinity : b.priority
    return priorityA - priorityB
  })
}
