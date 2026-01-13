/**
 * Authentication Helpers
 *
 * Provides per-request PocketBase instances for secure auth handling.
 * Each request gets its own PocketBase instance to avoid sharing auth state.
 */

import PocketBase from 'pocketbase'
import { getPocketBaseUrl } from './pocketbase'

export interface AuthUser {
  id: string
  email: string
}

export interface AuthResult {
  valid: boolean
  user?: AuthUser
  pb: PocketBase
}

const AUTH_COOKIE_NAME = 'pb_auth'

/**
 * Create a new PocketBase client for this request.
 * Each request should get its own instance to prevent auth leakage between users.
 */
export function createRequestPocketBase(): PocketBase {
  return new PocketBase(getPocketBaseUrl())
}

/**
 * Validate authentication from the request cookie.
 * Returns an authenticated PocketBase instance if valid.
 *
 * @param cookieHeader - The Cookie header from the request
 * @returns AuthResult with validity, user info, and PocketBase instance
 */
export async function validateAuth(cookieHeader: string | null): Promise<AuthResult> {
  const pb = createRequestPocketBase()

  if (!cookieHeader) {
    return { valid: false, pb }
  }

  try {
    // Load the auth token from the cookie into this PocketBase instance
    pb.authStore.loadFromCookie(cookieHeader)

    if (!pb.authStore.isValid) {
      return { valid: false, pb }
    }

    // Validate and refresh the token by calling authRefresh
    // This also updates the authStore with fresh user data
    const authData = await pb.collection('users').authRefresh()

    const user: AuthUser = {
      id: authData.record.id,
      email: authData.record.email,
    }

    return { valid: true, user, pb }
  } catch {
    // Auth refresh failed - token is invalid or expired
    pb.authStore.clear()
    return { valid: false, pb }
  }
}

/**
 * Create a Set-Cookie header value for storing auth in an HTTP-only cookie.
 *
 * @param pb - The PocketBase instance with auth state to export
 * @returns Set-Cookie header value
 */
export function createAuthCookie(pb: PocketBase): string {
  return pb.authStore.exportToCookie({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
  })
}

/**
 * Create a Set-Cookie header value that clears the auth cookie.
 *
 * @returns Set-Cookie header value that expires the cookie
 */
export function clearAuthCookie(): string {
  return `${AUTH_COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly`
}
