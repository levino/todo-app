import type { APIRoute } from 'astro'

/**
 * Account creation is no longer handled by the app: the oauth2-proxy gatekeeper
 * authenticates the user and the middleware upserts the corresponding record in
 * the SQLite store on first request (see middleware.ts + upsertUserByEmail).
 * This endpoint is unreachable in production (the proxy gates `/api/auth/*`); it
 * is kept as a harmless redirect so the route does not 404.
 */
export const POST: APIRoute = async ({ redirect }) => {
  return redirect('/settings/groups')
}
