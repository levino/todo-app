/**
 * Authentication Helpers
 *
 * Authentication is handled by the oauth2-proxy gatekeeper in front of the app
 * (see middleware.ts), which injects the verified identity via request headers.
 * The app itself no longer performs password login, so the previous
 * PocketBase-backed helpers are gone. The `AuthUser` shape is kept identical so
 * `context.locals.user` is unchanged for the pages that consume it.
 */

export interface AuthUser {
  id: string
  email: string
}

const AUTH_COOKIE_NAME = 'pb_auth'

/**
 * Create a Set-Cookie header value that clears the legacy auth cookie. Kept so
 * the (now proxy-fronted) logout flow can still defensively clear any stale
 * cookie before redirecting to the proxy's sign-out endpoint.
 */
export function clearAuthCookie(): string {
  return `${AUTH_COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly`
}
