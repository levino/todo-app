import type { APIRoute } from 'astro'

/**
 * Password login is no longer handled by the app: the oauth2-proxy gatekeeper
 * in front of the app performs authentication and injects the verified identity
 * via request headers (see middleware.ts). This endpoint is therefore
 * unreachable in production (the proxy gates `/api/auth/*`), but is kept so the
 * route does not 404 during local/dev access. It simply redirects to the target
 * (validated `next` to prevent open redirect) or the home page, where the
 * middleware resolves identity from the proxy headers.
 */
export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData()
  const next = formData.get('next')?.toString()

  let redirectTo = '/'
  if (next && next.startsWith('/') && !next.startsWith('//')) {
    redirectTo = next
  }

  return redirect(redirectTo)
}
