/**
 * Time Period Utilities
 *
 * Handles user-configurable time periods (morning, afternoon, evening).
 * Each user can customize when their time periods start.
 *
 * Defaults:
 * - Morning: 06:00 - 12:00
 * - Afternoon: 12:00 - 18:00
 * - Evening: 18:00 - 00:00 (midnight)
 */

export type TimePeriod = 'morning' | 'afternoon' | 'evening'

export interface UserTimePeriodSettings {
  morningStart: string  // HH:MM format, e.g., "06:00"
  afternoonStart: string
  eveningStart: string
}

export const DEFAULT_TIME_PERIODS: UserTimePeriodSettings = {
  morningStart: '06:00',
  afternoonStart: '12:00',
  eveningStart: '18:00',
}

/**
 * Parse a time string (HH:MM) into hours and minutes.
 */
export function parseTime(time: string): { hours: number; minutes: number } {
  const [hours, minutes] = time.split(':').map(Number)
  return { hours, minutes }
}

/**
 * Get the start time for a time period given user settings.
 */
export function getTimePeriodStart(
  period: TimePeriod,
  settings: UserTimePeriodSettings = DEFAULT_TIME_PERIODS
): string {
  switch (period) {
    case 'morning':
      return settings.morningStart
    case 'afternoon':
      return settings.afternoonStart
    case 'evening':
      return settings.eveningStart
  }
}

/**
 * Get the end time for a time period given user settings.
 * Note: evening ends at midnight (00:00 next day).
 */
export function getTimePeriodEnd(
  period: TimePeriod,
  settings: UserTimePeriodSettings = DEFAULT_TIME_PERIODS
): string {
  switch (period) {
    case 'morning':
      return settings.afternoonStart
    case 'afternoon':
      return settings.eveningStart
    case 'evening':
      return '00:00' // Midnight
  }
}

/**
 * Check if a given time falls within a time period.
 */
export function isTimeInPeriod(
  time: Date,
  period: TimePeriod,
  settings: UserTimePeriodSettings = DEFAULT_TIME_PERIODS
): boolean {
  const { hours, minutes } = { hours: time.getHours(), minutes: time.getMinutes() }
  const currentMinutes = hours * 60 + minutes

  const startStr = getTimePeriodStart(period, settings)
  const endStr = getTimePeriodEnd(period, settings)

  const start = parseTime(startStr)
  const end = parseTime(endStr)

  const startMinutes = start.hours * 60 + start.minutes
  let endMinutes = end.hours * 60 + end.minutes

  // Handle midnight wraparound for evening
  if (endMinutes === 0) {
    endMinutes = 24 * 60 // 24:00 = end of day
  }

  return currentMinutes >= startMinutes && currentMinutes < endMinutes
}

/**
 * Get the current time period for a given time.
 */
export function getCurrentTimePeriod(
  time: Date,
  settings: UserTimePeriodSettings = DEFAULT_TIME_PERIODS
): TimePeriod {
  if (isTimeInPeriod(time, 'morning', settings)) return 'morning'
  if (isTimeInPeriod(time, 'afternoon', settings)) return 'afternoon'
  if (isTimeInPeriod(time, 'evening', settings)) return 'evening'

  // Before morning starts, it's still considered "evening" (after midnight)
  return 'evening'
}

/**
 * Get the start datetime for a time period on a specific date.
 */
export function getTimePeriodStartDateTime(
  date: Date,
  period: TimePeriod,
  settings: UserTimePeriodSettings = DEFAULT_TIME_PERIODS
): Date {
  const startTime = getTimePeriodStart(period, settings)
  const { hours, minutes } = parseTime(startTime)

  const result = new Date(date)
  result.setHours(hours, minutes, 0, 0)
  return result
}

/**
 * Load user's time period settings from PocketBase.
 * Returns defaults if user not found or has no custom settings.
 */
export async function getUserTimePeriodSettings(
  pb: { collection: (name: string) => { getOne: (id: string) => Promise<UserRecord> } },
  userId: string
): Promise<UserTimePeriodSettings> {
  try {
    const user = await pb.collection('users').getOne(userId)

    return {
      morningStart: user.morningStart || DEFAULT_TIME_PERIODS.morningStart,
      afternoonStart: user.afternoonStart || DEFAULT_TIME_PERIODS.afternoonStart,
      eveningStart: user.eveningStart || DEFAULT_TIME_PERIODS.eveningStart,
    }
  } catch {
    // User not found, return defaults
    return { ...DEFAULT_TIME_PERIODS }
  }
}

interface UserRecord {
  id: string
  morningStart?: string
  afternoonStart?: string
  eveningStart?: string
}
