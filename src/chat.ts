import Anthropic from '@anthropic-ai/sdk'
import { Hono } from 'hono'
import { stream } from 'hono/streaming'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { getBearerToken, type JwtKeys, verifyToken } from './auth/jwt.ts'
import type { Db } from './db.ts'
import { executeTool, TOOLS, type ToolDeps } from './tools.ts'

const SYSTEM_PROMPT = `Du bist der Admin-Assistent einer Family-Todo-App.

Parents (die Nutzer) verwalten Gruppen, Kinder, Tasks und Rewards ueber dich — es gibt keine klassische Admin-UI.
Beantworte Fragen direkt und praezise auf Deutsch.

Regeln:
- Rufe zuerst list_groups wenn der User noch keine Gruppe genannt hat.
- Fuer konkrete Aenderungen (anlegen, aendern, loeschen) bestaetige NICHT unnoetig — fuehre sie aus wenn der Wunsch klar ist.
- Erwaehne keine IDs in der Antwort, sofern der User nicht explizit danach fragt.
- Wenn eine Tool-Call einen "error" zurueckliefert, erklaer dem User was schiefgelaufen ist (nicht einfach den Fehlertext weiterreichen).
- Halte Antworten kurz.`

const TOOL_DEFINITIONS: Anthropic.Tool[] = TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  input_schema: zodToJsonSchema(tool.input, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  }) as Anthropic.Tool['input_schema'],
}))

export const makeChatRouter = (db: Db, keys: JwtKeys) => {
  const app = new Hono()
  const anthropic = new Anthropic()

  app.post('/api/chat', async (c) => {
    const token = getBearerToken(c.req.raw.headers)
    const user = token ? await verifyToken(keys, token) : null
    if (!user) return c.json({ error: 'Unauthorized' }, 401)

    const body = await c.req.json<{ message?: string }>()
    const userText = body.message?.trim()
    if (!userText) return c.json({ error: 'message required' }, 400)

    const deps: ToolDeps = { db }

    c.header('Content-Type', 'text/event-stream')
    c.header('Cache-Control', 'no-cache')
    c.header('X-Accel-Buffering', 'no')

    return stream(c, async (s) => {
      let currentMessages: Anthropic.MessageParam[] = [
        { role: 'user', content: userText },
      ]
      let remaining = 10

      while (remaining-- > 0) {
        const response = anthropic.messages.stream({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: currentMessages,
          tools: TOOL_DEFINITIONS,
        })

        for await (const event of response) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            await s.write(
              `data: ${JSON.stringify({ type: 'text', text: event.delta.text })}\n\n`,
            )
          }
        }

        const finalMsg = await response.finalMessage()
        const toolUseBlocks = finalMsg.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
        )

        if (toolUseBlocks.length === 0 || finalMsg.stop_reason !== 'tool_use') {
          await s.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
          return
        }

        const toolResults: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map(
          (use) => ({
            type: 'tool_result' as const,
            tool_use_id: use.id,
            content: executeTool(use.name, use.input, deps, user),
          }),
        )

        currentMessages = [
          ...currentMessages,
          { role: 'assistant', content: finalMsg.content },
          { role: 'user', content: toolResults },
        ]
      }

      await s.write(
        `data: ${JSON.stringify({ type: 'error', message: 'Max iterations reached' })}\n\n`,
      )
    })
  })

  return app
}
