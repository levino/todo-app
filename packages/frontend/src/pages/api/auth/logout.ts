import type { APIRoute } from 'astro'
import { clearAuthCookie } from '@/lib/auth'

/**
 * Logout clears any stale legacy auth cookie and hands off to the oauth2-proxy
 * sign-out endpoint, which terminates the proxy session (the real auth state).
 */
export const POST: APIRoute = async () => {
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/oauth2/sign_out',
      'Set-Cookie': clearAuthCookie(),
    },
  })
}
