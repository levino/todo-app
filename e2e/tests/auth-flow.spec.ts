import { expect, test } from '@playwright/test'

/**
 * Full browser auth flow through the real stack:
 *   app → oauth2-proxy → dex login form → back to app (authenticated)
 *
 * This is the flow the user runs when connecting from the cloud and clicking
 * through the consent view. We drive it end-to-end and assert that the PWA
 * manifest never triggers the CORS error along the way.
 */
test('logs in via dex and reaches the app without a manifest CORS error', async ({
  page,
}) => {
  const corsErrors: string[] = []
  page.on('console', (msg) => {
    const text = msg.text()
    if (/Access-Control-Allow-Origin|blocked by CORS/i.test(text)) {
      corsErrors.push(text)
    }
  })
  page.on('requestfailed', (req) => {
    if (req.url().includes('/manifest.json')) {
      corsErrors.push(`manifest request failed: ${req.failure()?.errorText}`)
    }
  })

  // 1. Hit the app root → oauth2-proxy bounces us to the dex login form.
  await page.goto('/')
  await expect(page).toHaveURL(/dex:5556\/dex\/auth/)

  // 2. Submit dex's static-password login form.
  await page.fill('input[name="login"]', 'test@example.com')
  await page.fill('input[name="password"]', 'password')
  await page.click('button[type="submit"]')

  // 2b. dex shows a "Grant Access" consent screen — approve it (this mirrors
  // the real consent step when connecting from the cloud).
  const grant = page.getByRole('button', { name: /grant access/i })
  await grant.click({ timeout: 15_000 }).catch(() => {
    // skipApprovalScreen may already have bypassed it — that's fine.
  })

  // 3. dex → oauth2-proxy callback → back to the app.
  await page.waitForURL((url) => url.host === 'oauth2-proxy:4180', {
    timeout: 30_000,
  })
  // We are authenticated and NOT bounced to the IdP or the /login page.
  expect(new URL(page.url()).host).toBe('oauth2-proxy:4180')
  expect(page.url()).not.toContain('/login')

  // 4. The manifest loads cleanly inside the authenticated session.
  const manifestStatus = await page.evaluate(async () => {
    const res = await fetch('/manifest.json')
    return res.status
  })
  expect(manifestStatus).toBe(200)

  expect(corsErrors, 'no CORS / manifest errors expected').toEqual([])
})
