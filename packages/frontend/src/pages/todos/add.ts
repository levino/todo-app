import type { APIRoute } from 'astro'

export const POST: APIRoute = async ({ request, redirect, locals }) => {
  const formData = await request.formData()
  const title = formData.get('title')

  if (!title || typeof title !== 'string') {
    return redirect('/?error=missing-title')
  }

  const { pb, user } = locals

  try {
    await pb.collection('todos').create({
      title,
      completed: false,
      user_id: user?.id,
    })
  } catch {
    return redirect('/?error=create-failed')
  }

  return redirect('/')
}
