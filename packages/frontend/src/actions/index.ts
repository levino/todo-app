import { ActionError, defineAction } from 'astro:actions'
import { z } from 'astro/zod'
import { completeTask, deleteTask, undoTask } from '@/lib/tasks'

const errorLabels: Record<string, string> = {
  'not-yet-due': 'Diese Aufgabe ist noch nicht fällig.',
  'already-completed': 'Diese Aufgabe wurde bereits erledigt.',
  'not-completed-today': 'Diese Aufgabe wurde nicht heute erledigt.',
  'not-found': 'Diese Aufgabe existiert nicht mehr.',
}

export const completeTask = defineAction({
    accept: 'form',
    input: z.object({
      taskId: z.string().min(1),
      childId: z.string().min(1),
      completedBy: z.string().min(1),
      groupId: z.string().min(1),
    }),
    handler: async (input, context) => {
      const { pb, user } = context.locals
      if (!user) {
        throw new ActionError({ code: 'UNAUTHORIZED', message: 'Nicht angemeldet.' })
      }

      const result = await completeTask(pb, input.taskId, input.childId, input.completedBy, input.groupId)

      if (result.error) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: errorLabels[result.error] || 'Fehler beim Abschließen der Aufgabe.',
        })
      }

      return { success: true }
    },
  })

export const undoTask = defineAction({
    accept: 'form',
    input: z.object({
      taskId: z.string().min(1),
    }),
    handler: async (input, context) => {
      const { pb, user } = context.locals
      if (!user) {
        throw new ActionError({ code: 'UNAUTHORIZED', message: 'Nicht angemeldet.' })
      }

      const result = await undoTask(pb, input.taskId)

      if (result.error) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: errorLabels[result.error] || 'Fehler beim Rückgängigmachen.',
        })
      }

      return { success: true }
    },
  })

export const deleteTask = defineAction({
    accept: 'form',
    input: z.object({
      taskId: z.string().min(1),
    }),
    handler: async (input, context) => {
      const { pb, user } = context.locals
      if (!user) {
        throw new ActionError({ code: 'UNAUTHORIZED', message: 'Nicht angemeldet.' })
      }

      const result = await deleteTask(pb, input.taskId)

      if (result.error) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: errorLabels[result.error] || 'Fehler beim Löschen.',
        })
      }

      return { success: true }
    },
  })
