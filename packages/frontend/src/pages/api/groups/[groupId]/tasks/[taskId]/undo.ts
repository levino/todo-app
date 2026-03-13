import type { APIRoute } from 'astro'

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

  const redirectUrl = `/group/${groupId}/tasks/${childId}`

  try {
    const task = await pb.collection('tasks').getOne(taskId)
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().replace('T', ' ')

    // Check if task was completed today
    const completedToday = task.completed && task.completedAt && task.completedAt >= todayStart
    const recurringCompletedToday = !task.completed && task.lastCompletedAt && task.lastCompletedAt >= todayStart && task.recurrenceType

    if (!completedToday && !recurringCompletedToday) {
      return new Response('Task was not completed today', { status: 400 })
    }

    if (task.recurrenceType && recurringCompletedToday) {
      // Recurring task: restore previous due date
      await pb.collection('tasks').update(taskId, {
        dueDate: task.previousDueDate || task.dueDate,
        lastCompletedAt: null,
        previousDueDate: null,
      })
    } else {
      // Non-recurring task: mark as not completed
      await pb.collection('tasks').update(taskId, {
        completed: false,
        completedAt: null,
        completedBy: '',
        lastCompletedAt: null,
        previousDueDate: null,
      })
    }
  } catch {
    return Response.redirect(new URL(`${redirectUrl}?error=undo-failed`, request.url), 303)
  }

  return Response.redirect(new URL(redirectUrl, request.url), 303)
}
