import PocketBase from 'pocketbase'

type TimePeriod = 'morning' | 'afternoon' | 'evening'

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

    // TODO: Check cron or intervalDays to see if a task should be created
    // For now, just create a task if none exists

    await pb.collection('tasks').create({
      title: schedule.title,
      child: schedule.child,
      priority: schedule.priority,
      completed: false,
      schedule: schedule.id,
      generatedAt: new Date().toISOString(),
    })
  }
}
