/**
 * MCP Server Integration Tests
 *
 * Tests the MCP server with actual HTTP requests using supertest.
 * Requires PocketBase to be running.
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import PocketBase from 'pocketbase'
import type { Express } from 'express'
import { createApp, initOAuth } from './server.js'
import { signAccessToken } from './oauth/jwt.js'
import { getPocketbaseUrl } from '../vitest.setup.js'

const OAUTH_ISSUER = 'http://localhost:3001'

describe('MCP Server', () => {
  let adminPb: PocketBase
  let jwt: string
  let userId: string
  let app: Express

  beforeAll(async () => {
    // Initialize OAuth once for all tests
    await initOAuth()
  })

  beforeEach(async () => {
    const pocketbaseUrl = getPocketbaseUrl()

    // Create MCP app with dynamic PocketBase URL
    app = createApp({
      pocketbaseUrl,
      adminEmail: 'admin@test.local',
      adminPassword: 'testtest123',
      oauthIssuer: OAUTH_ISSUER,
    })

    // Create admin connection for setup
    adminPb = new PocketBase(pocketbaseUrl)
    await adminPb.collection('_superusers').authWithPassword('admin@test.local', 'testtest123')

    // Create a fresh test user for each test
    const email = `test-${Date.now()}@example.com`
    const user = await adminPb.collection('users').create({
      email,
      password: 'testtest123',
      passwordConfirm: 'testtest123',
    })
    userId = user.id

    // Create JWT for MCP authentication
    jwt = await signAccessToken(
      { sub: userId, client_id: 'test-client' },
      OAUTH_ISSUER,
      'family-todo-mcp',
      3600
    )
  })

  describe('Health Check', () => {
    it('should return ok status', async () => {
      const res = await request(app).get('/health')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ status: 'ok' })
    })
  })

  describe('Authentication', () => {
    it('should reject requests without token', async () => {
      const res = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        })

      expect(res.status).toBe(401)
      expect(res.body.error.message).toContain('Authorization')
    })

    it('should reject requests with invalid token', async () => {
      const res = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer invalid_token')
        .send({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        })

      expect(res.status).toBe(401)
      expect(res.body.error.message).toContain('Invalid')
    })

    it('should accept requests with valid token', async () => {
      const res = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${jwt}`)
        .send({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        })

      expect(res.status).not.toBe(401)
    })
  })

  describe('MCP Protocol - tools/list', () => {
    it('should list available tools', async () => {
      const res = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${jwt}`)
        .send({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        })

      expect(res.status).toBe(200)
      expect(res.body.result).toBeDefined()
      expect(res.body.result.tools).toBeInstanceOf(Array)

      // Check for expected tools
      const toolNames = res.body.result.tools.map((t: { name: string }) => t.name)
      expect(toolNames).toContain('create_group')
      expect(toolNames).toContain('create_child')
      expect(toolNames).toContain('create_task')
      expect(toolNames).toContain('list_groups')
      expect(toolNames).toContain('list_children')
      expect(toolNames).toContain('list_tasks')
    })
  })

  describe('MCP Protocol - tools/call', () => {
    describe('Group Tools', () => {
      it('should create a group', async () => {
        const res = await request(app)
          .post('/mcp')
          .set('Authorization', `Bearer ${jwt}`)
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_group',
              arguments: {
                name: 'Test Family',
              },
            },
            id: 1,
          })

        expect(res.status).toBe(200)
        expect(res.body.result).toBeDefined()
        expect(res.body.result.content[0].text).toContain('Created group')
        expect(res.body.result.content[0].text).toContain('Test Family')
      })

      it('should list groups', async () => {
        // First create a group
        await request(app)
          .post('/mcp')
          .set('Authorization', `Bearer ${jwt}`)
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_group',
              arguments: { name: 'My Family' },
            },
            id: 1,
          })

        // Then list groups
        const res = await request(app)
          .post('/mcp')
          .set('Authorization', `Bearer ${jwt}`)
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'list_groups',
              arguments: {},
            },
            id: 2,
          })

        expect(res.status).toBe(200)
        const groups = JSON.parse(res.body.result.content[0].text)
        expect(groups).toHaveLength(1)
        expect(groups[0].name).toBe('My Family')
      })
    })

    describe('Children Tools', () => {
      let groupId: string

      beforeEach(async () => {
        // Create a group first
        const res = await request(app)
          .post('/mcp')
          .set('Authorization', `Bearer ${jwt}`)
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_group',
              arguments: { name: 'Test Family' },
            },
            id: 1,
          })

        // Extract group ID from response
        const match = res.body.result.content[0].text.match(/ID: ([a-z0-9]+)/)
        groupId = match[1]
      })

      it('should create a child', async () => {
        const res = await request(app)
          .post('/mcp')
          .set('Authorization', `Bearer ${jwt}`)
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_child',
              arguments: {
                groupId,
                name: 'Max',
                color: '#4DABF7',
              },
            },
            id: 2,
          })

        expect(res.status).toBe(200)
        expect(res.body.result.content[0].text).toContain('Created child')
        expect(res.body.result.content[0].text).toContain('Max')
      })

      it('should list children', async () => {
        // Create a child
        await request(app)
          .post('/mcp')
          .set('Authorization', `Bearer ${jwt}`)
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_child',
              arguments: { groupId, name: 'Lisa', color: '#F783AC' },
            },
            id: 2,
          })

        // List children
        const res = await request(app)
          .post('/mcp')
          .set('Authorization', `Bearer ${jwt}`)
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'list_children',
              arguments: { groupId },
            },
            id: 3,
          })

        expect(res.status).toBe(200)
        const children = JSON.parse(res.body.result.content[0].text)
        expect(children).toHaveLength(1)
        expect(children[0].name).toBe('Lisa')
        expect(children[0].color).toBe('#F783AC')
      })
    })

    describe('Task Tools', () => {
      let groupId: string
      let childId: string

      beforeEach(async () => {
        // Create group
        const groupRes = await request(app)
          .post('/mcp')
          .set('Authorization', `Bearer ${jwt}`)
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_group',
              arguments: { name: 'Test Family' },
            },
            id: 1,
          })
        groupId = groupRes.body.result.content[0].text.match(/ID: ([a-z0-9]+)/)[1]

        // Create child
        const childRes = await request(app)
          .post('/mcp')
          .set('Authorization', `Bearer ${jwt}`)
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_child',
              arguments: { groupId, name: 'Max', color: '#4DABF7' },
            },
            id: 2,
          })
        childId = childRes.body.result.content[0].text.match(/ID: ([a-z0-9]+)/)[1]
      })

      it('should create a task', async () => {
        const res = await request(app)
          .post('/mcp')
          .set('Authorization', `Bearer ${jwt}`)
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

        expect(res.status).toBe(200)
        expect(res.body.result.content[0].text).toContain('Created one-time task')
        expect(res.body.result.content[0].text).toContain('Brush teeth')
      })

      it('should list tasks', async () => {
        // Create tasks
        await request(app)
          .post('/mcp')
          .set('Authorization', `Bearer ${jwt}`)
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_task',
              arguments: { childId, title: 'Task 1', priority: 1 },
            },
            id: 3,
          })

        await request(app)
          .post('/mcp')
          .set('Authorization', `Bearer ${jwt}`)
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_task',
              arguments: { childId, title: 'Task 2', priority: 2 },
            },
            id: 4,
          })

        // List tasks
        const res = await request(app)
          .post('/mcp')
          .set('Authorization', `Bearer ${jwt}`)
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'list_tasks',
              arguments: { childId },
            },
            id: 5,
          })

        expect(res.status).toBe(200)
        const tasks = JSON.parse(res.body.result.content[0].text)
        expect(tasks).toHaveLength(2)
      })

      it('should update a task', async () => {
        // Create task
        const createRes = await request(app)
          .post('/mcp')
          .set('Authorization', `Bearer ${jwt}`)
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_task',
              arguments: { childId, title: 'Original', priority: 1 },
            },
            id: 3,
          })
        const taskId = createRes.body.result.content[0].text.match(/ID: ([a-z0-9]+)/)[1]

        // Update task
        const res = await request(app)
          .post('/mcp')
          .set('Authorization', `Bearer ${jwt}`)
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'update_task',
              arguments: { taskId, title: 'Updated' },
            },
            id: 4,
          })

        expect(res.status).toBe(200)
        expect(res.body.result.content[0].text).toContain('Updated task')

        // Verify via list
        const listRes = await request(app)
          .post('/mcp')
          .set('Authorization', `Bearer ${jwt}`)
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'list_tasks',
              arguments: { childId },
            },
            id: 5,
          })

        const tasks = JSON.parse(listRes.body.result.content[0].text)
        expect(tasks[0].title).toBe('Updated')
      })

      it('should delete a task', async () => {
        // Create task
        const createRes = await request(app)
          .post('/mcp')
          .set('Authorization', `Bearer ${jwt}`)
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_task',
              arguments: { childId, title: 'To Delete', priority: 1 },
            },
            id: 3,
          })
        const taskId = createRes.body.result.content[0].text.match(/ID: ([a-z0-9]+)/)[1]

        // Delete task
        const res = await request(app)
          .post('/mcp')
          .set('Authorization', `Bearer ${jwt}`)
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'delete_task',
              arguments: { taskId },
            },
            id: 4,
          })

        expect(res.status).toBe(200)
        expect(res.body.result.content[0].text).toContain('Deleted task')

        // Verify via list
        const listRes = await request(app)
          .post('/mcp')
          .set('Authorization', `Bearer ${jwt}`)
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'list_tasks',
              arguments: { childId },
            },
            id: 5,
          })

        const tasks = JSON.parse(listRes.body.result.content[0].text)
        expect(tasks).toHaveLength(0)
      })

      it('should reset a completed task', async () => {
        // Create task
        const createRes = await request(app)
          .post('/mcp')
          .set('Authorization', `Bearer ${jwt}`)
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_task',
              arguments: { childId, title: 'Recurring', priority: 1 },
            },
            id: 3,
          })
        const taskId = createRes.body.result.content[0].text.match(/ID: ([a-z0-9]+)/)[1]

        // Mark as completed directly in DB
        await adminPb.collection('tasks').update(taskId, {
          completed: true,
          completedAt: new Date().toISOString(),
        })

        // Reset task
        const res = await request(app)
          .post('/mcp')
          .set('Authorization', `Bearer ${jwt}`)
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'reset_task',
              arguments: { taskId },
            },
            id: 4,
          })

        expect(res.status).toBe(200)
        expect(res.body.result.content[0].text).toContain('Reset task')

        // Verify task is incomplete
        const task = await adminPb.collection('tasks').getOne(taskId)
        expect(task.completed).toBe(false)
      })
    })
  })
})
