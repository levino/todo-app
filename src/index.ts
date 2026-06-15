import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { RequestHandler } from 'express'
import express from 'express'
import type { Hono } from 'hono'
import { getAppContext } from './app-context.ts'
import { makeAuthRouter } from './auth/routes.ts'
import { makeChatRouter } from './chat.ts'
import { makeMcpRouter } from './mcp-server.ts'

const { db, keys, baseUrl: BASE_URL } = await getAppContext()
const PORT = Number(process.env.PORT ?? 3000)

const honoToExpress =
  (honoApp: Hono): RequestHandler =>
  async (req, res) => {
    const url = `${BASE_URL}${req.originalUrl}`
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) for (const vv of v) headers.append(k, vv)
      else if (v != null) headers.set(k, String(v))
    }
    const init: RequestInit & { duplex?: 'half' } = {
      method: req.method,
      headers,
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = req as unknown as BodyInit
      init.duplex = 'half'
    }
    const webReq = new Request(url, init)
    const webRes = await honoApp.fetch(webReq)
    res.status(webRes.status)
    webRes.headers.forEach((value, key) => {
      res.setHeader(key, value)
    })
    if (!webRes.body) {
      res.end()
      return
    }
    const reader = webRes.body.getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      res.write(Buffer.from(value))
    }
    res.end()
  }

const app = express()

const mcpRouter = makeMcpRouter(db, keys)
const chatRouter = makeChatRouter(db, keys)
const authRouter = makeAuthRouter(db, keys, {
  baseUrl: BASE_URL,
})

app.use('/mcp', honoToExpress(mcpRouter))
app.use('/api', honoToExpress(chatRouter))
app.use('/auth', honoToExpress(authRouter))

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

const SERVER_ENTRY = new URL('../dist/server/entry.mjs', import.meta.url)
const CLIENT_DIR = fileURLToPath(new URL('../dist/client/', import.meta.url))

if (existsSync(CLIENT_DIR)) {
  app.use(express.static(CLIENT_DIR))
  try {
    const mod = await import(SERVER_ENTRY.href)
    if (typeof mod.handler === 'function') {
      app.use(mod.handler as RequestHandler)
    }
  } catch {
    // built client assets but no server entry — unusual; skip.
  }
} else {
  app.get('/', (_req, res) => {
    res
      .type('text/plain')
      .send(
        'API running on :3000. Run `astro dev` separately for the frontend (4321).',
      )
  })
}

app.listen(PORT, () => {
  console.log(`levino-todo-app listening on :${PORT}`)
  console.log(
    '(Login via oauth2-proxy/ZITADEL: sessions are minted from the X-Forwarded-Email header)',
  )
})
