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
 * For now, this simply creates a task if there's no incomplete one.
 * TODO: Implement day-of-week and interval checking logic.
 */
export async function processSchedules(pb: PocketBase): Promise<void> {
  const schedules = await pb.collection('schedules').getFullList<Schedule>({
    filter: 'active = true',
  })

  for (const schedule of schedules) {
    // Check if there's already an incomplete task for this schedule
    const existingTasks = await pb.collection('tasks').getFullList({
      filter: `schedule = "${schedule.id}" && completed = false`,
    })

    if (existingTasks.length > 0) {
      // Already has an incomplete task, skip
      continue
    }

    // Get user's time period settings
    const settings = await getSettingsForSchedule(pb, schedule.child)

    // Calculate when this task should become visible
    const now = new Date()
    const visibleFrom = calculateVisibleFrom(now, schedule.timePeriod, settings)

    await pb.collection('tasks').create({
      title: schedule.title,
      child: schedule.child,
      priority: schedule.priority,
      completed: false,
      schedule: schedule.id,
      generatedAt: new Date().toISOString(),
      visibleFrom: visibleFrom.toISOString(),
    })
  }
}
