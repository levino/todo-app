/**
 * OAuth Database Module Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { unlinkSync, existsSync, mkdirSync } from 'node:fs'
import {
  initOAuthDb,
  closeDb,
  createClient,
  getClient,
  validateClient,
  deleteClient,
  saveAuthCode,
  consumeAuthCode,
  cleanupExpiredCodes,
  saveRefreshToken,
  consumeRefreshToken,
  cleanupExpiredRefreshTokens,
  cleanupInactiveClients,
  backdateClient,
} from './db.js'

const TEST_DB_PATH = './test-data/oauth-test.db'

describe('OAuth Database', () => {
  beforeEach(() => {
    // Ensure test directory exists
    if (!existsSync('./test-data')) {
      mkdirSync('./test-data', { recursive: true })
    }
    // Initialize fresh database
    initOAuthDb(TEST_DB_PATH)
  })

  afterEach(() => {
    closeDb()
    // Clean up test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH)
    }
    if (existsSync(`${TEST_DB_PATH}-wal`)) {
      unlinkSync(`${TEST_DB_PATH}-wal`)
    }
    if (existsSync(`${TEST_DB_PATH}-shm`)) {
      unlinkSync(`${TEST_DB_PATH}-shm`)
    }
  })

  describe('Client Management', () => {
    it('should create a client with id and secret', () => {
      const client = createClient('Test App', ['https://example.com/callback'])

      expect(client.client_id).toBeDefined()
      expect(client.client_secret).toBeDefined()
      expect(client.client_name).toBe('Test App')
      expect(client.redirect_uris).toEqual(['https://example.com/callback'])
      expect(client.created_at).toBeGreaterThan(0)
    })

    it('should get a client by ID (without secret)', () => {
      const created = createClient('Test App', ['https://example.com/callback'])
      const fetched = getClient(created.client_id)

      expect(fetched).not.toBeNull()
      expect(fetched!.client_id).toBe(created.client_id)
      expect(fetched!.client_name).toBe('Test App')
      expect((fetched as unknown as { client_secret?: string }).client_secret).toBeUndefined()
    })

    it('should return null for non-existent client', () => {
      const fetched = getClient('non-existent-id')
      expect(fetched).toBeNull()
    })

    it('should validate client with correct secret', () => {
      const created = createClient('Test App', ['https://example.com/callback'])
      const validated = validateClient(created.client_id, created.client_secret)

      expect(validated).not.toBeNull()
      expect(validated!.client_id).toBe(created.client_id)
    })

    it('should reject client with wrong secret', () => {
      const created = createClient('Test App', ['https://example.com/callback'])
      const validated = validateClient(created.client_id, 'wrong-secret')

      expect(validated).toBeNull()
    })

    it('should reject non-existent client', () => {
      const validated = validateClient('non-existent', 'any-secret')
      expect(validated).toBeNull()
    })

    it('should delete a client', () => {
      const created = createClient('Test App', ['https://example.com/callback'])
      const deleted = deleteClient(created.client_id)

      expect(deleted).toBe(true)
      expect(getClient(created.client_id)).toBeNull()
    })

    it('should return false when deleting non-existent client', () => {
      const deleted = deleteClient('non-existent')
      expect(deleted).toBe(false)
    })

    it('should support multiple redirect URIs', () => {
      const uris = ['https://example.com/callback', 'https://app.example.com/oauth']
      const created = createClient('Multi URI App', uris)

      expect(created.redirect_uris).toEqual(uris)

      const fetched = getClient(created.client_id)
      expect(fetched!.redirect_uris).toEqual(uris)
    })

    it('should support null client name', () => {
      const created = createClient(null, ['https://example.com/callback'])

      expect(created.client_name).toBeNull()

      const fetched = getClient(created.client_id)
      expect(fetched!.client_name).toBeNull()
    })
  })

  describe('Authorization Codes', () => {
    let clientId: string

    beforeEach(() => {
      const client = createClient('Test App', ['https://example.com/callback'])
      clientId = client.client_id
    })

    it('should save an authorization code', () => {
      const code = saveAuthCode(
        clientId,
        'user-123',
        'https://example.com/callback',
        'challenge-hash'
      )

      expect(code).toBeDefined()
      expect(code.length).toBeGreaterThan(20)
    })

    it('should consume an authorization code', () => {
      const code = saveAuthCode(
        clientId,
        'user-123',
        'https://example.com/callback',
        'challenge-hash'
      )

      const authCode = consumeAuthCode(code)

      expect(authCode).not.toBeNull()
      expect(authCode!.client_id).toBe(clientId)
      expect(authCode!.user_id).toBe('user-123')
      expect(authCode!.redirect_uri).toBe('https://example.com/callback')
      expect(authCode!.code_challenge).toBe('challenge-hash')
    })

    it('should not allow reusing a consumed code', () => {
      const code = saveAuthCode(
        clientId,
        'user-123',
        'https://example.com/callback',
        'challenge-hash'
      )

      // First consume should succeed
      const first = consumeAuthCode(code)
      expect(first).not.toBeNull()

      // Second consume should fail
      const second = consumeAuthCode(code)
      expect(second).toBeNull()
    })

    it('should not return expired codes', async () => {
      // Create code that expires in 1 second
      const code = saveAuthCode(
        clientId,
        'user-123',
        'https://example.com/callback',
        'challenge-hash',
        1
      )

      // Wait for expiration (2 seconds to be safe)
      await new Promise((resolve) => setTimeout(resolve, 2000))

      const authCode = consumeAuthCode(code)
      expect(authCode).toBeNull()
    })

    it('should return null for non-existent code', () => {
      const authCode = consumeAuthCode('non-existent-code')
      expect(authCode).toBeNull()
    })

    it('should cleanup expired codes', async () => {
      // Create expired code
      saveAuthCode(clientId, 'user-123', 'https://example.com/callback', 'challenge', 1)

      // Wait for expiration (2 seconds to be safe)
      await new Promise((resolve) => setTimeout(resolve, 2000))

      const cleaned = cleanupExpiredCodes()
      expect(cleaned).toBe(1)
    })

    it('should delete codes when client is deleted', () => {
      const code = saveAuthCode(
        clientId,
        'user-123',
        'https://example.com/callback',
        'challenge-hash'
      )

      deleteClient(clientId)

      // Code should no longer be valid (foreign key constraint or cascade delete)
      const authCode = consumeAuthCode(code)
      expect(authCode).toBeNull()
    })
  })

  describe('Refresh Tokens', () => {
    let clientId: string

    beforeEach(() => {
      const client = createClient('Test App', ['https://example.com/callback'])
      clientId = client.client_id
    })

    it('should save a refresh token and return the token string', () => {
      const token = saveRefreshToken(clientId, 'user-123')

      expect(token).toBeDefined()
      expect(token.length).toBeGreaterThan(20)
    })

    it('should consume a refresh token and return token data', () => {
      const token = saveRefreshToken(clientId, 'user-123')

      const refreshToken = consumeRefreshToken(token)

      expect(refreshToken).not.toBeNull()
      expect(refreshToken!.client_id).toBe(clientId)
      expect(refreshToken!.user_id).toBe('user-123')
      expect(refreshToken!.revoked_at).toBeNull()
    })

    it('should not allow reusing a consumed refresh token (rotation)', () => {
      const token = saveRefreshToken(clientId, 'user-123')

      // First consume should succeed
      const first = consumeRefreshToken(token)
      expect(first).not.toBeNull()

      // Second consume should fail (token was revoked after use)
      const second = consumeRefreshToken(token)
      expect(second).toBeNull()
    })

    it('should not return expired refresh tokens', async () => {
      // Create token that expires in 1 second
      const token = saveRefreshToken(clientId, 'user-123', 1)

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 2000))

      const refreshToken = consumeRefreshToken(token)
      expect(refreshToken).toBeNull()
    })

    it('should return null for non-existent refresh token', () => {
      const refreshToken = consumeRefreshToken('non-existent-token')
      expect(refreshToken).toBeNull()
    })

    it('should cleanup expired refresh tokens', async () => {
      // Create expired token
      saveRefreshToken(clientId, 'user-123', 1)

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 2000))

      const cleaned = cleanupExpiredRefreshTokens()
      expect(cleaned).toBe(1)
    })

    it('should delete refresh tokens when client is deleted', () => {
      const token = saveRefreshToken(clientId, 'user-123')

      deleteClient(clientId)

      const refreshToken = consumeRefreshToken(token)
      expect(refreshToken).toBeNull()
    })

    it('should have 30 day default expiry', () => {
      const token = saveRefreshToken(clientId, 'user-123')

      const refreshToken = consumeRefreshToken(token)

      // Check expiry is roughly 30 days from now (within 1 minute tolerance)
      const expectedExpiry = Math.floor(Date.now() / 1000) + 30 * 24 * 3600
      expect(refreshToken!.expires_at).toBeGreaterThan(expectedExpiry - 60)
      expect(refreshToken!.expires_at).toBeLessThan(expectedExpiry + 60)
    })
  })

  describe('Inactive Client Cleanup', () => {
    it('should delete clients older than 30 days with no valid refresh tokens', () => {
      // Create a client that was created 31 days ago
      const oldClient = createClient('Old App', ['https://old.example.com/callback'])

      // Manually backdate the client's created_at to 31 days ago
      const thirtyOneDaysAgo = Math.floor(Date.now() / 1000) - 31 * 24 * 3600
      backdateClient(oldClient.client_id, thirtyOneDaysAgo)

      // Run cleanup
      const deletedCount = cleanupInactiveClients()

      // Client should be deleted
      expect(deletedCount).toBe(1)
      expect(getClient(oldClient.client_id)).toBeNull()
    })

    it('should NOT delete clients with valid refresh tokens even if old', () => {
      // Create a client that was created 31 days ago
      const oldClient = createClient('Old But Active', ['https://active.example.com/callback'])

      // Backdate the client
      const thirtyOneDaysAgo = Math.floor(Date.now() / 1000) - 31 * 24 * 3600
      backdateClient(oldClient.client_id, thirtyOneDaysAgo)

      // But give it a valid refresh token (not expired, not revoked)
      saveRefreshToken(oldClient.client_id, 'user-123')

      // Run cleanup
      const deletedCount = cleanupInactiveClients()

      // Client should NOT be deleted because it has an active refresh token
      expect(deletedCount).toBe(0)
      expect(getClient(oldClient.client_id)).not.toBeNull()
    })

    it('should NOT delete clients newer than 30 days', () => {
      // Create a new client (created now)
      const newClient = createClient('New App', ['https://new.example.com/callback'])

      // Run cleanup
      const deletedCount = cleanupInactiveClients()

      // Client should NOT be deleted
      expect(deletedCount).toBe(0)
      expect(getClient(newClient.client_id)).not.toBeNull()
    })

    it('should delete old clients with only expired refresh tokens', () => {
      // Create an old client
      const oldClient = createClient('Old Expired', ['https://expired.example.com/callback'])

      // Backdate the client
      const thirtyOneDaysAgo = Math.floor(Date.now() / 1000) - 31 * 24 * 3600
      backdateClient(oldClient.client_id, thirtyOneDaysAgo)

      // Give it an expired refresh token (expires in the past)
      saveRefreshToken(oldClient.client_id, 'user-123', -1) // Already expired

      // Run cleanup
      const deletedCount = cleanupInactiveClients()

      // Client should be deleted because its only refresh token is expired
      expect(deletedCount).toBe(1)
      expect(getClient(oldClient.client_id)).toBeNull()
    })

    it('should delete old clients with only revoked refresh tokens', async () => {
      // Create an old client
      const oldClient = createClient('Old Revoked', ['https://revoked.example.com/callback'])

      // Backdate the client
      const thirtyOneDaysAgo = Math.floor(Date.now() / 1000) - 31 * 24 * 3600
      backdateClient(oldClient.client_id, thirtyOneDaysAgo)

      // Give it a refresh token and immediately consume it (which revokes it)
      const token = saveRefreshToken(oldClient.client_id, 'user-123')
      consumeRefreshToken(token)

      // Run cleanup
      const deletedCount = cleanupInactiveClients()

      // Client should be deleted because its only refresh token is revoked
      expect(deletedCount).toBe(1)
      expect(getClient(oldClient.client_id)).toBeNull()
    })

    it('should handle mix of active and inactive clients', () => {
      // Create multiple clients
      const activeNew = createClient('Active New', ['https://a.com/callback'])
      const activeOld = createClient('Active Old', ['https://b.com/callback'])
      const inactiveOld = createClient('Inactive Old', ['https://c.com/callback'])

      // Backdate two of them
      const thirtyOneDaysAgo = Math.floor(Date.now() / 1000) - 31 * 24 * 3600
      backdateClient(activeOld.client_id, thirtyOneDaysAgo)
      backdateClient(inactiveOld.client_id, thirtyOneDaysAgo)

      // Give activeOld a valid refresh token
      saveRefreshToken(activeOld.client_id, 'user-123')

      // Run cleanup
      const deletedCount = cleanupInactiveClients()

      // Only inactiveOld should be deleted
      expect(deletedCount).toBe(1)
      expect(getClient(activeNew.client_id)).not.toBeNull()
      expect(getClient(activeOld.client_id)).not.toBeNull()
      expect(getClient(inactiveOld.client_id)).toBeNull()
    })
  })
})
