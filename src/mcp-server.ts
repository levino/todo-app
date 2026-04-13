import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { Hono } from 'hono'
import type { z } from 'zod'
import { getBearerToken, type JwtKeys, verifyToken } from './auth/jwt.ts'
import type { Db } from './db.ts'
import { TOOLS, type ToolDeps, type User } from './tools.ts'

export const makeMcpRouter = (db: Db, keys: JwtKeys) => {
  const app = new Hono()

  app.all('/mcp', async (c) => {
    const token = getBearerToken(c.req.raw.headers)
    const user: User | null = token ? await verifyToken(keys, token) : null

    const server = new McpServer({
      name: 'levino-todo-app',
      version: '1.0.0',
    })
    const deps: ToolDeps = { db }

    const unauthorized = () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ error: 'Unauthorized' }),
        },
      ],
      isError: true,
    })

    for (const tool of TOOLS) {
      const shape =
        (tool.input as unknown as z.ZodObject<z.ZodRawShape>).shape ?? {}
      server.tool(
        tool.name,
        tool.description,
        shape,
        async (input: unknown) => {
          if (!user) return unauthorized()
          try {
            const result = tool.run(deps, user, input)
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(result ?? { ok: true }),
                },
              ],
            }
          } catch (err) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({ error: String(err) }),
                },
              ],
              isError: true,
            }
          }
        },
      )
    }

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    })
    await server.connect(transport)
    return transport.handleRequest(c.req.raw)
  })

  return app
}
