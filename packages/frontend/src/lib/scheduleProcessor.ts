import PocketBase from 'pocketbase'
import {
  type TimePeriod,
  type UserTimePeriodSettings,
  DEFAULT_TIME_PERIODS,
  calculateVisibleFrom,
} from './timePeriods'

interface Schedule {
  id: string
  title: string
  child: string
  priority: number | null
  timePeriod: TimePeriod
  daysOfWeek: string[] | null
  intervalDays: number | null
  active: boolean
  lastGenerated: string | null
}

interface Child {
  id: string
  group: string
}

interface UserGroup {
  id: string
  user: string
  group: string
}

interface User {
  id: string
  morningStart?: string
  afternoonStart?: string
  eveningStart?: string
}

interface Task {
  id: string
  schedule: string
  completed: boolean
  completedAt?: string
}

/**
 * Map day names to JavaScript Date.getDay() values (0=Sunday, 1=Monday, etc.)
 */
const DAY_NAME_TO_NUMBER: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
}

/**
 * Check if today matches the daysOfWeek array.
 * Returns true if daysOfWeek is null/empty (no day restriction).
 */
function isTodayInDaysOfWeek(daysOfWeek: string[] | null, now: Date): boolean {
  if (!daysOfWeek || daysOfWeek.length === 0) {
    return true // No restriction
  }

  const todayNumber = now.getDay()
  return daysOfWeek.some((day) => DAY_NAME_TO_NUMBER[day.toLowerCase()] === todayNumber)
}

/**
 * Check if enough days have passed since the last completed task.
 * Returns true if intervalDays is null (no interval restriction).
 */
async function hasIntervalPassed(
  pb: PocketBase,
  scheduleId: string,
  intervalDays: number | null,
  now: Date
): Promise<boolean> {
  if (intervalDays === null) {
    return true // No interval restriction
  }

  // Find the most recently completed task for this schedule
  const completedTasks = await pb.collection('tasks').getList<Task>(1, 1, {
    filter: `schedule = "${scheduleId}" && completed = true`,
    sort: '-completedAt',
  })

  if (completedTasks.items.length === 0) {
    return true // No previous completed task, so we can create one
  }

  const lastCompletedAt = new Date(completedTasks.items[0].completedAt || '')
  if (Number.isNaN(lastCompletedAt.getTime())) {
    return true // Invalid date, assume we can create
  }

  // Calculate days passed since last completion
  const daysPassed = Math.floor(
    (now.getTime() - lastCompletedAt.getTime()) / (1000 * 60 * 60 * 24)
  )

  return daysPassed >= intervalDays
}

/**
 * Get time period settings for a schedule by looking up the user who owns the child's group.
 */
async function getSettingsForSchedule(
  pb: PocketBase,
  childId: string
): Promise<UserTimePeriodSettings> {
  try {
    // Get the child to find their group
    const child = await pb.collection('children').getOne<Child>(childId)

    // Find a user who belongs to this group
    const userGroups = await pb.collection('user_groups').getFullList<UserGroup>({
      filter: `group = "${child.group}"`,
      limit: 1,
    })

    if (userGroups.length === 0) {
      return { ...DEFAULT_TIME_PERIODS }
    }

    // Get the user's settings
    const user = await pb.collection('users').getOne<User>(userGroups[0].user)

    return {
      morningStart: user.morningStart || DEFAULT_TIME_PERIODS.morningStart,
      afternoonStart: user.afternoonStart || DEFAULT_TIME_PERIODS.afternoonStart,
      eveningStart: user.eveningStart || DEFAULT_TIME_PERIODS.eveningStart,
    }
  } catch {
    return { ...DEFAULT_TIME_PERIODS }
  }
}

/**
 * Process all active schedules and generate tasks as needed.
 *
 * Checks:
 * 1. No incomplete task already exists for this schedule
 * 2. Today matches daysOfWeek (if specified)
 * 3. Interval has passed since last completion (if intervalDays specified)
 */
export async function processSchedules(pb: PocketBase): Promise<void> {
  const schedules = await pb.collection('schedules').getFullList<Schedule>({
    filter: 'active = true',
  })

  const now = new Date()

  for (const schedule of schedules) {
    // Check if there's already an incomplete task for this schedule
    const existingTasks = await pb.collection('tasks').getFullList({
      filter: `schedule = "${schedule.id}" && completed = false`,
    })

    if (existingTasks.length > 0) {
      // Already has an incomplete task, skip
      continue
    }

    // Check if today matches daysOfWeek
    if (!isTodayInDaysOfWeek(schedule.daysOfWeek, now)) {
      continue
    }

    // Check if enough days have passed since last completion
    if (!(await hasIntervalPassed(pb, schedule.id, schedule.intervalDays, now))) {
      continue
    }

    // Get user's time period settings
    const settings = await getSettingsForSchedule(pb, schedule.child)

    // Calculate when this task should become visible
    const visibleFrom = calculateVisibleFrom(now, schedule.timePeriod, settings)

    await pb.collection('tasks').create({
      title: schedule.title,
      child: schedule.child,
      priority: schedule.priority,
      completed: false,
      schedule: schedule.id,
      generatedAt: now.toISOString(),
      visibleFrom: visibleFrom.toISOString(),
    })
  }
}
