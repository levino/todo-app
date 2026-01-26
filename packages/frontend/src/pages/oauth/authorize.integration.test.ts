/**
 * OAuth Authorize Page Integration Tests
 *
 * Tests the frontend OAuth authorization flow:
 * - Consent page rendering
 * - Client validation
 * - Login redirect for unauthenticated users
 * - Authorization code generation
 */

import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import PocketBase from 'pocketbase'
import AuthorizePage from './authorize.astro'
import { createRandomUser, POCKETBASE_URL } from '../../../tests/pocketbase'

// Mock client data
const mockClientId = 'test-client-id-12345'
const redirectUri = 'https://example.com/callback'

// Mock fetch for MCP server calls
const originalFetch = global.fetch
function mockFetch(url: string | URL | Request, init?: RequestInit) {
  const urlStr = url.toString()

  // Mock GET /oauth/client/:id
  if (urlStr.includes(`/oauth/client/${mockClientId}`)) {
    return Promise.resolve(new Response(JSON.stringify({
      client_id: mockClientId,
      client_name: 'Test OAuth Client',
      redirect_uris: [redirectUri],
    }), { status: 200 }))
  }

  // Mock GET /oauth/client/unknown-client
  if (urlStr.includes('/oauth/client/unknown-client')) {
    return Promise.resolve(new Response(JSON.stringify({
      error: 'invalid_client',
      error_description: 'Client not found',
    }), { status: 404 }))
  }

  // Mock POST /oauth/authorize (code generation)
  if (urlStr.includes('/oauth/authorize') && init?.method === 'POST') {
    const body = JSON.parse(init.body as string)
    return Promise.resolve(new Response(JSON.stringify({
      code: 'test-auth-code-xyz',
      redirect_url: `${body.redirect_uri}?code=test-auth-code-xyz${body.state ? `&state=${body.state}` : ''}`,
    }), { status: 200 }))
  }

  // Fall back to original fetch for PocketBase calls
  return originalFetch(url, init)
}

describe('OAuth Authorize Page', () => {
  let userPb: Awaited<ReturnType<typeof createRandomUser>>
  let container: AstroContainer

  beforeEach(async () => {
    // Mock fetch
    global.fetch = mockFetch as typeof fetch

    userPb = await createRandomUser()

    container = await AstroContainer.create()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  describe('Unauthenticated User', () => {
    it('should redirect to login with next parameter', async () => {
      const unauthPb = new PocketBase(POCKETBASE_URL)
      const authorizeUrl = `/oauth/authorize?client_id=${mockClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&code_challenge=test-challenge-that-is-43-chars-minimum`

      const response = await container.renderToResponse(AuthorizePage, {
        request: new Request(`http://localhost:4321${authorizeUrl}`),
        locals: { pb: unauthPb, user: undefined },
      })

      expect(response.status).toBe(302)
      const location = response.headers.get('Location')
      expect(location).toContain('/login')
      expect(location).toContain('next=')
    })
  })

  describe('Authenticated User', () => {
    it('should render consent page for valid client', async () => {
      const authorizeUrl = `/oauth/authorize?client_id=${mockClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&code_challenge=test-challenge-that-is-43-chars-minimum`

      const response = await container.renderToResponse(AuthorizePage, {
        request: new Request(`http://localhost:4321${authorizeUrl}`),
        locals: { pb: userPb, user: userPb.authStore.record },
      })

      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('Test OAuth Client')
      expect(html).toContain('Zugriff autorisieren')
      expect(html).toContain('Zugriff erlauben')
    })

    it('should show error for missing client_id', async () => {
      const authorizeUrl = `/oauth/authorize?redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&code_challenge=test-challenge`

      const response = await container.renderToResponse(AuthorizePage, {
        request: new Request(`http://localhost:4321${authorizeUrl}`),
        locals: { pb: userPb, user: userPb.authStore.record },
      })

      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('Fehler')
      expect(html).toContain('client_id')
    })

    it('should show error for missing redirect_uri', async () => {
      const authorizeUrl = `/oauth/authorize?client_id=${mockClientId}&response_type=code&code_challenge=test-challenge`

      const response = await container.renderToResponse(AuthorizePage, {
        request: new Request(`http://localhost:4321${authorizeUrl}`),
        locals: { pb: userPb, user: userPb.authStore.record },
      })

      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('Fehler')
      expect(html).toContain('redirect_uri')
    })

    it('should show error for invalid response_type', async () => {
      const authorizeUrl = `/oauth/authorize?client_id=${mockClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&code_challenge=test-challenge`

      const response = await container.renderToResponse(AuthorizePage, {
        request: new Request(`http://localhost:4321${authorizeUrl}`),
        locals: { pb: userPb, user: userPb.authStore.record },
      })

      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('Fehler')
      expect(html).toContain('response_type')
    })

    it('should show error for missing code_challenge (PKCE required)', async () => {
      const authorizeUrl = `/oauth/authorize?client_id=${mockClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`

      const response = await container.renderToResponse(AuthorizePage, {
        request: new Request(`http://localhost:4321${authorizeUrl}`),
        locals: { pb: userPb, user: userPb.authStore.record },
      })

      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('Fehler')
      expect(html).toContain('code_challenge')
    })

    it('should show error for unknown client_id', async () => {
      const authorizeUrl = `/oauth/authorize?client_id=unknown-client&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&code_challenge=test-challenge-that-is-43-chars-minimum`

      const response = await container.renderToResponse(AuthorizePage, {
        request: new Request(`http://localhost:4321${authorizeUrl}`),
        locals: { pb: userPb, user: userPb.authStore.record },
      })

      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('Fehler')
      expect(html).toContain('Unknown client')
    })

    it('should show error for unregistered redirect_uri', async () => {
      const authorizeUrl = `/oauth/authorize?client_id=${mockClientId}&redirect_uri=${encodeURIComponent('https://evil.com/callback')}&response_type=code&code_challenge=test-challenge-that-is-43-chars-minimum`

      const response = await container.renderToResponse(AuthorizePage, {
        request: new Request(`http://localhost:4321${authorizeUrl}`),
        locals: { pb: userPb, user: userPb.authStore.record },
      })

      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('Fehler')
      expect(html).toContain('redirect_uri')
    })
  })

  describe('Form Submission (Consent Approval)', () => {
    it('should generate auth code and redirect on approval', async () => {
      const codeChallenge = 'test-challenge-that-is-at-least-43-characters-long'
      const state = 'test-state-123'
      const authorizeUrl = `/oauth/authorize?client_id=${mockClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&code_challenge=${codeChallenge}&state=${state}`

      // Simulate POST request (form submission)
      const response = await container.renderToResponse(AuthorizePage, {
        request: new Request(`http://localhost:4321${authorizeUrl}`, {
          method: 'POST',
        }),
        locals: { pb: userPb, user: userPb.authStore.record },
      })

      // Should redirect with auth code
      expect(response.status).toBe(302)
      const location = response.headers.get('Location')
      expect(location).toContain(redirectUri)
      expect(location).toContain('code=')
      expect(location).toContain('state=test-state-123')
    })
  })
})
