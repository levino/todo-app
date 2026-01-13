import type { APIRoute } from 'astro'

export const POST: APIRoute = async ({ params, request, redirect, locals }) => {
  const { pb, user } = locals
  const { groupId } = params

  if (!user || !groupId) {
    return redirect('/login')
  }

  // Group membership is enforced by PocketBase collection rules

  const formData = await request.formData()
  const name = formData.get('name')?.toString()?.trim()
  const color = formData.get('color')?.toString()?.trim()

  if (!name) {
    return redirect(`/g/${groupId}/children?error=` + encodeURIComponent('Bitte gib einen Namen ein'))
  }

  if (!color) {
    return redirect(`/g/${groupId}/children?error=` + encodeURIComponent('Bitte wähle eine Farbe'))
  }

  try {
    await pb.collection('children').create({
      name,
      color,
      group: groupId,
    })

    return redirect(`/g/${groupId}/children?success=` + encodeURIComponent(`${name} hinzugefügt`))
  } catch (error) {
    console.error('Failed to add child:', error)
    return redirect(`/g/${groupId}/children?error=` + encodeURIComponent('Fehler beim Hinzufügen'))
  }
}
