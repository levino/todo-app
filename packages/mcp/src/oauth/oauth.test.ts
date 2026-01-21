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

  describe('Bearer Token - Complete MCP Flow', () => {
    let accessToken: string

    beforeEach(async () => {
      // Register client and get access token
      const registerRes = await request(app)
        .post('/oauth/register')
        .send({
          client_name: 'MCP Full Test',
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

    it('should handle MCP initialize', async () => {
      const res = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          jsonrpc: '2.0',
          method: 'initialize',
          id: 1,
        })

      expect(res.status).toBe(200)
      expect(res.body.result.protocolVersion).toBe('2024-11-05')
      expect(res.body.result.serverInfo.name).toBe('family-todo-mcp')
      expect(res.body.result.capabilities.tools).toBeDefined()
    })

    it('should handle notifications/initialized', async () => {
      const res = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
          id: 1,
        })

      expect(res.status).toBe(200)
      expect(res.body.result).toEqual({})
    })

    it('should list all available tools', async () => {
      const res = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        })

      expect(res.status).toBe(200)
      expect(res.body.result.tools).toBeInstanceOf(Array)

      const toolNames = res.body.result.tools.map((t: { name: string }) => t.name)
      expect(toolNames).toContain('create_group')
      expect(toolNames).toContain('list_groups')
      expect(toolNames).toContain('create_child')
      expect(toolNames).toContain('list_children')
      expect(toolNames).toContain('create_task')
      expect(toolNames).toContain('list_tasks')
      expect(toolNames).toContain('update_task')
      expect(toolNames).toContain('delete_task')
    })

    it('should create and list groups with Bearer token', async () => {
      // Create a group
      const createRes = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'create_group',
            arguments: { name: 'OAuth Test Family' },
          },
          id: 1,
        })

      expect(createRes.status).toBe(200)
      expect(createRes.body.result.content[0].text).toContain('Created group')
      expect(createRes.body.result.content[0].text).toContain('OAuth Test Family')

      // List groups
      const listRes = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'list_groups',
            arguments: {},
          },
          id: 2,
        })

      expect(listRes.status).toBe(200)
      const groups = JSON.parse(listRes.body.result.content[0].text)
      expect(groups).toHaveLength(1)
      expect(groups[0].name).toBe('OAuth Test Family')
    })

    it('should create and manage children with Bearer token', async () => {
      // Create a group first
      const groupRes = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'create_group',
            arguments: { name: 'Child Test Family' },
          },
          id: 1,
        })

      const groupId = groupRes.body.result.content[0].text.match(/ID: ([a-z0-9]+)/)[1]

      // Create a child
      const createRes = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'create_child',
            arguments: {
              groupId,
              name: 'Emma',
              color: '#FF6B6B',
            },
          },
          id: 2,
        })

      expect(createRes.status).toBe(200)
      expect(createRes.body.result.content[0].text).toContain('Created child')
      expect(createRes.body.result.content[0].text).toContain('Emma')

      // List children
      const listRes = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'list_children',
            arguments: { groupId },
          },
          id: 3,
        })

      expect(listRes.status).toBe(200)
      const children = JSON.parse(listRes.body.result.content[0].text)
      expect(children).toHaveLength(1)
      expect(children[0].name).toBe('Emma')
      expect(children[0].color).toBe('#FF6B6B')
    })

    it('should create and manage tasks with Bearer token', async () => {
      // Create group
      const groupRes = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'create_group',
            arguments: { name: 'Task Test Family' },
          },
          id: 1,
        })

      const groupId = groupRes.body.result.content[0].text.match(/ID: ([a-z0-9]+)/)[1]

      // Create child
      const childRes = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'create_child',
            arguments: { groupId, name: 'Max', color: '#4DABF7' },
          },
          id: 2,
        })

      const childId = childRes.body.result.content[0].text.match(/ID: ([a-z0-9]+)/)[1]

      // Create task
      const createRes = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'create_task',
            arguments: {
              childId,
              title: 'Brush teeth',
              priority: 1,
            },
          },
          id: 3,
        })

      expect(createRes.status).toBe(200)
      expect(createRes.body.result.content[0].text).toContain('Created one-time task')
      expect(createRes.body.result.content[0].text).toContain('Brush teeth')

      const taskId = createRes.body.result.content[0].text.match(/ID: ([a-z0-9]+)/)[1]

      // List tasks
      const listRes = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'list_tasks',
            arguments: { childId },
          },
          id: 4,
        })

      expect(listRes.status).toBe(200)
      const tasks = JSON.parse(listRes.body.result.content[0].text)
      expect(tasks).toHaveLength(1)
      expect(tasks[0].title).toBe('Brush teeth')

      // Update task
      const updateRes = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'update_task',
            arguments: { taskId, title: 'Brush teeth twice' },
          },
          id: 5,
        })

      expect(updateRes.status).toBe(200)
      expect(updateRes.body.result.content[0].text).toContain('Updated task')

      // Delete task
      const deleteRes = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'delete_task',
            arguments: { taskId },
          },
          id: 6,
        })

      expect(deleteRes.status).toBe(200)
      expect(deleteRes.body.result.content[0].text).toContain('Deleted task')

      // Verify deletion
      const verifyRes = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'list_tasks',
            arguments: { childId },
          },
          id: 7,
        })

      const remainingTasks = JSON.parse(verifyRes.body.result.content[0].text)
      expect(remainingTasks).toHaveLength(0)
    })

    it('should handle full Claude-like workflow', async () => {
      // This simulates the exact flow Claude would use

      // 1. Initialize
      const initRes = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ jsonrpc: '2.0', method: 'initialize', id: 1 })
      expect(initRes.status).toBe(200)

      // 2. Acknowledge initialization
      const initAckRes = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ jsonrpc: '2.0', method: 'notifications/initialized', id: 2 })
      expect(initAckRes.status).toBe(200)

      // 3. List tools
      const toolsRes = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ jsonrpc: '2.0', method: 'tools/list', id: 3 })
      expect(toolsRes.status).toBe(200)
      expect(toolsRes.body.result.tools.length).toBeGreaterThan(0)

      // 4. Create a group
      const createGroupRes = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'create_group',
            arguments: { name: 'Meine Familie' },
          },
          id: 4,
        })
      expect(createGroupRes.status).toBe(200)
      expect(createGroupRes.body.result.isError).toBeUndefined()

      const groupId = createGroupRes.body.result.content[0].text.match(/ID: ([a-z0-9]+)/)[1]

      // 5. Create children
      const createChild1Res = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'create_child',
            arguments: { groupId, name: 'Anna', color: '#F783AC' },
          },
          id: 5,
        })
      expect(createChild1Res.status).toBe(200)

      const child1Id = createChild1Res.body.result.content[0].text.match(/ID: ([a-z0-9]+)/)[1]

      // 6. Create tasks for the child
      const createTask1Res = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'create_task',
            arguments: { childId: child1Id, title: 'Hausaufgaben machen', priority: 1 },
          },
          id: 6,
        })
      expect(createTask1Res.status).toBe(200)

      const createTask2Res = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'create_task',
            arguments: { childId: child1Id, title: 'Zimmer aufräumen', priority: 2 },
          },
          id: 7,
        })
      expect(createTask2Res.status).toBe(200)

      // 7. List all tasks
      const listTasksRes = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'list_tasks',
            arguments: { childId: child1Id },
          },
          id: 8,
        })
      expect(listTasksRes.status).toBe(200)
      const tasks = JSON.parse(listTasksRes.body.result.content[0].text)
      expect(tasks).toHaveLength(2)
      expect(tasks.some((t: { title: string }) => t.title === 'Hausaufgaben machen')).toBe(true)
      expect(tasks.some((t: { title: string }) => t.title === 'Zimmer aufräumen')).toBe(true)
    })
  })
})
