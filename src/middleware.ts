import { defineMiddleware } from 'astro:middleware'
import { validateAuth, createRequestPocketBase } from './lib/auth'

// Public paths that don't require authentication
const publicPaths = ['/login', '/signup', '/api/auth/', '/api/health']

export const onRequest = defineMiddleware(async (context, next) => {
  // Skip auth entirely in test environment
  if (import.meta.env.DISABLE_AUTH === 'true') {
    // Still provide a PocketBase instance for tests
    context.locals.pb = createRequestPocketBase()
    return next()
  }

  const path = new URL(context.request.url).pathname

  // Skip auth for public paths
  if (publicPaths.some((p) => path.startsWith(p))) {
    // Provide an unauthenticated PocketBase instance for public routes
    context.locals.pb = createRequestPocketBase()
    return next()
  }

  // Validate authentication from cookie
  const cookieHeader = context.request.headers.get('Cookie')
  const { valid, user, pb } = await validateAuth(cookieHeader)

  // Attach the per-request PocketBase instance to locals
  // This instance has the user's auth loaded if valid
  context.locals.pb = pb

  if (!valid) {
    // Redirect to login if not authenticated
    return context.redirect('/login')
  }

  // Attach user info to locals for use in pages
  context.locals.user = user

  // Group membership is enforced by PocketBase collection rules, not here.
  // The pb instance is authenticated, so PocketBase will apply the rules.

  return next()
})
