/**
 * OAuth JWT Module Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { rmSync, existsSync } from 'node:fs'
import {
  initKeys,
  signAccessToken,
  verifyAccessToken,
  getPublicKeyJWK,
  getJWKS,
  verifyCodeChallenge,
  generateCodeChallenge,
} from './jwt.js'

const TEST_KEY_PATH = './test-data/oauth-keys-test'
const ISSUER = 'https://test.example.com'
const AUDIENCE = 'test-audience'

describe('OAuth JWT', () => {
  beforeAll(async () => {
    // Clean up any existing test keys
    if (existsSync(TEST_KEY_PATH)) {
      rmSync(TEST_KEY_PATH, { recursive: true })
    }
    // Initialize keys
    await initKeys(TEST_KEY_PATH)
  })

  afterAll(() => {
    // Clean up test keys
    if (existsSync(TEST_KEY_PATH)) {
      rmSync(TEST_KEY_PATH, { recursive: true })
    }
  })

  describe('Key Management', () => {
    it('should generate and persist keys', () => {
      expect(existsSync(`${TEST_KEY_PATH}/private.pem`)).toBe(true)
      expect(existsSync(`${TEST_KEY_PATH}/public.pem`)).toBe(true)
    })

    it('should return public key as JWK', () => {
      const jwk = getPublicKeyJWK()

      expect(jwk.kty).toBe('RSA')
      expect(jwk.alg).toBe('RS256')
      expect(jwk.use).toBe('sig')
      expect(jwk.kid).toBeDefined()
      expect(jwk.n).toBeDefined() // modulus
      expect(jwk.e).toBeDefined() // exponent
      expect(jwk.d).toBeUndefined() // private component should not be present
    })

    it('should return JWKS with public key', () => {
      const jwks = getJWKS()

      expect(jwks.keys).toHaveLength(1)
      expect(jwks.keys[0].kty).toBe('RSA')
    })
  })

  describe('Access Tokens', () => {
    it('should sign and verify an access token', async () => {
      const payload = {
        sub: 'user-123',
        client_id: 'client-456',
        scope: 'mcp:tools',
      }

      const token = await signAccessToken(payload, ISSUER, AUDIENCE)
      expect(token).toBeDefined()
      expect(token.split('.')).toHaveLength(3) // JWT has 3 parts

      const claims = await verifyAccessToken(token, ISSUER, AUDIENCE)
      expect(claims).not.toBeNull()
      expect(claims!.sub).toBe('user-123')
      expect(claims!.client_id).toBe('client-456')
      expect(claims!.scope).toBe('mcp:tools')
      expect(claims!.iss).toBe(ISSUER)
      expect(claims!.aud).toBe(AUDIENCE)
    })

    it('should reject token with wrong issuer', async () => {
      const payload = { sub: 'user-123', client_id: 'client-456' }
      const token = await signAccessToken(payload, ISSUER, AUDIENCE)

      const claims = await verifyAccessToken(token, 'https://wrong.example.com', AUDIENCE)
      expect(claims).toBeNull()
    })

    it('should reject token with wrong audience', async () => {
      const payload = { sub: 'user-123', client_id: 'client-456' }
      const token = await signAccessToken(payload, ISSUER, AUDIENCE)

      const claims = await verifyAccessToken(token, ISSUER, 'wrong-audience')
      expect(claims).toBeNull()
    })

    it('should reject expired token', async () => {
      const payload = { sub: 'user-123', client_id: 'client-456' }
      // Create token that expires in 1 second
      const token = await signAccessToken(payload, ISSUER, AUDIENCE, 1)

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100))

      const claims = await verifyAccessToken(token, ISSUER, AUDIENCE)
      expect(claims).toBeNull()
    })

    it('should reject invalid token', async () => {
      const claims = await verifyAccessToken('invalid-token', ISSUER, AUDIENCE)
      expect(claims).toBeNull()
    })

    it('should reject tampered token', async () => {
      const payload = { sub: 'user-123', client_id: 'client-456' }
      const token = await signAccessToken(payload, ISSUER, AUDIENCE)

      // Tamper with the token
      const parts = token.split('.')
      parts[1] = parts[1] + 'tampered'
      const tamperedToken = parts.join('.')

      const claims = await verifyAccessToken(tamperedToken, ISSUER, AUDIENCE)
      expect(claims).toBeNull()
    })

    it('should include iat and exp claims', async () => {
      const payload = { sub: 'user-123', client_id: 'client-456' }
      const before = Math.floor(Date.now() / 1000)
      const token = await signAccessToken(payload, ISSUER, AUDIENCE, 3600)
      const after = Math.floor(Date.now() / 1000)

      const claims = await verifyAccessToken(token, ISSUER, AUDIENCE)
      expect(claims!.iat).toBeGreaterThanOrEqual(before)
      expect(claims!.iat).toBeLessThanOrEqual(after)
      expect(claims!.exp).toBe(claims!.iat + 3600)
    })
  })

  describe('PKCE', () => {
    it('should verify valid code challenge', async () => {
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
      const challenge = await generateCodeChallenge(verifier)

      const valid = await verifyCodeChallenge(verifier, challenge)
      expect(valid).toBe(true)
    })

    it('should reject invalid code challenge', async () => {
      const verifier = 'correct-verifier'
      const wrongChallenge = await generateCodeChallenge('wrong-verifier')

      const valid = await verifyCodeChallenge(verifier, wrongChallenge)
      expect(valid).toBe(false)
    })

    it('should generate consistent code challenges', async () => {
      const verifier = 'test-verifier-string'
      const challenge1 = await generateCodeChallenge(verifier)
      const challenge2 = await generateCodeChallenge(verifier)

      expect(challenge1).toBe(challenge2)
    })

    it('should generate base64url-safe challenges', async () => {
      const verifier = 'test-verifier'
      const challenge = await generateCodeChallenge(verifier)

      // Should not contain +, /, or =
      expect(challenge).not.toMatch(/[+/=]/)
      // Should only contain base64url characters
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/)
    })
  })
})
