import { ActionError, defineAction } from 'astro:actions'
import { z } from 'astro/zod'
import { getGroup } from '@family-todo/db'
import {
  completeTask as completeTaskLib,
  deferTask as deferTaskLib,
  deleteTask as deleteTaskLib,
  undoTask as undoTaskLib,
} from '@/lib/tasks'

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
      const { db, user } = context.locals
      if (!user) {
        throw new ActionError({ code: 'UNAUTHORIZED', message: 'Nicht angemeldet.' })
      }

      const result = await completeTaskLib(db, input.taskId, input.childId, input.completedBy, input.groupId)

      if (result.error) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: errorLabels[result.error] || 'Fehler beim Abschließen der Aufgabe.',
        })
      }

      return { success: true }
    },
  })

export const deferTask = defineAction({
    accept: 'form',
    input: z.object({
      taskId: z.string().min(1),
      groupId: z.string().min(1),
    }),
    handler: async (input, context) => {
      const { db, user } = context.locals
      if (!user) {
        throw new ActionError({ code: 'UNAUTHORIZED', message: 'Nicht angemeldet.' })
      }

      const group = getGroup(db, input.groupId)
      const result = await deferTaskLib(db, input.taskId, group?.timezone)

      if (result.error) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: errorLabels[result.error] || 'Fehler beim Verschieben der Aufgabe.',
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
      const { db, user } = context.locals
      if (!user) {
        throw new ActionError({ code: 'UNAUTHORIZED', message: 'Nicht angemeldet.' })
      }

      const result = await undoTaskLib(db, input.taskId)

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
      const { db, user } = context.locals
      if (!user) {
        throw new ActionError({ code: 'UNAUTHORIZED', message: 'Nicht angemeldet.' })
      }

      const result = await deleteTaskLib(db, input.taskId)

      if (result.error) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: errorLabels[result.error] || 'Fehler beim Löschen.',
        })
      }

      return { success: true }
    },
  })

export const server = {
  completeTask,
  deferTask,
  undoTask,
  deleteTask,
}
