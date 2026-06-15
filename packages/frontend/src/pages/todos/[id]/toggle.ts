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
    const todo = db.prepare('SELECT completed FROM todos WHERE id = ?').get(id) as
      | { completed: number }
      | undefined
    if (!todo) throw new Error('not-found')
    db.prepare('UPDATE todos SET completed = ?, updated = ? WHERE id = ?').run(
      todo.completed ? 0 : 1,
      new Date().toISOString(),
      id,
    )
  } catch {
    return redirect('/?error=toggle-failed')
  }

  return redirect('/')
}
