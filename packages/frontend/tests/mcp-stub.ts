/**
 * MCP-tool test stub backed by the `@family-todo/db` SQLite layer.
 *
 * A handful of integration tests seeded data by calling the MCP server's HTTP
 * tools (create_group / create_child / create_task / configure_phase_times /
 * reset_task) over supertest. The MCP package still targets PocketBase and
 * requires a live server, so — to keep these tests' assertions and coverage
 * intact while the app's backend is the SQLite layer — we re-implement exactly
 * those tools against `@family-todo/db`. The functions called here are the same
 * ones the MCP tools are built on (createGroup/createChild/createTask/...), so
 * the seeded data is identical. The returned shape mirrors the MCP JSON-RPC
 * response the tests parse (`result.content[0].text` containing `ID: <id>`).
 */

import {
  type DB,
  createGroup,
  createChild,
  createTask,
  configurePhaseTimes,
  resetTask,
} from '@family-todo/db'

type Args = Record<string, unknown>

interface McpResponse {
  result: { content: { type: 'text'; text: string }[] }
}

const ok = (text: string): McpResponse => ({
  result: { content: [{ type: 'text', text }] },
})

/**
 * Build an `mcpCall(token, toolName, args)`-compatible function bound to the
 * given db + acting user. The token is ignored (auth is handled elsewhere).
 */
export function createMcpCall(db: DB, userId: string) {
  return async (_token: string, toolName: string, args: Args): Promise<McpResponse> => {
    switch (toolName) {
      case 'create_group': {
        const group = createGroup(db, userId, String(args.name))
        return ok(`Created group "${group.name}" (ID: ${group.id})`)
      }
      case 'create_child': {
        const child = createChild(
          db,
          String(args.groupId),
          String(args.name),
          String(args.color ?? ''),
        )
        return ok(`Created child "${child.name}" (ID: ${child.id})`)
      }
      case 'create_task': {
        const { childId, ...rest } = args as { childId: string } & Args
        const task = createTask(db, String(childId), {
          title: String(rest.title),
          timeOfDay: String(rest.timeOfDay),
          priority: rest.priority as number | null | undefined,
          dueDate: rest.dueDate as string | null | undefined,
          recurrenceType: rest.recurrenceType as string | null | undefined,
          recurrenceInterval: rest.recurrenceInterval as number | null | undefined,
          recurrenceDays: rest.recurrenceDays as number[] | null | undefined,
          points: rest.points as number | null | undefined,
          isChore: rest.isChore as boolean | undefined,
          dailyOnly: rest.dailyOnly as boolean | undefined,
        })
        return ok(`Created task "${task.title}" (ID: ${task.id})`)
      }
      case 'configure_phase_times': {
        configurePhaseTimes(db, String(args.groupId), {
          morningEnd: args.morningEnd as string | undefined,
          eveningStart: args.eveningStart as string | undefined,
          timezone: args.timezone as string | undefined,
        })
        return ok('Phase times updated')
      }
      case 'reset_task': {
        resetTask(db, String(args.taskId), args.dueDate as string | undefined)
        return ok('Task reset')
      }
      default:
        throw new Error(`mcp-stub: unsupported tool ${toolName}`)
    }
  }
}
