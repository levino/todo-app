import type { APIRoute } from 'astro'
import { generateId } from '@family-todo/db'
import { ensureTodosTable } from '@/lib/todos'

export const POST: APIRoute = async ({ request, redirect, locals }) => {
  const formData = await request.formData()
  const title = formData.get('title')

  if (!title || typeof title !== 'string') {
    return redirect('/?error=missing-title')
  }

  const { db, user } = locals

  try {
    ensureTodosTable(db)
    const now = new Date().toISOString()
    db.prepare(
      'INSERT INTO todos (id, title, completed, user_id, created, updated) VALUES (?, ?, 0, ?, ?, ?)',
    ).run(generateId(), title, user?.id ?? null, now, now)
  } catch {
    return redirect('/?error=create-failed')
  }

  return redirect('/')
}
