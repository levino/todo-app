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
})
