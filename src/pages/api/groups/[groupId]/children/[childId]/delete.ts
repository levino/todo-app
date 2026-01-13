import type { APIRoute } from 'astro'

export const POST: APIRoute = async ({ params, redirect, locals }) => {
  const { pb, user } = locals
  const { groupId, childId } = params

  if (!user || !groupId || !childId) {
    return redirect('/login')
  }

  // Group membership is enforced by PocketBase collection rules

  try {
    // First delete all tasks for this child
    const tasks = await pb.collection('kiosk_tasks').getList(1, 1000, {
      filter: `child = "${childId}"`,
    })

    for (const task of tasks.items) {
      await pb.collection('kiosk_tasks').delete(task.id)
    }

    // Then delete the child
    await pb.collection('children').delete(childId)

    return redirect(`/g/${groupId}/children?success=` + encodeURIComponent('Kind gelöscht'))
  } catch (error) {
    console.error('Failed to delete child:', error)
    return redirect(`/g/${groupId}/children?error=` + encodeURIComponent('Fehler beim Löschen'))
  }
}
