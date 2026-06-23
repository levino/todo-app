import type { Page } from '@playwright/test'

/**
 * Drives the dex static-password login + grant screen so the browser ends up
 * with a valid oauth2-proxy session cookie. Call from a page that has just been
 * (or is about to be) redirected to dex.
 */
export async function loginViaDex(page: Page) {
  await page.fill('input[name="login"]', 'test@example.com')
  await page.fill('input[name="password"]', 'password')
  await page.click('button[type="submit"]')

  // dex shows a "Grant Access" consent screen (skipApprovalScreen may bypass it).
  const grant = page.getByRole('button', { name: /grant access/i })
  await grant.click({ timeout: 15_000 }).catch(() => {})
}

/** Captures CORS / manifest failures seen in the browser console + network. */
export function trackCorsErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    const text = msg.text()
    if (/Access-Control-Allow-Origin|blocked by CORS/i.test(text)) {
      errors.push(text)
    }
  })
  page.on('requestfailed', (req) => {
    const failure = req.failure()?.errorText ?? ''
    if (/cors|access control|ERR_FAILED/i.test(failure)) {
      errors.push(`${req.url()} failed: ${failure}`)
    }
  })
  return errors
}
