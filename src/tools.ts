import { z } from 'zod'
import type { Db } from './db.ts'
import {
  createChild,
  deleteChild,
  getChildById,
  listChildren,
  updateChild,
} from './domain/children.ts'
import {
  createGroup,
  isUserInGroup,
  listGroupsForUser,
} from './domain/groups.ts'
import { getPointsBalance, listPointTransactions } from './domain/points.ts'
import {
  createReward,
  deleteReward,
  getRewardById,
  listRewards,
  redeemReward,
} from './domain/rewards.ts'
import {
  completeTask,
  createTask,
  deleteTask,
  getTaskById,
  listActiveTasksForChild,
  listTasksForChild,
  listTasksForGroup,
  resetTask,
  updateTask,
} from './domain/tasks.ts'
import {
  createTimePhase,
  deleteTimePhase,
  getTimePhaseById,
  listTimePhases,
} from './domain/time_phases.ts'

export type ToolDeps = { db: Db }
export type User = { sub: string; email?: string }

const authzError = (message: string): Error => {
  const err = new Error(message)
  err.name = 'AuthzError'
  return err
}

const isAuthzError = (err: unknown): err is Error =>
  err instanceof Error && err.name === 'AuthzError'

const assertGroupAccess = (db: Db, user: User, groupId: string): void => {
  if (!isUserInGroup(db, user.sub, groupId)) {
    throw authzError('Not a member of this group')
  }
}

const assertChildAccess = (db: Db, user: User, childId: string): void => {
  const child = getChildById(db, childId)
  if (!child) throw authzError('Child not found')
  assertGroupAccess(db, user, child.groupId)
}

const assertTaskAccess = (db: Db, user: User, taskId: string): void => {
  const task = getTaskById(db, taskId)
  if (!task) throw authzError('Task not found')
  assertChildAccess(db, user, task.childId)
}

const assertRewardAccess = (db: Db, user: User, rewardId: string): void => {
  const reward = getRewardById(db, rewardId)
  if (!reward) throw authzError('Reward not found')
  assertGroupAccess(db, user, reward.groupId)
}

const assertPhaseAccess = (db: Db, user: User, phaseId: string): void => {
  const phase = getTimePhaseById(db, phaseId)
  if (!phase) throw authzError('Time phase not found')
  assertGroupAccess(db, user, phase.groupId)
}

// ── groups ──────────────────────────────────────────────────────────────────

export const listGroupsInput = z.object({})
export const toolListGroups =
  ({ db }: ToolDeps, user: User) =>
  () =>
    listGroupsForUser(db, user.sub)

export const createGroupInput = z.object({ name: z.string().min(1) })
export const toolCreateGroup =
  ({ db }: ToolDeps, user: User) =>
  (input: z.infer<typeof createGroupInput>) =>
    createGroup(db, { name: input.name, createdBy: user.sub })

// ── children ────────────────────────────────────────────────────────────────

export const listChildrenInput = z.object({ groupId: z.string() })
export const toolListChildren =
  ({ db }: ToolDeps, user: User) =>
  (input: z.infer<typeof listChildrenInput>) => {
    assertGroupAccess(db, user, input.groupId)
    return listChildren(db, input.groupId)
  }

export const createChildInput = z.object({
  groupId: z.string(),
  name: z.string().min(1),
  color: z.string().min(1),
})
export const toolCreateChild =
  ({ db }: ToolDeps, user: User) =>
  (input: z.infer<typeof createChildInput>) => {
    assertGroupAccess(db, user, input.groupId)
    return createChild(db, input)
  }

export const updateChildInput = z.object({
  childId: z.string(),
  name: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
})
export const toolUpdateChild =
  ({ db }: ToolDeps, user: User) =>
  (input: z.infer<typeof updateChildInput>) => {
    assertChildAccess(db, user, input.childId)
    return updateChild(db, input.childId, {
      name: input.name,
      color: input.color,
    })
  }

export const deleteChildInput = z.object({ childId: z.string() })
export const toolDeleteChild =
  ({ db }: ToolDeps, user: User) =>
  (input: z.infer<typeof deleteChildInput>) => {
    assertChildAccess(db, user, input.childId)
    deleteChild(db, input.childId)
    return { ok: true }
  }

// ── time phases ─────────────────────────────────────────────────────────────

export const listTimePhasesInput = z.object({ groupId: z.string() })
export const toolListTimePhases =
  ({ db }: ToolDeps, user: User) =>
  (input: z.infer<typeof listTimePhasesInput>) => {
    assertGroupAccess(db, user, input.groupId)
    return listTimePhases(db, input.groupId)
  }

export const createTimePhaseInput = z.object({
  groupId: z.string(),
  name: z.string().min(1),
  startHour: z.number().int().min(0).max(23),
  startMinute: z.number().int().min(0).max(59).default(0),
  endHour: z.number().int().min(0).max(23),
  endMinute: z.number().int().min(0).max(59).default(0),
  daysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .default([0, 1, 2, 3, 4, 5, 6]),
  sortOrder: z.number().int().default(0),
})
export const toolCreateTimePhase =
  ({ db }: ToolDeps, user: User) =>
  (input: z.infer<typeof createTimePhaseInput>) => {
    assertGroupAccess(db, user, input.groupId)
    return createTimePhase(db, input)
  }

export const deleteTimePhaseInput = z.object({ phaseId: z.string() })
export const toolDeleteTimePhase =
  ({ db }: ToolDeps, user: User) =>
  (input: z.infer<typeof deleteTimePhaseInput>) => {
    assertPhaseAccess(db, user, input.phaseId)
    deleteTimePhase(db, input.phaseId)
    return { ok: true }
  }

// ── tasks ───────────────────────────────────────────────────────────────────

export const listTasksInput = z.object({
  childId: z.string().optional(),
  groupId: z.string().optional(),
})
export const toolListTasks =
  ({ db }: ToolDeps, user: User) =>
  (input: z.infer<typeof listTasksInput>) => {
    if (input.childId) {
      assertChildAccess(db, user, input.childId)
      return listTasksForChild(db, input.childId)
    }
    if (input.groupId) {
      assertGroupAccess(db, user, input.groupId)
      return listTasksForGroup(db, input.groupId)
    }
    throw authzError('Provide childId or groupId')
  }

export const listActiveTasksInput = z.object({ childId: z.string() })
export const toolListActiveTasks =
  ({ db }: ToolDeps, user: User) =>
  (input: z.infer<typeof listActiveTasksInput>) => {
    assertChildAccess(db, user, input.childId)
    return listActiveTasksForChild(db, input.childId, new Date())
  }

export const createTaskInput = z.object({
  childId: z.string(),
  title: z.string().min(1),
  timePhaseId: z.string().nullable().optional(),
  priority: z.number().int().default(0),
  points: z.number().int().min(0).default(0),
  recurrenceType: z.enum(['daily', 'weekly', 'once', 'none']).default('daily'),
  recurrenceDays: z.array(z.number().int().min(0).max(6)).nullable().optional(),
})
export const toolCreateTask =
  ({ db }: ToolDeps, user: User) =>
  (input: z.infer<typeof createTaskInput>) => {
    assertChildAccess(db, user, input.childId)
    if (input.timePhaseId) assertPhaseAccess(db, user, input.timePhaseId)
    return createTask(db, input)
  }

export const updateTaskInput = z.object({
  taskId: z.string(),
  title: z.string().min(1).optional(),
  timePhaseId: z.string().nullable().optional(),
  priority: z.number().int().optional(),
  points: z.number().int().min(0).optional(),
  recurrenceType: z.enum(['daily', 'weekly', 'once', 'none']).optional(),
  recurrenceDays: z.array(z.number().int().min(0).max(6)).nullable().optional(),
})
export const toolUpdateTask =
  ({ db }: ToolDeps, user: User) =>
  (input: z.infer<typeof updateTaskInput>) => {
    assertTaskAccess(db, user, input.taskId)
    if (input.timePhaseId) assertPhaseAccess(db, user, input.timePhaseId)
    const { taskId, ...updates } = input
    return updateTask(db, taskId, updates)
  }

export const deleteTaskInput = z.object({ taskId: z.string() })
export const toolDeleteTask =
  ({ db }: ToolDeps, user: User) =>
  (input: z.infer<typeof deleteTaskInput>) => {
    assertTaskAccess(db, user, input.taskId)
    deleteTask(db, input.taskId)
    return { ok: true }
  }

export const completeTaskInput = z.object({ taskId: z.string() })
export const toolCompleteTask =
  ({ db }: ToolDeps, user: User) =>
  (input: z.infer<typeof completeTaskInput>) => {
    assertTaskAccess(db, user, input.taskId)
    return completeTask(db, input.taskId)
  }

export const resetTaskInput = z.object({ taskId: z.string() })
export const toolResetTask =
  ({ db }: ToolDeps, user: User) =>
  (input: z.infer<typeof resetTaskInput>) => {
    assertTaskAccess(db, user, input.taskId)
    resetTask(db, input.taskId)
    return { ok: true }
  }

// ── rewards ─────────────────────────────────────────────────────────────────

export const listRewardsInput = z.object({ groupId: z.string() })
export const toolListRewards =
  ({ db }: ToolDeps, user: User) =>
  (input: z.infer<typeof listRewardsInput>) => {
    assertGroupAccess(db, user, input.groupId)
    return listRewards(db, input.groupId)
  }

export const createRewardInput = z.object({
  groupId: z.string(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  pointsCost: z.number().int().min(0),
})
export const toolCreateReward =
  ({ db }: ToolDeps, user: User) =>
  (input: z.infer<typeof createRewardInput>) => {
    assertGroupAccess(db, user, input.groupId)
    return createReward(db, input)
  }

export const deleteRewardInput = z.object({ rewardId: z.string() })
export const toolDeleteReward =
  ({ db }: ToolDeps, user: User) =>
  (input: z.infer<typeof deleteRewardInput>) => {
    assertRewardAccess(db, user, input.rewardId)
    deleteReward(db, input.rewardId)
    return { ok: true }
  }

export const redeemRewardInput = z.object({
  childId: z.string(),
  rewardId: z.string(),
})
export const toolRedeemReward =
  ({ db }: ToolDeps, user: User) =>
  (input: z.infer<typeof redeemRewardInput>) => {
    assertChildAccess(db, user, input.childId)
    assertRewardAccess(db, user, input.rewardId)
    return redeemReward(db, input.childId, input.rewardId)
  }

// ── points ──────────────────────────────────────────────────────────────────

export const getPointsBalanceInput = z.object({ childId: z.string() })
export const toolGetPointsBalance =
  ({ db }: ToolDeps, user: User) =>
  (input: z.infer<typeof getPointsBalanceInput>) => {
    assertChildAccess(db, user, input.childId)
    return {
      childId: input.childId,
      balance: getPointsBalance(db, input.childId),
    }
  }

export const listPointTransactionsInput = z.object({
  childId: z.string(),
  limit: z.number().int().min(1).max(500).default(50),
})
export const toolListPointTransactions =
  ({ db }: ToolDeps, user: User) =>
  (input: z.infer<typeof listPointTransactionsInput>) => {
    assertChildAccess(db, user, input.childId)
    return listPointTransactions(db, input.childId, input.limit)
  }

// ── dispatch + metadata ─────────────────────────────────────────────────────

type ToolDef = {
  name: string
  description: string
  input: z.ZodTypeAny
  run: (deps: ToolDeps, user: User, input: unknown) => unknown
}

export const TOOLS: ToolDef[] = [
  {
    name: 'list_groups',
    description:
      'List all family groups the current user is a member of. Call first when the user needs to select a group.',
    input: listGroupsInput,
    run: (deps, user) => toolListGroups(deps, user)(),
  },
  {
    name: 'create_group',
    description:
      'Create a new family group. Only call when the user explicitly asks to set up a new family.',
    input: createGroupInput,
    run: (deps, user, input) =>
      toolCreateGroup(deps, user)(createGroupInput.parse(input)),
  },
  {
    name: 'list_children',
    description: 'List all children in a group. Needs groupId.',
    input: listChildrenInput,
    run: (deps, user, input) =>
      toolListChildren(deps, user)(listChildrenInput.parse(input)),
  },
  {
    name: 'create_child',
    description:
      'Add a new child to a group. Needs groupId, name, and a color (hex string like #ff0000).',
    input: createChildInput,
    run: (deps, user, input) =>
      toolCreateChild(deps, user)(createChildInput.parse(input)),
  },
  {
    name: 'update_child',
    description:
      'Rename or recolor a child. Needs childId and at least one of name/color.',
    input: updateChildInput,
    run: (deps, user, input) =>
      toolUpdateChild(deps, user)(updateChildInput.parse(input)),
  },
  {
    name: 'delete_child',
    description:
      'Remove a child and all their tasks/completions. Use only when the user explicitly asks.',
    input: deleteChildInput,
    run: (deps, user, input) =>
      toolDeleteChild(deps, user)(deleteChildInput.parse(input)),
  },
  {
    name: 'list_time_phases',
    description:
      'List time phases (routines like "morning", "evening") for a group. Needs groupId.',
    input: listTimePhasesInput,
    run: (deps, user, input) =>
      toolListTimePhases(deps, user)(listTimePhasesInput.parse(input)),
  },
  {
    name: 'create_time_phase',
    description:
      'Create a recurring time phase (routine) for a group. Hours are 0-23. daysOfWeek uses 0=Sunday..6=Saturday.',
    input: createTimePhaseInput,
    run: (deps, user, input) =>
      toolCreateTimePhase(deps, user)(createTimePhaseInput.parse(input)),
  },
  {
    name: 'delete_time_phase',
    description:
      'Remove a time phase. Tasks that referenced it will no longer be scoped to a phase.',
    input: deleteTimePhaseInput,
    run: (deps, user, input) =>
      toolDeleteTimePhase(deps, user)(deleteTimePhaseInput.parse(input)),
  },
  {
    name: 'list_tasks',
    description:
      'List all tasks for a child or the whole group. Provide either childId or groupId.',
    input: listTasksInput,
    run: (deps, user, input) =>
      toolListTasks(deps, user)(listTasksInput.parse(input)),
  },
  {
    name: 'list_active_tasks',
    description:
      'List the tasks currently visible to a child (inside the active phase and not yet completed in this cycle).',
    input: listActiveTasksInput,
    run: (deps, user, input) =>
      toolListActiveTasks(deps, user)(listActiveTasksInput.parse(input)),
  },
  {
    name: 'create_task',
    description:
      'Create a task for a child. recurrenceType defaults to "daily". timePhaseId scopes visibility to a routine.',
    input: createTaskInput,
    run: (deps, user, input) =>
      toolCreateTask(deps, user)(createTaskInput.parse(input)),
  },
  {
    name: 'update_task',
    description: 'Update one or more fields of a task.',
    input: updateTaskInput,
    run: (deps, user, input) =>
      toolUpdateTask(deps, user)(updateTaskInput.parse(input)),
  },
  {
    name: 'delete_task',
    description: 'Delete a task. Use only when the user explicitly asks.',
    input: deleteTaskInput,
    run: (deps, user, input) =>
      toolDeleteTask(deps, user)(deleteTaskInput.parse(input)),
  },
  {
    name: 'complete_task',
    description:
      'Mark a task complete and award its points. Usually the child does this via the kiosk; use for overrides.',
    input: completeTaskInput,
    run: (deps, user, input) =>
      toolCompleteTask(deps, user)(completeTaskInput.parse(input)),
  },
  {
    name: 'reset_task',
    description: "Clear a task's last completion so it shows up again.",
    input: resetTaskInput,
    run: (deps, user, input) =>
      toolResetTask(deps, user)(resetTaskInput.parse(input)),
  },
  {
    name: 'list_rewards',
    description: 'List all rewards for a group.',
    input: listRewardsInput,
    run: (deps, user, input) =>
      toolListRewards(deps, user)(listRewardsInput.parse(input)),
  },
  {
    name: 'create_reward',
    description: 'Create a new reward with a points cost.',
    input: createRewardInput,
    run: (deps, user, input) =>
      toolCreateReward(deps, user)(createRewardInput.parse(input)),
  },
  {
    name: 'delete_reward',
    description: 'Delete a reward.',
    input: deleteRewardInput,
    run: (deps, user, input) =>
      toolDeleteReward(deps, user)(deleteRewardInput.parse(input)),
  },
  {
    name: 'redeem_reward',
    description:
      'Redeem a reward on behalf of a child. Fails if the child does not have enough points.',
    input: redeemRewardInput,
    run: (deps, user, input) =>
      toolRedeemReward(deps, user)(redeemRewardInput.parse(input)),
  },
  {
    name: 'get_points_balance',
    description: 'Get the current points balance for a child.',
    input: getPointsBalanceInput,
    run: (deps, user, input) =>
      toolGetPointsBalance(deps, user)(getPointsBalanceInput.parse(input)),
  },
  {
    name: 'list_point_transactions',
    description:
      'List recent point transactions for a child (earning and spending history).',
    input: listPointTransactionsInput,
    run: (deps, user, input) =>
      toolListPointTransactions(
        deps,
        user,
      )(listPointTransactionsInput.parse(input)),
  },
]

export const findTool = (name: string): ToolDef | undefined =>
  TOOLS.find((t) => t.name === name)

export const executeTool = (
  name: string,
  input: unknown,
  deps: ToolDeps,
  user: User,
): string => {
  const tool = findTool(name)
  if (!tool) return JSON.stringify({ error: `Unknown tool: ${name}` })
  try {
    const result = tool.run(deps, user, input)
    return JSON.stringify(result ?? { ok: true })
  } catch (err) {
    if (isAuthzError(err)) return JSON.stringify({ error: err.message })
    return JSON.stringify({ error: String(err) })
  }
}

export { authzError, isAuthzError }
