import type { APIRoute } from 'astro'

function getCurrentPhase(morningEnd: string, eveningStart: string): string {
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  const [morningEndHour, morningEndMin] = (morningEnd || '09:00').split(':').map(Number)
  const morningEndMinutes = morningEndHour * 60 + morningEndMin

  const [eveningStartHour, eveningStartMin] = (eveningStart || '18:00').split(':').map(Number)
  const eveningStartMinutes = eveningStartHour * 60 + eveningStartMin

  if (currentMinutes < morningEndMinutes) return 'morning'
  if (currentMinutes < eveningStartMinutes) return 'afternoon'
  return 'evening'
}

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
  const completedBy = formData.get('completedBy') as string || childId
  const redirectTo = formData.get('redirectTo') as string

  if (!childId) {
    return new Response('Missing child ID', { status: 400 })
  }

  const redirectUrl = redirectTo || `/group/${groupId}/tasks/${childId}`

  try {
    const now = new Date()
    const task = await pb.collection('tasks').getOne(taskId)

    if (task.completed) {
      return Response.redirect(
        new URL(`/group/${groupId}/tasks/${childId}?error=already-completed`, request.url),
        303,
      )
    }

    const group = await pb.collection('groups').getOne(groupId)
    const currentPhase = getCurrentPhase(group.morningEnd, group.eveningStart)
    if (task.timeOfDay !== currentPhase) {
      return Response.redirect(
        new URL(`/group/${groupId}/tasks/${childId}?error=wrong-phase`, request.url),
        303,
      )
    }

    if (task.dueDate) {
      const dueDateStr = task.dueDate.slice(0, 10)
      const todayStr = now.toISOString().slice(0, 10)
      if (dueDateStr > todayStr) {
        return Response.redirect(
          new URL(`/group/${groupId}/tasks/${childId}?error=not-yet-due`, request.url),
          303,
        )
      }
    }

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
        completedBy: '',
        lastCompletedAt: now.toISOString(),
        dueDate: nextDueDate,
        previousDueDate: task.dueDate || null,
      })
    } else {
      // One-time task: mark as completed
      await pb.collection('tasks').update(taskId, {
        completed: true,
        completedAt: now.toISOString(),
        completedBy,
        lastCompletedAt: now.toISOString(),
        previousDueDate: task.dueDate || null,
      })
    }
  } catch {
    return Response.redirect(new URL(`${redirectUrl}?error=complete-failed`, request.url), 303)
  }

  return Response.redirect(new URL(redirectUrl, request.url), 303)
}
