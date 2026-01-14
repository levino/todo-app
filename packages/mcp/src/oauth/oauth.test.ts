/**
 * OAuth 2.0 Integration Tests
 *
 * Tests the complete OAuth flow including:
 * - Discovery endpoints
 * - Client registration
 * - Authorization code generation
 * - Token exchange
 * - JWT-based MCP authentication
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import PocketBase from 'pocketbase'
import { rmSync, existsSync } from 'node:fs'
import { app, initOAuth } from '../server.js'
import { closeDb } from './db.js'
import { generateCodeChallenge } from './jwt.js'

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'
const TEST_DB_PATH = './test-data/oauth-integration.db'
const TEST_KEY_PATH = './test-data/oauth-keys-integration'

describe('OAuth 2.0 Integration', () => {
  let adminPb: PocketBase
  let testUserId: string
  let testUserEmail: string

  beforeAll(async () => {
    // Clean up any existing test data
    if (existsSync(TEST_DB_PATH)) {
      rmSync(TEST_DB_PATH, { recursive: true, force: true })
    }
    if (existsSync(`${TEST_DB_PATH}-wal`)) {
      rmSync(`${TEST_DB_PATH}-wal`, { force: true })
    }
    if (existsSync(`${TEST_DB_PATH}-shm`)) {
      rmSync(`${TEST_DB_PATH}-shm`, { force: true })
    }
    if (existsSync(TEST_KEY_PATH)) {
      rmSync(TEST_KEY_PATH, { recursive: true, force: true })
    }

    // Set test paths
    process.env.OAUTH_DB_PATH = TEST_DB_PATH
    process.env.OAUTH_KEY_PATH = TEST_KEY_PATH
    process.env.OAUTH_ISSUER = 'http://localhost:3001'

    // Initialize OAuth (creates db and generates keys)
    await initOAuth()

    // Create admin connection
    adminPb = new PocketBase(POCKETBASE_URL)
    await adminPb.collection('_superusers').authWithPassword('admin@test.local', 'testtest123')
  })

  afterAll(() => {
    closeDb()
    // Clean up test data
    if (existsSync(TEST_DB_PATH)) {
      rmSync(TEST_DB_PATH, { recursive: true, force: true })
    }
    if (existsSync(`${TEST_DB_PATH}-wal`)) {
      rmSync(`${TEST_DB_PATH}-wal`, { force: true })
    }
    if (existsSync(`${TEST_DB_PATH}-shm`)) {
      rmSync(`${TEST_DB_PATH}-shm`, { force: true })
    }
    if (existsSync(TEST_KEY_PATH)) {
      rmSync(TEST_KEY_PATH, { recursive: true, force: true })
    }
  })

  beforeEach(async () => {
    // Create a fresh test user
    testUserEmail = `oauth-test-${Date.now()}@example.com`
    const user = await adminPb.collection('users').create({
      email: testUserEmail,
      password: 'testtest123',
      passwordConfirm: 'testtest123',
    })
    testUserId = user.id
  })

  describe('Discovery Endpoints', () => {
    it('should return OAuth server metadata', async () => {
      const res = await request(app).get('/.well-known/oauth-authorization-server')

      expect(res.status).toBe(200)
      expect(res.body.issuer).toBe('http://localhost:3001')
      expect(res.body.token_endpoint).toBe('http://localhost:3001/oauth/token')
      expect(res.body.registration_endpoint).toBe('http://localhost:3001/oauth/register')
      expect(res.body.response_types_supported).toContain('code')
      expect(res.body.code_challenge_methods_supported).toContain('S256')
    })

    it('should return JWKS with public key', async () => {
      const res = await request(app).get('/.well-known/jwks.json')

      expect(res.status).toBe(200)
      expect(res.body.keys).toHaveLength(1)
      expect(res.body.keys[0].kty).toBe('RSA')
      expect(res.body.keys[0].alg).toBe('RS256')
      expect(res.body.keys[0].use).toBe('sig')
      // Should not contain private key components
      expect(res.body.keys[0].d).toBeUndefined()
    })
  })

  describe('Client Registration', () => {
    it('should register a new client', async () => {
      const res = await request(app)
        .post('/oauth/register')
        .send({
          client_name: 'Test Client',
          redirect_uris: ['https://example.com/callback'],
        })

      expect(res.status).toBe(201)
      expect(res.body.client_id).toBeDefined()
      expect(res.body.client_secret).toBeDefined()
      expect(res.body.client_name).toBe('Test Client')
      expect(res.body.redirect_uris).toEqual(['https://example.com/callback'])
    })

    it('should require redirect_uris', async () => {
      const res = await request(app)
        .post('/oauth/register')
        .send({
          client_name: 'Test Client',
        })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('invalid_client_metadata')
    })

    it('should require valid URLs in redirect_uris', async () => {
      const res = await request(app)
        .post('/oauth/register')
        .send({
          client_name: 'Test Client',
          redirect_uris: ['not-a-url'],
        })

      expect(res.status).toBe(400)
    })
  })

  describe('Client Info', () => {
    it('should return client info', async () => {
      // First register a client
      const registerRes = await request(app)
        .post('/oauth/register')
        .send({
          client_name: 'Info Test',
          redirect_uris: ['https://example.com/callback'],
        })

      const clientId = registerRes.body.client_id

      // Then fetch client info
      const res = await request(app).get(`/oauth/client/${clientId}`)

      expect(res.status).toBe(200)
      expect(res.body.client_id).toBe(clientId)
      expect(res.body.client_name).toBe('Info Test')
      // Should not return secret
      expect(res.body.client_secret).toBeUndefined()
    })

    it('should return 404 for unknown client', async () => {
      const res = await request(app).get('/oauth/client/unknown-client-id')

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('invalid_client')
    })
  })

  describe('Authorization Code Flow', () => {
    let clientId: string
    let clientSecret: string
    const redirectUri = 'https://example.com/callback'

    beforeEach(async () => {
      // Register a client for each test
      const res = await request(app)
        .post('/oauth/register')
        .send({
          client_name: 'Auth Flow Test',
          redirect_uris: [redirectUri],
        })

      clientId = res.body.client_id
      clientSecret = res.body.client_secret
    })

    it('should generate authorization code', async () => {
      const codeVerifier = 'test-code-verifier-that-is-at-least-43-characters-long'
      const codeChallenge = await generateCodeChallenge(codeVerifier)

      const res = await request(app)
        .post('/oauth/authorize')
        .send({
          client_id: clientId,
          redirect_uri: redirectUri,
          code_challenge: codeChallenge,
          user_id: testUserId,
          state: 'test-state',
        })

      expect(res.status).toBe(200)
      expect(res.body.code).toBeDefined()
      expect(res.body.redirect_url).toContain('code=')
      expect(res.body.redirect_url).toContain('state=test-state')
    })

    it('should reject unregistered redirect_uri', async () => {
      const codeChallenge = await generateCodeChallenge('test-verifier-43-chars-minimum-length')

      const res = await request(app)
        .post('/oauth/authorize')
        .send({
          client_id: clientId,
          redirect_uri: 'https://evil.com/callback',
          code_challenge: codeChallenge,
          user_id: testUserId,
        })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('invalid_request')
    })

    it('should exchange code for access token', async () => {
      const codeVerifier = 'test-code-verifier-that-is-at-least-43-characters-long'
      const codeChallenge = await generateCodeChallenge(codeVerifier)

      // Generate auth code
      const authRes = await request(app)
        .post('/oauth/authorize')
        .send({
          client_id: clientId,
          redirect_uri: redirectUri,
          code_challenge: codeChallenge,
          user_id: testUserId,
        })

      const code = authRes.body.code

      // Exchange for token
      const tokenRes = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
          client_id: clientId,
          client_secret: clientSecret,
        })

      expect(tokenRes.status).toBe(200)
      expect(tokenRes.body.access_token).toBeDefined()
      expect(tokenRes.body.token_type).toBe('Bearer')
      expect(tokenRes.body.expires_in).toBe(3600)
    })

    it('should support Basic auth for token endpoint', async () => {
      const codeVerifier = 'test-code-verifier-that-is-at-least-43-characters-long'
      const codeChallenge = await generateCodeChallenge(codeVerifier)

      // Generate auth code
      const authRes = await request(app)
        .post('/oauth/authorize')
        .send({
          client_id: clientId,
          redirect_uri: redirectUri,
          code_challenge: codeChallenge,
          user_id: testUserId,
        })

      const code = authRes.body.code

      // Exchange with Basic auth header
      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
      const tokenRes = await request(app)
        .post('/oauth/token')
        .set('Authorization', `Basic ${credentials}`)
        .send({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        })

      expect(tokenRes.status).toBe(200)
      expect(tokenRes.body.access_token).toBeDefined()
    })

    it('should reject wrong code_verifier (PKCE)', async () => {
      const codeVerifier = 'correct-verifier-that-is-at-least-43-characters'
      const codeChallenge = await generateCodeChallenge(codeVerifier)

      // Generate auth code
      const authRes = await request(app)
        .post('/oauth/authorize')
        .send({
          client_id: clientId,
          redirect_uri: redirectUri,
          code_challenge: codeChallenge,
          user_id: testUserId,
        })

      const code = authRes.body.code

      // Try to exchange with wrong verifier
      const tokenRes = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          code_verifier: 'wrong-verifier-that-is-also-43-chars-minimum',
          client_id: clientId,
          client_secret: clientSecret,
        })

      expect(tokenRes.status).toBe(400)
      expect(tokenRes.body.error).toBe('invalid_grant')
    })

    it('should reject reused authorization code', async () => {
      const codeVerifier = 'test-code-verifier-that-is-at-least-43-characters-long'
      const codeChallenge = await generateCodeChallenge(codeVerifier)

      // Generate auth code
      const authRes = await request(app)
        .post('/oauth/authorize')
        .send({
          client_id: clientId,
          redirect_uri: redirectUri,
          code_challenge: codeChallenge,
          user_id: testUserId,
        })

      const code = authRes.body.code

      // First exchange should succeed
      const firstRes = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
          client_id: clientId,
          client_secret: clientSecret,
        })

      expect(firstRes.status).toBe(200)

      // Second exchange should fail
      const secondRes = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
          client_id: clientId,
          client_secret: clientSecret,
        })

      expect(secondRes.status).toBe(400)
      expect(secondRes.body.error).toBe('invalid_grant')
    })
  })

  describe('JWT Authentication for MCP', () => {
    let accessToken: string

    beforeEach(async () => {
      // Register client and get access token
      const registerRes = await request(app)
        .post('/oauth/register')
        .send({
          client_name: 'MCP Test',
          redirect_uris: ['https://example.com/callback'],
        })

      const codeVerifier = 'test-code-verifier-that-is-at-least-43-characters-long'
      const codeChallenge = await generateCodeChallenge(codeVerifier)

      const authRes = await request(app)
        .post('/oauth/authorize')
        .send({
          client_id: registerRes.body.client_id,
          redirect_uri: 'https://example.com/callback',
          code_challenge: codeChallenge,
          user_id: testUserId,
        })

      const tokenRes = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: authRes.body.code,
          redirect_uri: 'https://example.com/callback',
          code_verifier: codeVerifier,
          client_id: registerRes.body.client_id,
          client_secret: registerRes.body.client_secret,
        })

      accessToken = tokenRes.body.access_token
    })

    it('should accept Bearer token for MCP endpoint', async () => {
      const res = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        })

      // Note: This will fail if impersonation doesn't work,
      // but the 401 would indicate auth worked but user access failed
      expect(res.status).not.toBe(401)
    })

    it('should reject invalid Bearer token', async () => {
      const res = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        })

      expect(res.status).toBe(401)
    })

    it('should still accept query parameter token', async () => {
      // Get a PocketBase token
      const userPb = new PocketBase(POCKETBASE_URL)
      await userPb.collection('users').authWithPassword(testUserEmail, 'testtest123')
      const pbToken = userPb.authStore.token

      const res = await request(app)
        .post('/mcp')
        .query({ token: pbToken })
        .send({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        })

      expect(res.status).toBe(200)
    })
  })
})
