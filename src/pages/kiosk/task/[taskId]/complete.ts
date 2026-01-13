import type { APIRoute } from 'astro'
import { getPocketBase } from '@/lib/pocketbase'

export const POST: APIRoute = async ({ params, request }) => {
  const { taskId } = params

  if (!taskId) {
    return new Response('Missing task ID', { status: 400 })
  }

  // Get the childId from the form data for redirect
  const formData = await request.formData()
  const childId = formData.get('childId') as string

  if (!childId) {
    return new Response('Missing child ID', { status: 400 })
  }

  try {
    const pb = getPocketBase()

    // Mark task as completed with timestamp
    await pb.collection('kiosk_tasks').update(taskId, {
      completed: true,
      completedAt: new Date().toISOString(),
    })
  } catch {
    // Redirect back with error
    return Response.redirect(new URL(`/kiosk/${childId}?error=complete-failed`, request.url), 303)
  }

  // Redirect back to kiosk page (Post-Redirect-Get pattern)
  return Response.redirect(new URL(`/kiosk/${childId}`, request.url), 303)
}
