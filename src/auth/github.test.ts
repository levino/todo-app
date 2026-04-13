import { describe, expect, it } from 'vitest'
import { buildAuthUrl, randomState } from './github.ts'

describe('github auth url', () => {
  it('includes client id, redirect uri, scope, state', () => {
    const url = buildAuthUrl(
      {
        clientId: 'id123',
        clientSecret: 'sec',
        redirectUri: 'https://example.test/cb',
      },
      'state-abc',
    )
    const parsed = new URL(url)
    expect(parsed.origin).toBe('https://github.com')
    expect(parsed.pathname).toBe('/login/oauth/authorize')
    expect(parsed.searchParams.get('client_id')).toBe('id123')
    expect(parsed.searchParams.get('redirect_uri')).toBe(
      'https://example.test/cb',
    )
    expect(parsed.searchParams.get('state')).toBe('state-abc')
    expect(parsed.searchParams.get('scope')).toBe('read:user user:email')
  })

  it('randomState yields different values', () => {
    expect(randomState()).not.toBe(randomState())
  })
})
