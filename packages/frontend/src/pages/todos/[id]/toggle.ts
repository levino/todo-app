import type { APIRoute } from 'astro'

export const POST: APIRoute = async ({ params, redirect, locals }) => {
  const { id } = params
  const { pb } = locals

  if (!id) {
    return redirect('/?error=missing-id')
  }

  try {
    const todo = await pb.collection('todos').getOne(id)
    await pb.collection('todos').update(id, {
      completed: !todo.completed,
    })
  } catch {
    return redirect('/?error=toggle-failed')
  }

  return redirect('/')
}
