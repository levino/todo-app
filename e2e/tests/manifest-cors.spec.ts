import { expect, test } from '@playwright/test'

/**
 * Regression test for the PWA-manifest CORS bug.
 *
 * The frontend sits behind oauth2-proxy, which 302-redirects unauthenticated
 * requests to the OIDC provider (dex here, ZITADEL in prod). The browser
 * fetches the PWA manifest WITHOUT credentials by default, so without an
 * exemption `/manifest.json` was redirected cross-origin to the IdP and the
 * browser blocked it with a CORS error (no Access-Control-Allow-Origin).
 *
 * These tests hit the REAL oauth2-proxy + dex stack at the HTTP layer.
 */
test.describe('PWA assets are exempt from the oauth2-proxy gatekeeper', () => {
  test('GET /manifest.json is served (200), not redirected to the IdP', async ({
    request,
  }) => {
    const res = await request.get('/manifest.json', { maxRedirects: 0 })

    expect(
      res.status(),
      'manifest must be served directly, not 302→IdP',
    ).toBe(200)

    const body = await res.json()
    expect(body.name).toBe('Familien ToDo')
  })

  test('GET /icon-192.svg is served (200), not redirected', async ({
    request,
  }) => {
    const res = await request.get('/icon-192.svg', { maxRedirects: 0 })
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('image/svg+xml')
  })

  test('control: a protected path IS still gated (302 → dex)', async ({
    request,
  }) => {
    // Proves the gatekeeper is actually active, so the 200s above are a real
    // exemption and not just an unauthenticated app.
    const res = await request.get('/', { maxRedirects: 0 })

    expect(res.status(), 'protected path should redirect').toBeGreaterThanOrEqual(300)
    expect(res.status()).toBeLessThan(400)

    const location = res.headers()['location'] ?? ''
    expect(location, 'should bounce to the OIDC provider').toContain('dex:5556')
  })
})
