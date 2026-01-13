import type { APIRoute } from 'astro'
import { isUserInGroup, removeUserFromGroup } from '@/lib/groups'

export const POST: APIRoute = async ({ params, redirect, locals }) => {
  const { pb, user } = locals
  const { groupId, userId } = params

  if (!user || !groupId || !userId) {
    return redirect('/login')
  }

  // Verify current user is member of group
  const isMember = await isUserInGroup(pb, user.id, groupId)
  if (!isMember) {
    return redirect('/settings/groups?error=' + encodeURIComponent('Keine Berechtigung'))
  }

  // Cannot remove yourself (use leave instead)
  if (userId === user.id) {
    return redirect(`/g/${groupId}/members?error=` + encodeURIComponent('Nutze "Verlassen" um dich selbst zu entfernen'))
  }

  try {
    await removeUserFromGroup(pb, userId, groupId)
    return redirect(`/g/${groupId}/members?success=` + encodeURIComponent('Benutzer entfernt'))
  } catch (error) {
    console.error('Failed to remove member:', error)
    return redirect(`/g/${groupId}/members?error=` + encodeURIComponent('Fehler beim Entfernen'))
  }
}
