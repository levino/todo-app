import type { APIRoute } from 'astro'

export const POST: APIRoute = async ({ params, redirect, locals }) => {
  const { id } = params
  const { pb } = locals

  if (!id) {
    return redirect('/?error=missing-id')
  }

  try {
    await pb.collection('todos').delete(id)
  } catch {
    return redirect('/?error=delete-failed')
  }

  return redirect('/')
}
