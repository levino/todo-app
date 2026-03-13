import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach } from 'vitest'
import Layout from '../../src/layouts/Layout.astro'

describe('View Transitions', () => {
  let container: AstroContainer

  beforeEach(async () => {
    container = await AstroContainer.create()
  })

  it('should include Astro view transitions meta tag in the rendered HTML', async () => {
    const result = await container.renderToString(Layout, {
      props: { title: 'Test Page' },
    })

    // Astro's ViewTransitions component adds this meta tag to enable client-side transitions
    expect(result).toContain('name="astro-view-transitions-enabled"')
  })
})
