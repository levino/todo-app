import type { APIRoute } from 'astro'

function calculateNextDueDate(
  recurrenceType: string | null,
  recurrenceInterval: number | null,
  recurrenceDays: number[] | null,
  completedAt: Date,
): string | null {
  if (recurrenceType === 'interval' && recurrenceInterval) {
    const next = new Date(completedAt)
    next.setDate(next.getDate() + recurrenceInterval)
    return next.toISOString()
  }

  if (recurrenceType === 'weekly' && recurrenceDays && recurrenceDays.length > 0) {
    const sorted = [...recurrenceDays].sort((a, b) => a - b)
    const currentDay = completedAt.getDay()

    const nextDay = sorted.find((d) => d > currentDay) ?? sorted[0]
    const daysUntil = nextDay > currentDay
      ? nextDay - currentDay
      : 7 - currentDay + nextDay

    const next = new Date(completedAt)
    next.setDate(next.getDate() + daysUntil)
    return next.toISOString()
  }

  return null
}

export const POST: APIRoute = async ({ params, request, locals }) => {
  const { groupId, taskId } = params
  const { pb, user } = locals

  if (!user || !groupId || !taskId) {
    return new Response('Unauthorized', { status: 401 })
  }

  const formData = await request.formData()
  const childId = formData.get('childId') as string

  if (!childId) {
    return new Response('Missing child ID', { status: 400 })
  }

  try {
    const now = new Date()
    const task = await pb.collection('tasks').getOne(taskId)

    const nextDueDate = calculateNextDueDate(
      task.recurrenceType,
      task.recurrenceInterval,
      task.recurrenceDays,
      now,
    )

    if (nextDueDate) {
      // Recurring task: reset and set next due date
      await pb.collection('tasks').update(taskId, {
        completed: false,
        completedAt: null,
        lastCompletedAt: now.toISOString(),
        dueDate: nextDueDate,
      })
    } else {
      // One-time task: mark as completed
      await pb.collection('tasks').update(taskId, {
        completed: true,
        completedAt: now.toISOString(),
        lastCompletedAt: now.toISOString(),
      })
    }
  } catch {
    return Response.redirect(new URL(`/group/${groupId}/tasks/${childId}?error=complete-failed`, request.url), 303)
  }

  return Response.redirect(new URL(`/group/${groupId}/tasks/${childId}`, request.url), 303)
}
