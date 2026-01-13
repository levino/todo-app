import type { APIRoute } from 'astro'
import { removeUserFromGroup } from '@/lib/groups'

export const POST: APIRoute = async ({ params, redirect, locals }) => {
  const { pb, user } = locals
  const { groupId } = params

  if (!user || !groupId) {
    return redirect('/login')
  }

  try {
    await removeUserFromGroup(pb, user.id, groupId)
    return redirect('/settings/groups?success=' + encodeURIComponent('Gruppe verlassen'))
  } catch (error) {
    console.error('Failed to leave group:', error)
    return redirect(`/g/${groupId}/members?error=` + encodeURIComponent('Fehler beim Verlassen'))
  }
}
