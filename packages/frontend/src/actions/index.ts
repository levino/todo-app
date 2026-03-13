import { ActionError, defineAction } from 'astro:actions'
import { z } from 'astro/zod'
import { completeTask, undoTask } from '@/lib/tasks'

const errorLabels: Record<string, string> = {
  'wrong-phase': 'Diese Aufgabe ist gerade nicht dran.',
  'not-yet-due': 'Diese Aufgabe ist noch nicht fällig.',
  'already-completed': 'Diese Aufgabe wurde bereits erledigt.',
  'not-completed-today': 'Diese Aufgabe wurde nicht heute erledigt.',
}

export const server = {
  completeTask: defineAction({
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
  }),
  undoTask: defineAction({
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
  }),
}
