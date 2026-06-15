import { defineMiddleware } from 'astro:middleware'
import { upsertUserByEmail } from '@family-todo/db'
import { getDatabase } from './lib/db'

// Public paths that don't require authentication.
// Note: /api/mcp handles its own auth via Bearer token.
const publicPaths = ['/login', '/signup', '/api/auth/', '/api/health', '/api/mcp']

// Paths that resolve auth but don't redirect (handle their own login flow).
const softAuthPaths = ['/oauth/']

/**
 * Authentication is performed by the oauth2-proxy gatekeeper that sits in front
 * of this app. On every authenticated request it injects a trusted, verified
 * identity via request headers:
 *   - `X-Forwarded-Email`               → the user's verified email (identity)
 *   - `X-Forwarded-Preferred-Username`  → the display name (optional)
 * We trust those headers (the proxy is the only ingress) and upsert the user in
 * the SQLite store, then attach `context.locals.user` in exactly the same shape
 * the pages already consume ({ id, email }).
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const path = new URL(context.request.url).pathname

  // The SQLite data-layer connection is always available on locals.
  const db = getDatabase()
  context.locals.db = db

  // Skip auth for public paths.
  if (publicPaths.some((p) => path.startsWith(p))) {
    return next()
  }

  // Identity comes from the trusted proxy header.
  const email = context.request.headers.get('X-Forwarded-Email')
  const name = context.request.headers.get('X-Forwarded-Preferred-Username')

  const user = email
    ? (() => {
        const row = upsertUserByEmail(db, email, name ?? undefined)
        return { id: row.id, email: row.email }
      })()
    : undefined

  // For soft auth paths, don't redirect - let the page handle it.
  if (softAuthPaths.some((p) => path.startsWith(p))) {
    if (user) {
      context.locals.user = user
    }
    return next()
  }

  if (!user) {
    // No verified identity from the proxy → send to login.
    return context.redirect('/login')
  }

  context.locals.user = user

  // Per-user/group data scoping is enforced in pages/actions via the
  // `@family-todo/db` membership helpers (isUserInGroup / getUserGroups),
  // mirroring the access the PocketBase collection rules used to grant.

  return next()
})
