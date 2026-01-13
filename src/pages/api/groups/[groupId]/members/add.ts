import type { APIRoute } from 'astro'
import { isUserInGroup, addUserToGroup } from '@/lib/groups'

export const POST: APIRoute = async ({ params, request, redirect, locals }) => {
  const { pb, user } = locals
  const { groupId } = params

  if (!user || !groupId) {
    return redirect('/login')
  }

  // Group membership is enforced by PocketBase collection rules

  const formData = await request.formData()
  const email = formData.get('email')?.toString()?.trim()?.toLowerCase()

  if (!email) {
    return redirect(`/g/${groupId}/members?error=` + encodeURIComponent('Bitte gib eine E-Mail-Adresse ein'))
  }

  try {
    // Find user by email
    const usersResult = await pb.collection('users').getList(1, 1, {
      filter: `email = "${email}"`,
    })

    if (usersResult.items.length === 0) {
      return redirect(`/g/${groupId}/members?error=` + encodeURIComponent('Benutzer mit dieser E-Mail-Adresse nicht gefunden'))
    }

    const targetUser = usersResult.items[0]

    // Check if user is already in group
    const alreadyMember = await isUserInGroup(pb, targetUser.id, groupId)
    if (alreadyMember) {
      return redirect(`/g/${groupId}/members?error=` + encodeURIComponent('Dieser Benutzer ist bereits Mitglied dieser Gruppe'))
    }

    // Add user to group
    await addUserToGroup(pb, targetUser.id, groupId)

    return redirect(`/g/${groupId}/members?success=` + encodeURIComponent(`${email} hinzugefügt`))
  } catch (error) {
    console.error('Failed to add member:', error)
    return redirect(`/g/${groupId}/members?error=` + encodeURIComponent('Fehler beim Hinzufügen'))
  }
}
