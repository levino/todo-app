import { defineMiddleware } from 'astro:middleware'
import { getAppContext } from './app-context.ts'
import { getBearerToken, signToken, verifyToken } from './auth/jwt.ts'
import { upsertUserByEmail } from './domain/users.ts'

const AUTH_COOKIE = 'auth_token'
const SESSION_TTL = '7d'
const SESSION_MAX_AGE = 60 * 60 * 24 * 7

/**
 * Browser/session auth path.
 *
 * Identity comes exclusively from the oauth2-proxy gatekeeper sitting in front
 * of this process: it authenticates the user against ZITADEL and injects
 * `X-Forwarded-Email` (+ `X-Forwarded-Preferred-Username`). The app itself is
 * NOT an OIDC client — it trusts these headers because the proxy is the only
 * ingress path to the browser routes.
 *
 * Flow:
 *   1. If a valid `auth_token` JWT cookie already exists, use it (fast path,
 *      and it keeps MCP bearer + downstream code unchanged).
 *   2. Otherwise, read the proxy header, upsert the user by email, mint the
 *      app's own RS256 JWT and set it as the `auth_token` cookie — exactly the
 *      same session the GitHub/magic-link callbacks used to issue.
 *
 * Note: `/mcp` is served by Express before Astro and is excluded from the proxy
 * (`--skip-auth-route=^/mcp`), so the bearer-token flow used by Claude never
 * relies on this middleware or on the proxy header.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { db, keys, baseUrl } = await getAppContext()
  context.locals.db = db

  // 1. Existing app session cookie (or Authorization bearer) wins.
  const token = getBearerToken(context.request.headers)
  let user = token ? await verifyToken(keys, token) : null

  // 2. No app session yet — bootstrap one from the trusted proxy header.
  if (!user) {
    const email = context.request.headers
      .get('X-Forwarded-Email')
      ?.trim()
      .toLowerCase()
    if (email) {
      const name =
        context.request.headers.get('X-Forwarded-Preferred-Username')?.trim() ||
        null
      const record = upsertUserByEmail(db, { email, name })
      const session = await signToken(
        keys,
        { sub: record.id, email: record.email },
        { issuer: baseUrl, expiresIn: SESSION_TTL },
      )
      context.cookies.set(AUTH_COOKIE, session, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: baseUrl.startsWith('https://'),
        maxAge: SESSION_MAX_AGE,
      })
      user = { sub: record.id, email: record.email }
    }
  }

  context.locals.user = user

  return next()
})
