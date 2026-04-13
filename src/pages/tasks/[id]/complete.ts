import type { APIRoute } from 'astro'
import { getChildById } from '../../../domain/children.ts'
import { isUserInGroup } from '../../../domain/groups.ts'
import { completeTask, getTaskById } from '../../../domain/tasks.ts'

export const POST: APIRoute = ({ params, locals, redirect }) => {
  const { db, user } = locals
  if (!user) return redirect('/login')

  const id = params.id
  if (!id) return new Response('Task id missing', { status: 400 })

  const task = getTaskById(db, id)
  if (!task) return new Response('Task not found', { status: 404 })

  const child = getChildById(db, task.childId)
  if (!child) return new Response('Child not found', { status: 404 })

  if (!isUserInGroup(db, user.sub, child.groupId)) {
    return new Response('Forbidden', { status: 403 })
  }

  completeTask(db, id)
  return redirect('/')
}
