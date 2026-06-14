import { beforeEach, describe, expect, it } from 'vitest'
import { generateEphemeralKeys, type JwtKeys, verifyToken } from './auth/jwt.ts'
import { type Db, openDb } from './db.ts'
import { findUserByEmail } from './domain/users.ts'

const GLOBAL_KEY = '__levino_todo_app_context__'

let db: Db
let keys: JwtKeys

/** Minimal Astro APIContext stand-in for the bits middleware touches. */
const makeContext = (headers: Record<string, string>) => {
  const cookies = new Map<string, { value: string; options: unknown }>()
  return {
    locals: {} as Record<string, unknown>,
    request: new Request('https://todos.levinkeller.de/', {
      headers: new Headers(headers),
    }),
    cookies: {
      set: (name: string, value: string, options: unknown) =>
        cookies.set(name, { value, options }),
      get: (name: string) => cookies.get(name),
    },
    _cookies: cookies,
  }
}

beforeEach(async () => {
  db = openDb(':memory:')
  keys = await generateEphemeralKeys()
  // Seed the cached app-context so getAppContext() inside the middleware
  // resolves to our in-memory db + ephemeral keys.
  ;(globalThis as Record<string, unknown>)[GLOBAL_KEY] = {
    db,
    keys,
    baseUrl: 'https://todos.levinkeller.de',
  }
})

describe('middleware proxy-header → JWT bridge', () => {
  it('mints a session cookie and user from X-Forwarded-Email', async () => {
    const { onRequest } = await import('./middleware.ts')
    const ctx = makeContext({
      'X-Forwarded-Email': 'Parent@Example.com',
      'X-Forwarded-Preferred-Username': 'Parent',
    })
    let nextCalled = false
    await onRequest(
      ctx as never,
      (async () => {
        nextCalled = true
        return new Response('ok')
      }) as never,
    )

    expect(nextCalled).toBe(true)
    // user upserted (email lower-cased) and attached to locals
    const stored = findUserByEmail(db, 'parent@example.com')
    expect(stored).not.toBeNull()
    expect(stored?.name).toBe('Parent')
    expect((ctx.locals.user as { email?: string }).email).toBe(
      'parent@example.com',
    )

    // a valid app JWT cookie was set
    const cookie = ctx._cookies.get('auth_token')
    expect(cookie).toBeDefined()
    const payload = await verifyToken(keys, cookie?.value ?? '')
    expect(payload?.sub).toBe(stored?.id)
    expect(payload?.email).toBe('parent@example.com')
  })

  it('uses an existing auth_token cookie and does NOT mint a new one', async () => {
    const { onRequest } = await import('./middleware.ts')
    const { signToken } = await import('./auth/jwt.ts')
    const existing = await signToken(keys, {
      sub: 'user-existing',
      email: 'old@example.com',
    })
    const ctx = makeContext({
      Cookie: `auth_token=${existing}`,
      'X-Forwarded-Email': 'someone-else@example.com',
    })
    await onRequest(ctx as never, (async () => new Response('ok')) as never)

    expect((ctx.locals.user as { sub?: string }).sub).toBe('user-existing')
    // no new cookie set, no bogus user created from the header
    expect(ctx._cookies.has('auth_token')).toBe(false)
    expect(findUserByEmail(db, 'someone-else@example.com')).toBeNull()
  })

  it('leaves user null when neither cookie nor proxy header is present', async () => {
    const { onRequest } = await import('./middleware.ts')
    const ctx = makeContext({})
    await onRequest(ctx as never, (async () => new Response('ok')) as never)
    expect(ctx.locals.user).toBeNull()
    expect(ctx._cookies.has('auth_token')).toBe(false)
  })
})
