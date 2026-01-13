import type { APIRoute } from 'astro'
import { addUserToGroup } from '@/lib/groups'

export const POST: APIRoute = async ({ request, redirect, locals }) => {
  const { pb, user } = locals

  if (!user) {
    return redirect('/login')
  }

  const formData = await request.formData()
  const name = formData.get('name')?.toString()?.trim()

  if (!name) {
    return redirect('/settings/groups?error=' + encodeURIComponent('Bitte gib einen Namen ein'))
  }

  try {
    // Create the group
    const group = await pb.collection('groups').create({ name })

    // Add the current user to the group
    await addUserToGroup(pb, user.id, group.id)

    return redirect('/settings/groups?success=' + encodeURIComponent(`Gruppe "${name}" erstellt`))
  } catch (error) {
    console.error('Failed to create group:', error)
    return redirect('/settings/groups?error=' + encodeURIComponent('Fehler beim Erstellen der Gruppe'))
  }
}
