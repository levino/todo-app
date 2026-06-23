/**
 * Family Todo MCP Server
 *
 * Standalone Express server that exposes MCP tools for managing
 * groups, children, and tasks. Parents use AI agents (Claude, ChatGPT)
 * to call these tools via JSON-RPC.
 *
 * Supports OAuth 2.0 authentication for Claude MCP integration.
 *
 * Data backend: @family-todo/db (shared SQLite, raw SQL). The previous
 * PocketBase backend has been removed; tool behaviour (names, schemas,
 * semantics) is preserved.
 */

import express from 'express'
import type { Response } from 'express'
import cors from 'cors'
import { z } from 'zod'
import {
  type DB,
  getUserGroups,
  createGroup,
  deleteGroup,
  configurePhaseTimes,
  addUserToGroup,
  removeUserFromGroup,
  listMembers,
  userInGroup,
  getUserByEmail,
  listChildren,
  createChild,
  updateChild,
  deleteChild,
  listTasks,
  createTask,
  updateTask,
  deleteTaskRow,
  resetTask,
  listRewards,
  getReward,
  createReward,
  updateReward,
  deleteReward,
  getPointsBalance,
  countPointTransactions,
  redeemReward,
  calculateNextDueDate as dbCalculateNextDueDate,
  calculateInitialDueDate as dbCalculateInitialDueDate,
  validateRecurrenceDays as dbValidateRecurrenceDays,
} from '@family-todo/db'

// OAuth modules
import { initOAuthDb } from './oauth/db.js'
import { initKeys } from './oauth/jwt.js'
import discoveryRouter from './oauth/endpoints/discovery.js'
import registerRouter from './oauth/endpoints/register.js'
import clientInfoRouter from './oauth/endpoints/client-info.js'
import tokenRouter from './oauth/endpoints/token.js'
import authorizeRouter from './oauth/endpoints/authorize.js'
import grantsRouter from './oauth/endpoints/grants.js'
import { authenticateFlexible, type AuthedRequest } from './oauth/middleware.js'

const PORT = parseInt(process.env.PORT || '3001', 10)

/**
 * Authenticated tool execution context. Replaces the PocketBase client that
 * used to be threaded through every handler: `db` is the shared @family-todo/db
 * connection and `userId` is the authenticated app user (for membership scoping).
 */
interface ToolContext {
  db: DB
  userId: string
}

// Available colors for children
export const CHILD_COLORS = [
  { name: 'Rot', value: '#FF6B6B' },
  { name: 'Orange', value: '#FFA94D' },
  { name: 'Gelb', value: '#FFE066' },
  { name: 'Grün', value: '#69DB7C' },
  { name: 'Blau', value: '#4DABF7' },
  { name: 'Lila', value: '#B197FC' },
  { name: 'Pink', value: '#F783AC' },
]

// Recurrence / date helpers are owned by @family-todo/db. Re-exported here so
// existing imports (and tests) keep working with identical semantics.
export const calculateNextDueDate = dbCalculateNextDueDate
export const calculateInitialDueDate = dbCalculateInitialDueDate
export const validateRecurrenceDays = dbValidateRecurrenceDays

// Tool registry
interface Tool {
  description: string
  inputSchema?: z.ZodType
  handler: (
    args: Record<string, unknown>,
    ctx: ToolContext,
  ) => Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }>
}

const tools: Map<string, Tool> = new Map()

// Register tools
function registerTools() {
  // ========== GROUP TOOLS ==========

  tools.set('list_groups', {
    description: 'List all groups the current user belongs to',
    handler: async (_, { db, userId }) => {
      if (!userId) {
        return { content: [{ type: 'text', text: 'Error: Not authenticated' }], isError: true }
      }

      const groups = getUserGroups(db, userId).map((g) => ({
        id: g.id,
        name: g.name,
        morningEnd: g.morningEnd || '09:00',
        eveningStart: g.eveningStart || '18:00',
        timezone: g.timezone || 'Europe/Berlin',
      }))

      return { content: [{ type: 'text', text: JSON.stringify(groups, null, 2) }] }
    },
  })

  tools.set('create_group', {
    description: 'Create a new group (family/household)',
    inputSchema: z.object({
      name: z.string().describe('Name of the group (e.g., "Schmidt Family")'),
    }),
    handler: async (args, { db, userId }) => {
      const { name } = args as { name: string }

      if (!userId) {
        return { content: [{ type: 'text', text: 'Error: Not authenticated' }], isError: true }
      }

      const group = createGroup(db, userId, name)

      return { content: [{ type: 'text', text: `Created group "${name}" (ID: ${group.id})` }] }
    },
  })

  tools.set('delete_group', {
    description: 'Delete a group (removes all children and tasks)',
    inputSchema: z.object({
      groupId: z.string().describe('ID of the group to delete'),
    }),
    handler: async (args, { db }) => {
      const { groupId } = args as { groupId: string }

      // Cascade-deletes children, their tasks, point_transactions, rewards and
      // memberships in a single transaction.
      deleteGroup(db, groupId)

      return { content: [{ type: 'text', text: `Deleted group ${groupId}` }] }
    },
  })

  // ========== CHILDREN TOOLS ==========

  tools.set('list_children', {
    description: 'List all children in a group',
    inputSchema: z.object({
      groupId: z.string().describe('ID of the group'),
    }),
    handler: async (args, { db }) => {
      const { groupId } = args as { groupId: string }

      const result = listChildren(db, groupId).map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
      }))

      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  })

  tools.set('create_child', {
    description: `Create a new child profile in a group. Available colors: ${CHILD_COLORS.map(c => `${c.name} (${c.value})`).join(', ')}`,
    inputSchema: z.object({
      groupId: z.string().describe('ID of the group'),
      name: z.string().describe('Name of the child'),
      color: z.string().describe('Color hex code (e.g., "#FF6B6B" for red)'),
    }),
    handler: async (args, { db }) => {
      const { groupId, name, color } = args as { groupId: string; name: string; color: string }

      const child = createChild(db, groupId, name, color)

      return { content: [{ type: 'text', text: `Created child "${name}" (ID: ${child.id})` }] }
    },
  })

  tools.set('update_child', {
    description: 'Update a child profile',
    inputSchema: z.object({
      childId: z.string().describe('ID of the child'),
      name: z.string().optional().describe('New name'),
      color: z.string().optional().describe('New color hex code'),
    }),
    handler: async (args, { db }) => {
      const { childId, name, color } = args as { childId: string; name?: string; color?: string }

      const updates: { name?: string; color?: string } = {}
      if (name) updates.name = name
      if (color) updates.color = color

      updateChild(db, childId, updates)

      return { content: [{ type: 'text', text: `Updated child ${childId}` }] }
    },
  })

  tools.set('delete_child', {
    description: 'Delete a child profile and all their tasks',
    inputSchema: z.object({
      childId: z.string().describe('ID of the child'),
    }),
    handler: async (args, { db }) => {
      const { childId } = args as { childId: string }

      // Deletes the child's tasks and point_transactions, then the child.
      deleteChild(db, childId)

      return { content: [{ type: 'text', text: `Deleted child ${childId}` }] }
    },
  })

  // ========== TASK TOOLS ==========

  tools.set('list_tasks', {
    description: 'List all tasks for a child',
    inputSchema: z.object({
      childId: z.string().describe('ID of the child'),
      includeCompleted: z.boolean().optional().describe('Include completed tasks (default: false)'),
    }),
    handler: async (args, { db }) => {
      const { childId, includeCompleted = false } = args as { childId: string; includeCompleted?: boolean }

      const result = listTasks(db, childId, includeCompleted).map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        completed: t.completed,
        completedAt: t.completedAt,
        dueDate: t.dueDate,
        lastCompletedAt: t.lastCompletedAt,
        recurrenceType: t.recurrenceType,
        recurrenceInterval: t.recurrenceInterval,
        recurrenceDays: t.recurrenceDays,
        timeOfDay: t.timeOfDay,
        points: t.points,
      }))

      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  })

  tools.set('create_task', {
    description: 'Create a new task for a child. timeOfDay is required: "morning" (before school), "afternoon" (general/homework), "evening" (bedtime routine). Supports recurrence: "interval" repeats every N days after completion, "weekly" repeats on specific weekdays.',
    inputSchema: z.object({
      childId: z.string().describe('ID of the child'),
      title: z.string().describe('Task title'),
      timeOfDay: z.enum(['morning', 'afternoon', 'evening']).describe('Time of day phase'),
      priority: z.number().nullable().optional().describe('Priority (lower number = higher priority, null = lowest)'),
      dueDate: z.string().nullable().optional().describe('Due date (ISO 8601, e.g. "2026-03-15")'),
      recurrenceType: z.string().nullable().optional().describe('Recurrence type: "interval" (every N days) or "weekly" (specific weekdays)'),
      recurrenceInterval: z.number().nullable().optional().describe('Days between recurrences (for interval type)'),
      recurrenceDays: z.array(z.number()).nullable().optional().describe('Weekdays for recurrence (0=Sunday, 1=Monday, ..., 6=Saturday)'),
      points: z.number().nullable().optional().describe('Points awarded for completing this task'),
      isChore: z.boolean().optional().describe('If true, task never shows as overdue and silently rolls over to the next day if not completed'),
      dailyOnly: z.boolean().optional().describe('If true, the task is a "Tagesaufgabe": it only shows on its due date and expires silently afterwards (never overdue, never carried forward). Good for optional/bonus tasks.'),
      isProject: z.boolean().optional().describe('If true, the task is a "Projektaufgabe": worked on over several days. The UI offers two actions — "Für heute geschafft" (hides it until the next day, then it reappears) and "Ganz fertig" (final completion / reschedule). Good for things like handwork.'),
    }),
    handler: async (args, { db }) => {
      const { childId, title, timeOfDay, priority, dueDate, recurrenceType, recurrenceInterval, recurrenceDays, points, isChore, dailyOnly, isProject } = args as {
        childId: string; title: string; timeOfDay: string; priority?: number | null; dueDate?: string | null;
        recurrenceType?: string | null; recurrenceInterval?: number | null; recurrenceDays?: number[] | null; points?: number | null; isChore?: boolean; dailyOnly?: boolean; isProject?: boolean
      }

      const daysError = validateRecurrenceDays(recurrenceDays)
      if (daysError) {
        return { content: [{ type: 'text', text: `Error: ${daysError}` }], isError: true }
      }

      const task = createTask(db, childId, {
        title,
        timeOfDay,
        priority: priority ?? null,
        dueDate: dueDate ?? null,
        recurrenceType: recurrenceType ?? null,
        recurrenceInterval: recurrenceInterval ?? null,
        recurrenceDays: recurrenceDays ?? null,
        points: points ?? null,
        isChore: isChore ?? false,
        dailyOnly: dailyOnly ?? false,
        isProject: isProject ?? false,
      })

      const parts = [`Created task "${title}" (ID: ${task.id})`]
      if (recurrenceType === 'interval') parts.push(`Repeats every ${recurrenceInterval} days`)
      if (recurrenceType === 'weekly') parts.push(`Repeats on weekdays: ${recurrenceDays?.join(', ')}`)
      if (dueDate) parts.push(`Due: ${dueDate}`)

      return { content: [{ type: 'text', text: parts.join('. ') }] }
    },
  })

  tools.set('update_task', {
    description: 'Update a task. All fields are optional; only the provided ones are changed.',
    inputSchema: z.object({
      taskId: z.string().describe('ID of the task'),
      title: z.string().optional().describe('New title'),
      priority: z.number().nullable().optional().describe('New priority (null = lowest / no priority)'),
      childId: z.string().optional().describe('Reassign to different child'),
      timeOfDay: z.enum(['morning', 'afternoon', 'evening']).optional().describe('Time of day phase'),
      isChore: z.boolean().optional().describe('Mark/unmark as chore (never overdue, silent rollover)'),
      dailyOnly: z.boolean().optional().describe('Mark/unmark as daily-only "Tagesaufgabe" (only shows on its due date, expires silently)'),
      isProject: z.boolean().optional().describe('Mark/unmark as "Projektaufgabe" (two actions in the UI: "Für heute geschafft" defers to the next day, "Ganz fertig" completes/reschedules)'),
      dueDate: z.string().nullable().optional().describe('Due date (ISO 8601, e.g. "2026-03-15"); null clears it'),
      recurrenceType: z.string().nullable().optional().describe('Recurrence type: "interval" (every N days) or "weekly" (specific weekdays); null removes recurrence'),
      recurrenceInterval: z.number().nullable().optional().describe('Days between recurrences (for interval type); null clears it'),
      recurrenceDays: z.array(z.number()).nullable().optional().describe('Weekdays for recurrence (0=Sunday, 1=Monday, ..., 6=Saturday); null clears it'),
    }),
    handler: async (args, { db }) => {
      const { taskId, title, priority, childId, timeOfDay, isChore, dailyOnly, isProject, dueDate, recurrenceType, recurrenceInterval, recurrenceDays } = args as {
        taskId: string; title?: string; priority?: number | null; childId?: string; timeOfDay?: string; isChore?: boolean;
        dailyOnly?: boolean; isProject?: boolean; dueDate?: string | null; recurrenceType?: string | null; recurrenceInterval?: number | null; recurrenceDays?: number[] | null
      }

      const daysError = validateRecurrenceDays(recurrenceDays)
      if (daysError) {
        return { content: [{ type: 'text', text: `Error: ${daysError}` }], isError: true }
      }

      updateTask(db, taskId, {
        title,
        priority,
        childId,
        timeOfDay,
        isChore,
        dailyOnly,
        isProject,
        dueDate,
        recurrenceType,
        recurrenceInterval,
        recurrenceDays,
      })

      return { content: [{ type: 'text', text: `Updated task ${taskId}` }] }
    },
  })

  tools.set('delete_task', {
    description: 'Delete a task',
    inputSchema: z.object({
      taskId: z.string().describe('ID of the task'),
    }),
    handler: async (args, { db }) => {
      const { taskId } = args as { taskId: string }

      deleteTaskRow(db, taskId)

      return { content: [{ type: 'text', text: `Deleted task ${taskId}` }] }
    },
  })

  tools.set('reset_task', {
    description: 'Reset a completed task to incomplete (for recurring tasks). Optionally set a specific dueDate; otherwise restores dueDate to lastCompletedAt for recurring tasks.',
    inputSchema: z.object({
      taskId: z.string().describe('ID of the task'),
      dueDate: z.string().optional().describe('Optional due date to set (ISO date string). If omitted, restores to lastCompletedAt for recurring tasks.'),
    }),
    handler: async (args, { db }) => {
      const { taskId, dueDate } = args as { taskId: string; dueDate?: string }

      resetTask(db, taskId, dueDate)

      return { content: [{ type: 'text', text: `Reset task ${taskId}` }] }
    },
  })

  // ========== MEMBER TOOLS ==========

  tools.set('list_members', {
    description: 'List all members (users) in a group',
    inputSchema: z.object({
      groupId: z.string().describe('ID of the group'),
    }),
    handler: async (args, { db }) => {
      const { groupId } = args as { groupId: string }

      const members = listMembers(db, groupId).map((u) => ({
        id: u.id,
        email: u.email,
      }))

      return { content: [{ type: 'text', text: JSON.stringify(members, null, 2) }] }
    },
  })

  tools.set('add_member', {
    description: 'Add a user to a group by email',
    inputSchema: z.object({
      groupId: z.string().describe('ID of the group'),
      email: z.string().describe('Email of the user to add'),
    }),
    handler: async (args, { db }) => {
      const { groupId, email } = args as { groupId: string; email: string }

      // Find user by email
      const user = getUserByEmail(db, email)
      if (!user) {
        return { content: [{ type: 'text', text: `Error: No user found with email "${email}"` }], isError: true }
      }

      // Check if already member
      if (userInGroup(db, user.id, groupId)) {
        return { content: [{ type: 'text', text: `User "${email}" is already a member of this group` }] }
      }

      // Add to group
      addUserToGroup(db, user.id, groupId)

      return { content: [{ type: 'text', text: `Added "${email}" to group` }] }
    },
  })

  tools.set('configure_phase_times', {
    description: 'Configure the time-of-day phase boundaries and timezone for a group. Morning phase runs from midnight to morningEnd, afternoon from morningEnd to eveningStart, evening from eveningStart to midnight. Default: morningEnd=09:00, eveningStart=18:00, timezone=Europe/Berlin.',
    inputSchema: z.object({
      groupId: z.string().describe('ID of the group'),
      morningEnd: z.string().optional().describe('End of morning phase (HH:MM format, e.g. "09:00")'),
      eveningStart: z.string().optional().describe('Start of evening phase (HH:MM format, e.g. "18:00")'),
      timezone: z.string().optional().describe('IANA timezone (e.g. "Europe/Berlin", "America/New_York")'),
    }),
    handler: async (args, { db }) => {
      const { groupId, morningEnd, eveningStart, timezone } = args as { groupId: string; morningEnd?: string; eveningStart?: string; timezone?: string }

      const updates: { morningEnd?: string; eveningStart?: string; timezone?: string } = {}
      if (morningEnd) updates.morningEnd = morningEnd
      if (eveningStart) updates.eveningStart = eveningStart
      if (timezone) updates.timezone = timezone

      configurePhaseTimes(db, groupId, updates)

      return { content: [{ type: 'text', text: `Updated phase times for group ${groupId}` }] }
    },
  })

  tools.set('remove_member', {
    description: 'Remove a user from a group',
    inputSchema: z.object({
      groupId: z.string().describe('ID of the group'),
      userId: z.string().describe('ID of the user to remove'),
    }),
    handler: async (args, { db }) => {
      const { groupId, userId } = args as { groupId: string; userId: string }

      if (!userInGroup(db, userId, groupId)) {
        return { content: [{ type: 'text', text: 'User is not a member of this group' }], isError: true }
      }

      removeUserFromGroup(db, userId, groupId)

      return { content: [{ type: 'text', text: `Removed user ${userId} from group` }] }
    },
  })

  // ========== REWARD TOOLS ==========

  tools.set('create_reward', {
    description: 'Create a new reward that children can redeem with points',
    inputSchema: z.object({
      groupId: z.string().describe('ID of the group'),
      name: z.string().describe('Name of the reward (e.g., "Ice Cream")'),
      description: z.string().optional().describe('Description of the reward'),
      pointsCost: z.number().describe('How many points this reward costs'),
    }),
    handler: async (args, { db }) => {
      const { groupId, name, description, pointsCost } = args as { groupId: string; name: string; description?: string; pointsCost: number }

      const reward = createReward(db, groupId, name, pointsCost, description ?? '')

      return { content: [{ type: 'text', text: `Created reward "${name}" (ID: ${reward.id}) - costs ${pointsCost} points` }] }
    },
  })

  tools.set('list_rewards', {
    description: 'List all rewards for a group',
    inputSchema: z.object({
      groupId: z.string().describe('ID of the group'),
    }),
    handler: async (args, { db }) => {
      const { groupId } = args as { groupId: string }

      const result = listRewards(db, groupId).map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        pointsCost: r.pointsCost,
      }))

      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  })

  tools.set('update_reward', {
    description: 'Update a reward',
    inputSchema: z.object({
      rewardId: z.string().describe('ID of the reward'),
      name: z.string().optional().describe('New name'),
      description: z.string().optional().describe('New description'),
      pointsCost: z.number().optional().describe('New points cost'),
    }),
    handler: async (args, { db }) => {
      const { rewardId, name, description, pointsCost } = args as { rewardId: string; name?: string; description?: string; pointsCost?: number }

      const updates: { name?: string; description?: string; pointsCost?: number } = {}
      if (name) updates.name = name
      if (description !== undefined) updates.description = description
      if (pointsCost !== undefined) updates.pointsCost = pointsCost

      updateReward(db, rewardId, updates)

      return { content: [{ type: 'text', text: `Updated reward ${rewardId}` }] }
    },
  })

  tools.set('delete_reward', {
    description: 'Delete a reward',
    inputSchema: z.object({
      rewardId: z.string().describe('ID of the reward'),
    }),
    handler: async (args, { db }) => {
      const { rewardId } = args as { rewardId: string }

      deleteReward(db, rewardId)

      return { content: [{ type: 'text', text: `Deleted reward ${rewardId}` }] }
    },
  })

  tools.set('get_points_balance', {
    description: 'Get the current points balance for a child',
    inputSchema: z.object({
      childId: z.string().describe('ID of the child'),
    }),
    handler: async (args, { db }) => {
      const { childId } = args as { childId: string }

      const balance = getPointsBalance(db, childId)
      const totalTransactions = countPointTransactions(db, childId)

      return { content: [{ type: 'text', text: JSON.stringify({ childId, balance, totalTransactions }, null, 2) }] }
    },
  })

  tools.set('redeem_reward', {
    description: 'Redeem a reward for a child, deducting points from their balance',
    inputSchema: z.object({
      childId: z.string().describe('ID of the child'),
      rewardId: z.string().describe('ID of the reward to redeem'),
    }),
    handler: async (args, { db }) => {
      const { childId, rewardId } = args as { childId: string; rewardId: string }

      const result = redeemReward(db, childId, rewardId)

      if (result.error === 'reward-not-found') {
        throw new Error(`reward not found: ${rewardId}`)
      }

      if (result.error === 'insufficient-points') {
        const reward = getReward(db, rewardId)
        const cost = reward?.pointsCost ?? 0
        return { content: [{ type: 'text', text: `Insufficient points. Balance: ${result.balance}, Cost: ${cost}` }], isError: true }
      }

      const reward = result.reward!
      return { content: [{ type: 'text', text: `Redeemed "${reward.name}" for ${reward.pointsCost} points. New balance: ${result.newBalance}` }] }
    },
  })
}

// Initialize tools
registerTools()

// Convert Zod schema to JSON Schema for MCP
function zodToJsonSchema(schema: z.ZodType): object {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape
    const properties: Record<string, object> = {}
    const required: string[] = []

    for (const [key, value] of Object.entries(shape)) {
      const zodValue = value as z.ZodType
      if (zodValue instanceof z.ZodString) {
        properties[key] = { type: 'string', description: zodValue.description }
      } else if (zodValue instanceof z.ZodNumber) {
        properties[key] = { type: 'number', description: zodValue.description }
      } else if (zodValue instanceof z.ZodBoolean) {
        properties[key] = { type: 'boolean', description: zodValue.description }
      } else if (zodValue instanceof z.ZodEnum) {
        properties[key] = { type: 'string', enum: zodValue._def.values, description: zodValue.description }
      } else if (zodValue instanceof z.ZodArray) {
        properties[key] = { type: 'array', items: { type: 'number' }, description: zodValue.description }
      } else if (zodValue instanceof z.ZodOptional) {
        const inner = zodValue._def.innerType
        if (inner instanceof z.ZodString) {
          properties[key] = { type: 'string', description: inner.description }
        } else if (inner instanceof z.ZodNumber) {
          properties[key] = { type: 'number', description: inner.description }
        } else if (inner instanceof z.ZodBoolean) {
          properties[key] = { type: 'boolean', description: inner.description }
        } else if (inner instanceof z.ZodEnum) {
          properties[key] = { type: 'string', enum: inner._def.values, description: inner.description }
        } else if (inner instanceof z.ZodArray) {
          properties[key] = { type: 'array', items: { type: 'number' }, description: inner.description }
        }
      } else {
        properties[key] = { type: 'string' }
      }

      if (!(zodValue instanceof z.ZodOptional)) {
        required.push(key)
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    }
  }
  return { type: 'object' }
}

// Create Express app
export const app = express()

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

app.use(express.json())
app.use(express.urlencoded({ extended: true })) // For OAuth token endpoint

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// OAuth 2.0 endpoints
app.use('/.well-known', discoveryRouter)
app.use('/oauth/register', registerRouter)
app.use('/oauth/client', clientInfoRouter)
app.use('/oauth/token', tokenRouter)
app.use('/oauth/authorize', authorizeRouter)
app.use('/oauth/grants', grantsRouter)

// MCP endpoint - JSON-RPC handler (supports Bearer token or query param)
app.post('/mcp', authenticateFlexible, async (req: AuthedRequest, res: Response) => {
  const ctx: ToolContext = { db: req.db as DB, userId: req.userId as string }
  const { jsonrpc, method, params, id } = req.body


  if (jsonrpc !== '2.0') {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Invalid JSON-RPC version' },
      id,
    })
    return
  }

  try {
    if (method === 'initialize') {
      // MCP initialization - return server capabilities
      res.json({
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'family-todo-mcp',
            version: '1.0.0',
          },
          capabilities: {
            tools: {},
          },
        },
        id,
      })
    } else if (method === 'notifications/initialized') {
      // Client acknowledges initialization - just return success
      res.json({
        jsonrpc: '2.0',
        result: {},
        id,
      })
    } else if (method === 'tools/list') {
      // Return list of available tools
      const toolList = Array.from(tools.entries()).map(([name, tool]) => ({
        name,
        description: tool.description,
        inputSchema: tool.inputSchema ? zodToJsonSchema(tool.inputSchema) : { type: 'object' },
      }))

      res.json({
        jsonrpc: '2.0',
        result: { tools: toolList },
        id,
      })
    } else if (method === 'tools/call') {
      const { name, arguments: args } = params || {}

      const tool = tools.get(name)
      if (!tool) {
        res.json({
          jsonrpc: '2.0',
          error: { code: -32601, message: `Unknown tool: ${name}` },
          id,
        })
        return
      }

      // Validate input if schema exists
      if (tool.inputSchema) {
        const validation = tool.inputSchema.safeParse(args)
        if (!validation.success) {
          res.json({
            jsonrpc: '2.0',
            error: { code: -32602, message: `Invalid parameters: ${validation.error.message}` },
            id,
          })
          return
        }
      }

      // Call the tool
      const result = await tool.handler(args || {}, ctx)

      res.json({
        jsonrpc: '2.0',
        result,
        id,
      })
    } else {
      res.json({
        jsonrpc: '2.0',
        error: { code: -32601, message: `Unknown method: ${method}` },
        id,
      })
    }
  } catch (error) {
    console.error('MCP error:', error)
    res.json({
      jsonrpc: '2.0',
      error: { code: -32603, message: error instanceof Error ? error.message : 'Internal error' },
      id,
    })
  }
})

// Handle GET /mcp - Claude might be checking for SSE or metadata
app.get('/mcp', (_req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32600, message: 'Method not allowed. Use POST for MCP calls.' },
  })
})

// Initialize OAuth (database and keys)
export async function initOAuth(): Promise<void> {
  const dbPath = process.env.OAUTH_DB_PATH || './data/oauth.db'
  initOAuthDb(dbPath)
  await initKeys()
}

// Start server (only when run directly)
if (process.env.NODE_ENV !== 'test') {
  initOAuth().then(() => {
    app.listen(PORT, '::')
  }).catch((err) => {
    console.error('Failed to initialize OAuth:', err)
    process.exit(1)
  })
}
