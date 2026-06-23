import crypto from 'node:crypto'
import { expect, request, test } from '@playwright/test'
import { loginViaDex, trackCorsErrors } from './helpers'

/**
 * Reproduces the OAuth consent → cross-origin callback bug end-to-end.
 *
 * When an MCP client (claude.ai) authorizes, the consent form's POST returns a
 * redirect to the client's callback on a DIFFERENT origin. Astro's ClientRouter
 * submits forms via fetch() by default, which follows that redirect
 * cross-origin and is blocked by CORS — the authorization code never reaches
 * the callback. `data-astro-reload` on the form forces a top-level navigation,
 * for which CORS does not apply.
 *
 * Here `callback` (nginx on :9000) stands in for claude.ai's callback origin.
 */

const MCP_URL = process.env.MCP_URL || 'http://mcp:3001'
const CALLBACK_URL = process.env.CALLBACK_URL || 'http://callback:9000'
const REDIRECT_URI = `${CALLBACK_URL}/api/mcp/auth_callback`

const base64url = (buf: Buffer) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

test('completes the OAuth consent redirect to a cross-origin callback (no CORS)', async ({
  page,
}) => {
  const corsErrors = trackCorsErrors(page)

  // 1. Register an MCP OAuth client (RFC 7591 dynamic registration) whose
  //    redirect_uri lives on the cross-origin callback host.
  const api = await request.newContext()
  const reg = await api.post(`${MCP_URL}/oauth/register`, {
    data: {
      client_name: 'E2E Test Client',
      redirect_uris: [REDIRECT_URI],
    },
  })
  expect(reg.status(), await reg.text()).toBe(201)
  const { client_id } = await reg.json()
  expect(client_id).toBeTruthy()

  // 2. PKCE pair (S256).
  const verifier = base64url(crypto.randomBytes(48))
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest())
  const state = 'e2e-state-123'

  // 3. Authenticate the browser session via dex first.
  await page.goto('/')
  await expect(page).toHaveURL(/dex:5556\/dex\/auth/)
  await loginViaDex(page)
  await page.waitForURL((url) => url.host === 'oauth2-proxy:4180', { timeout: 30_000 })

  // 4. Open the authorization endpoint (the consent UI) with the client's params.
  const authorizeUrl =
    '/oauth/authorize?' +
    new URLSearchParams({
      response_type: 'code',
      client_id,
      redirect_uri: REDIRECT_URI,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      scope: 'mcp:tools',
    }).toString()
  await page.goto(authorizeUrl)

  // The consent screen shows our registered client name.
  await expect(page.getByText('E2E Test Client')).toBeVisible()

  // 5. Approve — this is the cross-origin redirect that used to CORS-fail.
  await page.getByRole('button', { name: /zugriff erlauben/i }).click()

  // 6. The browser must land on the cross-origin callback with the auth code.
  await page.waitForURL(
    (url) => url.host === 'callback:9000' && url.searchParams.has('code'),
    { timeout: 30_000 },
  )
  const landed = new URL(page.url())
  expect(landed.host).toBe('callback:9000')
  expect(landed.pathname).toBe('/api/mcp/auth_callback')
  expect(landed.searchParams.get('code')).toBeTruthy()
  expect(landed.searchParams.get('state')).toBe(state)

  expect(corsErrors, 'no CORS errors during the consent redirect').toEqual([])

  await api.dispose()
})
