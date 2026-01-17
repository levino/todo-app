/**
 * Schedule Management Utilities
 *
 * Functions for managing task schedules - patterns that automatically
 * generate recurring tasks based on time periods and frequency.
 */

import type PocketBase from 'pocketbase'

export type RecurrenceType = 'daily' | 'weekly'
export type TimePeriod = 'morning' | 'afternoon' | 'evening' | ''

export interface TaskSchedule {
  id: string
  title: string
  child: string
  priority: number | null
  recurrence: RecurrenceType
  daysOfWeek: number[] | null
  timePeriod: TimePeriod
  active: boolean
  lastGenerated: string | null
}

export interface Task {
  id: string
  title: string
  child: string
  priority: number | null
  completed: boolean
  completedAt: string | null
  schedule?: string
  generatedAt?: string | null
  isFromSchedule: boolean
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
 * Check if a weekly schedule should be active today
 */
export function isScheduleActiveToday(schedule: TaskSchedule): boolean {
  if (schedule.recurrence === 'daily') {
    return true
  }
  
  if (schedule.recurrence === 'weekly') {
    if (!schedule.daysOfWeek || schedule.daysOfWeek.length === 0) {
      return true // No specific days means all days
    }
    const today = new Date().getDay() // 0 = Sunday, 6 = Saturday
    return schedule.daysOfWeek.includes(today)
  }
  
  return false
}

/**
 * Filter tasks for the kiosk view based on time period
 */
export function filterTasksForKiosk(
  tasks: Task[],
  options: { timePeriod?: TimePeriod; filterByCurrentTime?: boolean } = {}
): Task[] {
  const { timePeriod, filterByCurrentTime = false } = options

  // Determine which time period to filter by
  const effectiveTimePeriod = filterByCurrentTime ? getCurrentTimePeriod() : timePeriod

  return tasks.filter((task) => {
    // For tasks with schedules, check if the schedule would be active today
    if (task.schedule && task.isFromSchedule) {
      // We'd need to fetch the schedule to check, but for now assume it's valid
      // In practice, the backend should only generate tasks for active schedules
    }

    // Note: Time period filtering would need to be implemented based on how
    // schedules are designed to work with time periods in the new architecture
    
    return true
  })
}

/**
 * Group tasks by their source (schedule vs one-time)
 */
export function groupTasksBySource(tasks: Task[]): { fromSchedules: Task[]; oneTime: Task[] } {
  const fromSchedules: Task[] = []
  const oneTime: Task[] = []

  for (const task of tasks) {
    if (task.isFromSchedule) {
      fromSchedules.push(task)
    } else {
      oneTime.push(task)
    }
  }

  return { fromSchedules, oneTime }
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
 * Get display name for a day of week
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

/**
 * Get display text for a schedule's recurrence pattern
 */
export function getRecurrenceDisplay(schedule: TaskSchedule, locale: 'en' | 'de' = 'de'): string {
  if (schedule.recurrence === 'daily') {
    return locale === 'de' ? 'Täglich' : 'Daily'
  }
  
  if (schedule.recurrence === 'weekly') {
    if (!schedule.daysOfWeek || schedule.daysOfWeek.length === 0) {
      return locale === 'de' ? 'Wöchentlich' : 'Weekly'
    }
    
    if (schedule.daysOfWeek.length === 7) {
      return locale === 'de' ? 'Täglich' : 'Daily'
    }
    
    const dayNames = schedule.daysOfWeek
      .map(day => getDayOfWeekShort(day, locale))
      .join(', ')
    
    return locale === 'de' ? `Wöchentlich: ${dayNames}` : `Weekly: ${dayNames}`
  }
  
  return ''
}