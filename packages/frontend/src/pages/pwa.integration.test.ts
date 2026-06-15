import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeAll } from 'vitest'
import LoginPage from './login.astro'

describe('PWA Support', () => {
  let container: AstroContainer

  beforeAll(async () => {
    container = await AstroContainer.create()
  })

  it('should include manifest link in the HTML head', async () => {
    const html = await container.renderToString(LoginPage)
    expect(html).toContain('<link rel="manifest" href="/manifest.json"')
  })

  it('should include apple-mobile-web-app-capable meta tag', async () => {
    const html = await container.renderToString(LoginPage)
    expect(html).toContain(
      '<meta name="apple-mobile-web-app-capable" content="yes"',
    )
  })

  it('should include apple-mobile-web-app-status-bar-style meta tag', async () => {
    const html = await container.renderToString(LoginPage)
    expect(html).toContain(
      '<meta name="apple-mobile-web-app-status-bar-style" content="default"',
    )
  })

  it('should include theme-color meta tag', async () => {
    const html = await container.renderToString(LoginPage)
    expect(html).toContain('<meta name="theme-color"')
  })
})
