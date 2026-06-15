import type { APIRoute } from 'astro'
import { undoTask } from '@/lib/tasks'

export const POST: APIRoute = async ({ params, request, locals }) => {
  const { groupId, taskId } = params
  const { db, user } = locals

  if (!user || !groupId || !taskId) {
    return new Response('Unauthorized', { status: 401 })
  }

  const formData = await request.formData()
  const childId = formData.get('childId') as string

  if (!childId) {
    return new Response('Missing child ID', { status: 400 })
  }

  const redirectUrl = `/group/${groupId}/tasks/${childId}`

  const result = await undoTask(db, taskId)
  if (result.error) {
    if (result.error === 'not-completed-today') {
      return new Response('Task was not completed today', { status: 400 })
    }
    return Response.redirect(new URL(`${redirectUrl}?error=undo-failed`, request.url), 303)
  }

  return Response.redirect(new URL(redirectUrl, request.url), 303)
}
