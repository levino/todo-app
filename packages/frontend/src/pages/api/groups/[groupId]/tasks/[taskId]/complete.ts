import type { APIRoute } from 'astro'

export const POST: APIRoute = async ({ params, request, locals }) => {
  const { groupId, taskId } = params
  const { pb, user } = locals

  if (!user || !groupId || !taskId) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Get the childId from the form data for redirect
  const formData = await request.formData()
  const childId = formData.get('childId') as string

  if (!childId) {
    return new Response('Missing child ID', { status: 400 })
  }

  // Group membership is enforced by PocketBase collection rules

  try {
    // Mark task as completed with timestamp
    await pb.collection('kiosk_tasks').update(taskId, {
      completed: true,
      completedAt: new Date().toISOString(),
    })
  } catch {
    // Redirect back with error
    return Response.redirect(new URL(`/group/${groupId}/tasks/${childId}?error=complete-failed`, request.url), 303)
  }

  // Redirect back to tasks page (Post-Redirect-Get pattern)
  return Response.redirect(new URL(`/group/${groupId}/tasks/${childId}`, request.url), 303)
}
