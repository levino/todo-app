import { describe, expect, it } from 'vitest'
import {
  exportPublicJwk,
  generateEphemeralKeys,
  getBearerToken,
  signToken,
  verifyToken,
} from './jwt.ts'

describe('jwt', () => {
  it('signs and verifies a round-trip', async () => {
    const keys = await generateEphemeralKeys()
    const token = await signToken(keys, { sub: 'user-1', email: 'a@b' })
    const payload = await verifyToken(keys, token)
    expect(payload).toEqual({ sub: 'user-1', email: 'a@b' })
  })

  it('verifyToken returns null for garbage', async () => {
    const keys = await generateEphemeralKeys()
    expect(await verifyToken(keys, 'nope')).toBeNull()
  })

  it('verifyToken rejects tokens signed with a different key', async () => {
    const a = await generateEphemeralKeys()
    const b = await generateEphemeralKeys()
    const token = await signToken(a, { sub: 'user-1' })
    expect(await verifyToken(b, token)).toBeNull()
  })

  it('exportPublicJwk emits kid and alg', async () => {
    const keys = await generateEphemeralKeys()
    const jwk = await exportPublicJwk(keys)
    expect(jwk.kid).toBeDefined()
    expect(jwk.alg).toBe('RS256')
    expect(jwk.use).toBe('sig')
    expect(jwk.kty).toBe('RSA')
  })
})

describe('getBearerToken', () => {
  it('reads Authorization header', () => {
    const h = new Headers({ Authorization: 'Bearer abc.def.ghi' })
    expect(getBearerToken(h)).toBe('abc.def.ghi')
  })

  it('reads auth_token cookie', () => {
    const h = new Headers({ Cookie: 'other=1; auth_token=xyz; foo=bar' })
    expect(getBearerToken(h)).toBe('xyz')
  })

  it('returns null when no token present', () => {
    expect(getBearerToken(new Headers())).toBeNull()
  })
})
