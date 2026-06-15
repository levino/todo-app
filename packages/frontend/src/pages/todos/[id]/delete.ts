import type { APIRoute } from 'astro'
import { ensureTodosTable } from '@/lib/todos'

export const POST: APIRoute = async ({ params, redirect, locals }) => {
  const { id } = params
  const { db } = locals

  if (!id) {
    return redirect('/?error=missing-id')
  }

  try {
    ensureTodosTable(db)
    db.prepare('DELETE FROM todos WHERE id = ?').run(id)
  } catch {
    return redirect('/?error=delete-failed')
  }

  return redirect('/')
}
