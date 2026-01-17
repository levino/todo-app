/**
 * Recurring Tasks Utilities
 *
 * Functions for managing recurring tasks - daily and weekly task resets,
 * time period filtering, and day-of-week checking.
 */

import type PocketBase from 'pocketbase'

export type RecurrenceType = 'none' | 'daily' | 'weekly'
export type TimePeriod = 'morning' | 'afternoon' | 'evening' | ''

export interface KioskTask {
  id: string
  title: string
  child: string
  priority: number | null
  completed: boolean
  completedAt: string | null
  recurrence?: RecurrenceType
  daysOfWeek?: number[]
  timePeriod?: TimePeriod
}

/**
 * Time period boundaries (in hours, 24-hour format)
 */
export const TIME_PERIOD_HOURS = {
  morning: { start: 6, end: 12 },
  afternoon: { start: 12, end: 18 },
  evening: { start: 18, end: 22 },
} as const

/**
 * Get the current time period based on the hour of the day
 */
export function getCurrentTimePeriod(): TimePeriod {
  const hour = new Date().getHours()

  if (hour >= TIME_PERIOD_HOURS.morning.start && hour < TIME_PERIOD_HOURS.morning.end) {
    return 'morning'
  }
  if (hour >= TIME_PERIOD_HOURS.afternoon.start && hour < TIME_PERIOD_HOURS.afternoon.end) {
    return 'afternoon'
  }
  if (hour >= TIME_PERIOD_HOURS.evening.start && hour < TIME_PERIOD_HOURS.evening.end) {
    return 'evening'
  }

  // Outside defined periods (night time) - return empty (show all)
  return ''
}

/**
 * Get start of today (midnight) in ISO format
 */
export function getStartOfToday(): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today.toISOString()
}

/**
 * Check if a date is before today (for reset logic)
 */
export function isBeforeToday(dateString: string | null): boolean {
  if (!dateString) return false
  const date = new Date(dateString)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return date < today
}

/**
 * Check if a weekly task should be shown today
 */
export function isWeeklyTaskActiveToday(daysOfWeek: number[] | undefined): boolean {
  if (!daysOfWeek || daysOfWeek.length === 0) return true
  const today = new Date().getDay() // 0 = Sunday, 6 = Saturday
  return daysOfWeek.includes(today)
}

/**
 * Reset all daily tasks that were completed before today
 */
export async function resetDailyTasks(pb: PocketBase): Promise<number> {
  const startOfToday = getStartOfToday()

  // Find daily tasks completed before today
  const tasksToReset = await pb.collection('kiosk_tasks').getList<KioskTask>(1, 1000, {
    filter: `recurrence = "daily" && completed = true && completedAt < "${startOfToday}"`,
  })

  // Reset each task
  for (const task of tasksToReset.items) {
    await pb.collection('kiosk_tasks').update(task.id, {
      completed: false,
      completedAt: null,
    })
  }

  return tasksToReset.items.length
}

/**
 * Reset weekly tasks that were completed before today and are active today
 */
export async function resetWeeklyTasks(pb: PocketBase): Promise<number> {
  const startOfToday = getStartOfToday()
  const today = new Date().getDay()

  // Find weekly tasks completed before today
  const tasksToReset = await pb.collection('kiosk_tasks').getList<KioskTask>(1, 1000, {
    filter: `recurrence = "weekly" && completed = true && completedAt < "${startOfToday}"`,
  })

  let resetCount = 0

  // Reset each task if it's active today
  for (const task of tasksToReset.items) {
    // Check if task is scheduled for today
    if (isWeeklyTaskActiveToday(task.daysOfWeek)) {
      await pb.collection('kiosk_tasks').update(task.id, {
        completed: false,
        completedAt: null,
      })
      resetCount++
    }
  }

  return resetCount
}

/**
 * Reset all recurring tasks (both daily and weekly)
 */
export async function resetAllRecurringTasks(pb: PocketBase): Promise<{ daily: number; weekly: number }> {
  const daily = await resetDailyTasks(pb)
  const weekly = await resetWeeklyTasks(pb)
  return { daily, weekly }
}

/**
 * Filter tasks for the kiosk view based on time period and day of week
 */
export function filterTasksForKiosk(
  tasks: KioskTask[],
  options: { timePeriod?: TimePeriod; filterByCurrentTime?: boolean } = {}
): KioskTask[] {
  const { timePeriod, filterByCurrentTime = false } = options

  // Determine which time period to filter by
  const effectiveTimePeriod = filterByCurrentTime ? getCurrentTimePeriod() : timePeriod

  return tasks.filter((task) => {
    // Filter out weekly tasks not active today
    if (task.recurrence === 'weekly' && !isWeeklyTaskActiveToday(task.daysOfWeek)) {
      return false
    }

    // Filter by time period if specified
    if (effectiveTimePeriod && task.timePeriod && task.timePeriod !== effectiveTimePeriod) {
      return false
    }

    return true
  })
}

/**
 * Group tasks by time period for display
 */
export function groupTasksByTimePeriod(tasks: KioskTask[]): Record<TimePeriod | 'allDay', KioskTask[]> {
  const groups: Record<TimePeriod | 'allDay', KioskTask[]> = {
    morning: [],
    afternoon: [],
    evening: [],
    '': [], // Tasks without time period
    allDay: [], // Alias for empty string
  }

  for (const task of tasks) {
    const period = task.timePeriod || ''
    groups[period].push(task)
    if (!task.timePeriod) {
      groups.allDay.push(task)
    }
  }

  return groups
}

/**
 * Get display info for a time period
 */
export function getTimePeriodDisplay(period: TimePeriod): { label: string; emoji: string; labelDe: string } {
  switch (period) {
    case 'morning':
      return { label: 'Morning', emoji: '🌅', labelDe: 'Morgen' }
    case 'afternoon':
      return { label: 'Afternoon', emoji: '☀️', labelDe: 'Nachmittag' }
    case 'evening':
      return { label: 'Evening', emoji: '🌙', labelDe: 'Abend' }
    default:
      return { label: 'All Day', emoji: '📋', labelDe: 'Ganztägig' }
  }
}

/**
 * Get display name for a day of week (German)
 */
export function getDayOfWeekName(day: number, locale: 'en' | 'de' = 'de'): string {
  const names = {
    en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    de: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
  }
  return names[locale][day] || ''
}

/**
 * Get short display name for a day of week
 */
export function getDayOfWeekShort(day: number, locale: 'en' | 'de' = 'de'): string {
  const names = {
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    de: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
  }
  return names[locale][day] || ''
}
