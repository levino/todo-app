import type { APIRoute } from 'astro'
import { clearAuthCookie } from '@/lib/auth'

export const POST: APIRoute = async () => {
  // Clear the auth cookie and redirect to login
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/login',
      'Set-Cookie': clearAuthCookie(),
    },
  })
}
