/**
 * Family Todo MCP Server
 *
 * Standalone Express server that exposes MCP tools for managing
 * groups, children, and tasks. Parents use AI agents (Claude, ChatGPT)
 * to call these tools via JSON-RPC.
 *
 * Supports OAuth 2.0 authentication for Claude MCP integration.
 */

import express from 'express'
import type { Request, Response } from 'express'
import cors from 'cors'
import PocketBase from 'pocketbase'
import { z } from 'zod'

// OAuth modules
import { initOAuthDb } from './oauth/db.js'
import { initKeys } from './oauth/jwt.js'
import discoveryRouter from './oauth/endpoints/discovery.js'
import registerRouter from './oauth/endpoints/register.js'
import clientInfoRouter from './oauth/endpoints/client-info.js'
import tokenRouter from './oauth/endpoints/token.js'
import authorizeRouter from './oauth/endpoints/authorize.js'
import grantsRouter from './oauth/endpoints/grants.js'
import { authenticateFlexible } from './oauth/middleware.js'

const POCKETBASE_URL = process.env.POCKETBASE_URL
if (!POCKETBASE_URL) {
  throw new Error('POCKETBASE_URL environment variable is required')
}

const PORT = parseInt(process.env.PORT || '3001', 10)

// PocketBase record types
interface ChildRecord {
  id: string
  name: string
  color: string
  group: string
  collectionId: string
  collectionName: string
}

interface TaskRecord {
  id: string
  title: string
  priority: number | null
  completed: boolean
  completedAt: string | null
  dueDate: string | null
  lastCompletedAt: string | null
  recurrenceType: string | null
  recurrenceInterval: number | null
  recurrenceDays: number[] | null
  timeOfDay: string
  points: number | null
  child: string
  collectionId: string
  collectionName: string
}

interface RewardRecord {
  id: string
  name: string
  description: string
  pointsCost: number
  group: string
  collectionId: string
  collectionName: string
}

interface PointTransactionRecord {
  id: string
  child: string
  points: number
  type: string
  description: string
  reward: string | null
  task: string | null
  collectionId: string
  collectionName: string
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

export function getLocalDateParts(timezone: string, date: Date): { year: number; month: number; day: number; weekday: number } {
  const tz = timezone || 'Europe/Berlin'
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  })
  const parts = formatter.formatToParts(date)
  const year = Number(parts.find((p) => p.type === 'year')?.value)
  const month = Number(parts.find((p) => p.type === 'month')?.value)
  const day = Number(parts.find((p) => p.type === 'day')?.value)
  const weekdayStr = parts.find((p) => p.type === 'weekday')?.value || ''
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const weekday = weekdayMap[weekdayStr] ?? date.getDay()
  return { year, month, day, weekday }
}

export function getLocalDateString(timezone: string, date: Date): string {
  const { year, month, day } = getLocalDateParts(timezone, date)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function calculateNextDueDate(
  recurrenceType: string | null,
  recurrenceInterval: number | null,
  recurrenceDays: number[] | null,
  completedAt: Date,
  timezone?: string,
): string | null {
  const tz = timezone || 'UTC'

  if (recurrenceType === 'interval' && recurrenceInterval) {
    const localDate = getLocalDateString(tz, completedAt)
    const next = new Date(localDate + 'T00:00:00Z')
    next.setUTCDate(next.getUTCDate() + recurrenceInterval)
    return next.toISOString()
  }

  if (recurrenceType === 'weekly' && recurrenceDays && recurrenceDays.length > 0) {
    const sorted = [...recurrenceDays].sort((a, b) => a - b)
    const { weekday: currentDay } = getLocalDateParts(tz, completedAt)
    const localDate = getLocalDateString(tz, completedAt)

    const nextDay = sorted.find((d) => d > currentDay) ?? sorted[0]
    const daysUntil = nextDay > currentDay
      ? nextDay - currentDay
      : 7 - currentDay + nextDay

    const next = new Date(localDate + 'T00:00:00Z')
    next.setUTCDate(next.getUTCDate() + daysUntil)
    return next.toISOString()
  }

  return null
}

export function calculateInitialDueDate(
  recurrenceType: string | null,
  recurrenceInterval: number | null,
  recurrenceDays: number[] | null,
  today: Date,
  timezone?: string,
): string | null {
  const tz = timezone || 'UTC'

  if (recurrenceType === 'interval' && recurrenceInterval) {
    const localDate = getLocalDateString(tz, today)
    return new Date(localDate + 'T00:00:00Z').toISOString()
  }

  if (recurrenceType === 'weekly' && recurrenceDays && recurrenceDays.length > 0) {
    const sorted = [...recurrenceDays].sort((a, b) => a - b)
    const { weekday: currentDay } = getLocalDateParts(tz, today)
    const localDate = getLocalDateString(tz, today)

    const nextDay = sorted.find((d) => d >= currentDay) ?? sorted[0]
    const daysUntil = nextDay >= currentDay
      ? nextDay - currentDay
      : 7 - currentDay + nextDay

    const next = new Date(localDate + 'T00:00:00Z')
    next.setUTCDate(next.getUTCDate() + daysUntil)
    return next.toISOString()
  }

  return null
}

// Tool registry
interface Tool {
  description: string
  inputSchema?: z.ZodType
  handler: (args: Record<string, unknown>, pb: PocketBase) => Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }>
}

const tools: Map<string, Tool> = new Map()

// Register tools
function registerTools() {
  // ========== GROUP TOOLS ==========

  tools.set('list_groups', {
    description: 'List all groups the current user belongs to',
    handler: async (_, pb) => {
      const user = pb.authStore.record
      if (!user) {
        return { content: [{ type: 'text', text: 'Error: Not authenticated' }], isError: true }
      }

      const memberships = await pb.collection('user_groups').getList(1, 100, {
        filter: `user = "${user.id}"`,
        expand: 'group',
      })

      interface MembershipWithGroup {
        expand?: { group?: { id: string; name: string; morningEnd?: string; eveningStart?: string; timezone?: string } }
      }

      const groups = memberships.items.map((m: MembershipWithGroup) => ({
        id: m.expand?.group?.id,
        name: m.expand?.group?.name,
        morningEnd: m.expand?.group?.morningEnd || '09:00',
        eveningStart: m.expand?.group?.eveningStart || '18:00',
        timezone: m.expand?.group?.timezone || 'Europe/Berlin',
      }))

      return { content: [{ type: 'text', text: JSON.stringify(groups, null, 2) }] }
    },
  })

  tools.set('create_group', {
    description: 'Create a new group (family/household)',
    inputSchema: z.object({
      name: z.string().describe('Name of the group (e.g., "Schmidt Family")'),
    }),
    handler: async (args, pb) => {
      const { name } = args as { name: string }
      const user = pb.authStore.record

      if (!user) {
        return { content: [{ type: 'text', text: 'Error: Not authenticated' }], isError: true }
      }

      const group = await pb.collection('groups').create({ name })
      await pb.collection('user_groups').create({
        user: user.id,
        group: group.id,
      })

      return { content: [{ type: 'text', text: `Created group "${name}" (ID: ${group.id})` }] }
    },
  })

  tools.set('delete_group', {
    description: 'Delete a group (removes all children and tasks)',
    inputSchema: z.object({
      groupId: z.string().describe('ID of the group to delete'),
    }),
    handler: async (args, pb) => {
      const { groupId } = args as { groupId: string }

      // Delete all children and their tasks
      const children = await pb.collection('children').getList(1, 1000, {
        filter: `group = "${groupId}"`,
      })

      for (const child of children.items) {
        const tasks = await pb.collection('tasks').getList(1, 1000, {
          filter: `child = "${child.id}"`,
        })
        for (const task of tasks.items) {
          await pb.collection('tasks').delete(task.id)
        }
        await pb.collection('children').delete(child.id)
      }

      // Delete all memberships
      const memberships = await pb.collection('user_groups').getList(1, 1000, {
        filter: `group = "${groupId}"`,
      })
      for (const m of memberships.items) {
        await pb.collection('user_groups').delete(m.id)
      }

      // Delete the group
      await pb.collection('groups').delete(groupId)

      return { content: [{ type: 'text', text: `Deleted group ${groupId}` }] }
    },
  })

  // ========== CHILDREN TOOLS ==========

  tools.set('list_children', {
    description: 'List all children in a group',
    inputSchema: z.object({
      groupId: z.string().describe('ID of the group'),
    }),
    handler: async (args, pb) => {
      const { groupId } = args as { groupId: string }

      const children = await pb.collection<ChildRecord>('children').getList(1, 100, {
        filter: `group = "${groupId}"`,
        sort: 'name',
      })

      const result = children.items.map((c) => ({
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
    handler: async (args, pb) => {
      const { groupId, name, color } = args as { groupId: string; name: string; color: string }

      const child = await pb.collection('children').create({
        name,
        color,
        group: groupId,
      })

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
    handler: async (args, pb) => {
      const { childId, name, color } = args as { childId: string; name?: string; color?: string }

      const updates: Record<string, string> = {}
      if (name) updates.name = name
      if (color) updates.color = color

      await pb.collection('children').update(childId, updates)

      return { content: [{ type: 'text', text: `Updated child ${childId}` }] }
    },
  })

  tools.set('delete_child', {
    description: 'Delete a child profile and all their tasks',
    inputSchema: z.object({
      childId: z.string().describe('ID of the child'),
    }),
    handler: async (args, pb) => {
      const { childId } = args as { childId: string }

      // Delete all tasks for this child
      const tasks = await pb.collection('tasks').getList(1, 1000, {
        filter: `child = "${childId}"`,
      })
      for (const task of tasks.items) {
        await pb.collection('tasks').delete(task.id)
      }

      // Delete the child
      await pb.collection('children').delete(childId)

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
    handler: async (args, pb) => {
      const { childId, includeCompleted = false } = args as { childId: string; includeCompleted?: boolean }

      const filter = includeCompleted
        ? `child = "${childId}"`
        : `child = "${childId}" && completed = false`

      const tasks = await pb.collection<TaskRecord>('tasks').getList(1, 100, { filter })

      const result = tasks.items.map((t) => ({
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
    description: 'Create a new task for a child. timeOfDay is required: "morning" (before school), "afternoon" (general/homework), "evening" (bedtime routine). Supports recurrence: "interval" repeats every N days after completion, "weekly" repeats on specific weekdays. recurrenceDays uses 0-based US weekday numbering: 0 = Sunday, 1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday, 6 = Saturday (matches JavaScript Date.getDay()).',
    inputSchema: z.object({
      childId: z.string().describe('ID of the child'),
      title: z.string().describe('Task title'),
      timeOfDay: z.enum(['morning', 'afternoon', 'evening']).describe('Time of day phase'),
      priority: z.number().optional().describe('Priority (lower number = higher priority, null = lowest)'),
      dueDate: z.string().optional().describe('Due date (ISO 8601, e.g. "2026-03-15")'),
      recurrenceType: z.string().optional().describe('Recurrence type: "interval" (every N days) or "weekly" (specific weekdays)'),
      recurrenceInterval: z.number().optional().describe('Days between recurrences (for interval type)'),
      recurrenceDays: z.array(z.number()).optional().describe('Weekdays for recurrence (0=Sunday, 1=Monday, ..., 6=Saturday)'),
      points: z.number().optional().describe('Points awarded for completing this task'),
      isChore: z.boolean().optional().describe('If true, task never shows as overdue and silently rolls over to the next day if not completed'),
    }),
    handler: async (args, pb) => {
      const { childId, title, timeOfDay, priority, dueDate, recurrenceType, recurrenceInterval, recurrenceDays, points, isChore } = args as {
        childId: string; title: string; timeOfDay: string; priority?: number; dueDate?: string;
        recurrenceType?: string; recurrenceInterval?: number; recurrenceDays?: number[]; points?: number; isChore?: boolean
      }

      const child = await pb.collection('children').getOne(childId)
      const group = await pb.collection('groups').getOne(child.group)
      const timezone = group.timezone || 'Europe/Berlin'

      const effectiveDueDate = dueDate
        ?? calculateInitialDueDate(recurrenceType ?? null, recurrenceInterval ?? null, recurrenceDays ?? null, new Date(), timezone)

      const task = await pb.collection('tasks').create({
        title,
        child: childId,
        timeOfDay,
        priority: priority ?? null,
        completed: false,
        dueDate: effectiveDueDate,
        recurrenceType: recurrenceType ?? null,
        recurrenceInterval: recurrenceInterval ?? null,
        recurrenceDays: recurrenceDays ?? null,
        points: points ?? null,
        isChore: isChore ?? false,
      })

      const parts = [`Created task "${title}" (ID: ${task.id})`]
      if (recurrenceType === 'interval') parts.push(`Repeats every ${recurrenceInterval} days`)
      if (recurrenceType === 'weekly') parts.push(`Repeats on weekdays: ${recurrenceDays?.join(', ')}`)
      if (dueDate) parts.push(`Due: ${dueDate}`)

      return { content: [{ type: 'text', text: parts.join('. ') }] }
    },
  })

  tools.set('update_task', {
    description: 'Update a task',
    inputSchema: z.object({
      taskId: z.string().describe('ID of the task'),
      title: z.string().optional().describe('New title'),
      priority: z.number().optional().describe('New priority'),
      childId: z.string().optional().describe('Reassign to different child'),
      timeOfDay: z.enum(['morning', 'afternoon', 'evening']).optional().describe('Time of day phase'),
      isChore: z.boolean().optional().describe('Mark/unmark as chore (never overdue, silent rollover)'),
    }),
    handler: async (args, pb) => {
      const { taskId, title, priority, childId, timeOfDay, isChore } = args as { taskId: string; title?: string; priority?: number; childId?: string; timeOfDay?: string; isChore?: boolean }

      const updates: Record<string, unknown> = {}
      if (title) updates.title = title
      if (priority !== undefined) updates.priority = priority
      if (childId) updates.child = childId
      if (timeOfDay) updates.timeOfDay = timeOfDay
      if (isChore !== undefined) updates.isChore = isChore

      await pb.collection('tasks').update(taskId, updates)

      return { content: [{ type: 'text', text: `Updated task ${taskId}` }] }
    },
  })

  tools.set('delete_task', {
    description: 'Delete a task',
    inputSchema: z.object({
      taskId: z.string().describe('ID of the task'),
    }),
    handler: async (args, pb) => {
      const { taskId } = args as { taskId: string }

      await pb.collection('tasks').delete(taskId)

      return { content: [{ type: 'text', text: `Deleted task ${taskId}` }] }
    },
  })

  tools.set('reset_task', {
    description: 'Reset a completed task to incomplete (for recurring tasks). Optionally set a specific dueDate; otherwise restores dueDate to lastCompletedAt for recurring tasks.',
    inputSchema: z.object({
      taskId: z.string().describe('ID of the task'),
      dueDate: z.string().optional().describe('Optional due date to set (ISO date string). If omitted, restores to lastCompletedAt for recurring tasks.'),
    }),
    handler: async (args, pb) => {
      const { taskId, dueDate } = args as { taskId: string; dueDate?: string }

      const updateData: Record<string, unknown> = {
        completed: false,
        completedAt: null,
      }

      if (dueDate) {
        updateData.dueDate = dueDate
      } else {
        const task = await pb.collection('tasks').getOne(taskId)
        if (task.lastCompletedAt && task.recurrenceType) {
          updateData.dueDate = task.lastCompletedAt
        }
      }

      await pb.collection('tasks').update(taskId, updateData)

      return { content: [{ type: 'text', text: `Reset task ${taskId}` }] }
    },
  })

  // ========== MEMBER TOOLS ==========

  tools.set('list_members', {
    description: 'List all members (users) in a group',
    inputSchema: z.object({
      groupId: z.string().describe('ID of the group'),
    }),
    handler: async (args, pb) => {
      const { groupId } = args as { groupId: string }

      const memberships = await pb.collection('user_groups').getList(1, 100, {
        filter: `group = "${groupId}"`,
        expand: 'user',
      })

      interface MembershipWithUser {
        expand?: { user?: { id: string; email: string } }
      }

      const members = memberships.items.map((m: MembershipWithUser) => ({
        id: m.expand?.user?.id,
        email: m.expand?.user?.email,
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
    handler: async (args, pb) => {
      const { groupId, email } = args as { groupId: string; email: string }

      // Find user by email
      const users = await pb.collection('users').getList(1, 1, {
        filter: `email = "${email}"`,
      })

      if (users.items.length === 0) {
        return { content: [{ type: 'text', text: `Error: No user found with email "${email}"` }], isError: true }
      }

      const userId = users.items[0].id

      // Check if already member
      const existing = await pb.collection('user_groups').getList(1, 1, {
        filter: `user = "${userId}" && group = "${groupId}"`,
      })

      if (existing.items.length > 0) {
        return { content: [{ type: 'text', text: `User "${email}" is already a member of this group` }] }
      }

      // Add to group
      await pb.collection('user_groups').create({
        user: userId,
        group: groupId,
      })

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
    handler: async (args, pb) => {
      const { groupId, morningEnd, eveningStart, timezone } = args as { groupId: string; morningEnd?: string; eveningStart?: string; timezone?: string }

      const updates: Record<string, string> = {}
      if (morningEnd) updates.morningEnd = morningEnd
      if (eveningStart) updates.eveningStart = eveningStart
      if (timezone) updates.timezone = timezone

      await pb.collection('groups').update(groupId, updates)

      return { content: [{ type: 'text', text: `Updated phase times for group ${groupId}` }] }
    },
  })

  tools.set('remove_member', {
    description: 'Remove a user from a group',
    inputSchema: z.object({
      groupId: z.string().describe('ID of the group'),
      userId: z.string().describe('ID of the user to remove'),
    }),
    handler: async (args, pb) => {
      const { groupId, userId } = args as { groupId: string; userId: string }

      const memberships = await pb.collection('user_groups').getList(1, 1, {
        filter: `user = "${userId}" && group = "${groupId}"`,
      })

      if (memberships.items.length === 0) {
        return { content: [{ type: 'text', text: 'User is not a member of this group' }], isError: true }
      }

      await pb.collection('user_groups').delete(memberships.items[0].id)

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
    handler: async (args, pb) => {
      const { groupId, name, description, pointsCost } = args as { groupId: string; name: string; description?: string; pointsCost: number }

      const reward = await pb.collection('rewards').create({
        name,
        description: description ?? '',
        pointsCost,
        group: groupId,
      })

      return { content: [{ type: 'text', text: `Created reward "${name}" (ID: ${reward.id}) - costs ${pointsCost} points` }] }
    },
  })

  tools.set('list_rewards', {
    description: 'List all rewards for a group',
    inputSchema: z.object({
      groupId: z.string().describe('ID of the group'),
    }),
    handler: async (args, pb) => {
      const { groupId } = args as { groupId: string }

      const rewards = await pb.collection<RewardRecord>('rewards').getList(1, 100, {
        filter: `group = "${groupId}"`,
        sort: 'name',
      })

      const result = rewards.items.map((r) => ({
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
    handler: async (args, pb) => {
      const { rewardId, name, description, pointsCost } = args as { rewardId: string; name?: string; description?: string; pointsCost?: number }

      const updates: Record<string, unknown> = {}
      if (name) updates.name = name
      if (description !== undefined) updates.description = description
      if (pointsCost !== undefined) updates.pointsCost = pointsCost

      await pb.collection('rewards').update(rewardId, updates)

      return { content: [{ type: 'text', text: `Updated reward ${rewardId}` }] }
    },
  })

  tools.set('delete_reward', {
    description: 'Delete a reward',
    inputSchema: z.object({
      rewardId: z.string().describe('ID of the reward'),
    }),
    handler: async (args, pb) => {
      const { rewardId } = args as { rewardId: string }

      await pb.collection('rewards').delete(rewardId)

      return { content: [{ type: 'text', text: `Deleted reward ${rewardId}` }] }
    },
  })

  tools.set('get_points_balance', {
    description: 'Get the current points balance for a child',
    inputSchema: z.object({
      childId: z.string().describe('ID of the child'),
    }),
    handler: async (args, pb) => {
      const { childId } = args as { childId: string }

      const transactions = await pb.collection<PointTransactionRecord>('point_transactions').getFullList({
        filter: `child = "${childId}"`,
      })

      const balance = transactions.reduce((sum, t) => sum + t.points, 0)

      return { content: [{ type: 'text', text: JSON.stringify({ childId, balance, totalTransactions: transactions.length }, null, 2) }] }
    },
  })

  tools.set('redeem_reward', {
    description: 'Redeem a reward for a child, deducting points from their balance',
    inputSchema: z.object({
      childId: z.string().describe('ID of the child'),
      rewardId: z.string().describe('ID of the reward to redeem'),
    }),
    handler: async (args, pb) => {
      const { childId, rewardId } = args as { childId: string; rewardId: string }

      const reward = await pb.collection<RewardRecord>('rewards').getOne(rewardId)

      const transactions = await pb.collection<PointTransactionRecord>('point_transactions').getFullList({
        filter: `child = "${childId}"`,
      })
      const balance = transactions.reduce((sum, t) => sum + t.points, 0)

      if (balance < reward.pointsCost) {
        return { content: [{ type: 'text', text: `Insufficient points. Balance: ${balance}, Cost: ${reward.pointsCost}` }], isError: true }
      }

      await pb.collection('point_transactions').create({
        child: childId,
        points: -reward.pointsCost,
        type: 'redeemed',
        description: `Redeemed: ${reward.name}`,
        reward: rewardId,
      })

      return { content: [{ type: 'text', text: `Redeemed "${reward.name}" for ${reward.pointsCost} points. New balance: ${balance - reward.pointsCost}` }] }
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
app.post('/mcp', authenticateFlexible, async (req: Request, res: Response) => {
  const pb = (req as Request & { pb: PocketBase }).pb
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
      const result = await tool.handler(args || {}, pb)

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
