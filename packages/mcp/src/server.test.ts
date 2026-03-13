/**
 * MCP Server Integration Tests
 *
 * Tests the MCP server with actual HTTP requests using supertest.
 * Requires PocketBase to be running.
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import PocketBase from 'pocketbase'
import { app, calculateNextDueDate } from './server.js'

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

describe('MCP Server', () => {
  let adminPb: PocketBase
  let authToken: string
  let userId: string

  beforeAll(async () => {
    // Create admin connection for setup
    adminPb = new PocketBase(POCKETBASE_URL)
    await adminPb.collection('_superusers').authWithPassword('admin@test.local', 'testtest123')
  })

  beforeEach(async () => {
    // Create a fresh test user for each test
    const email = `test-${Date.now()}@example.com`
    const user = await adminPb.collection('users').create({
      email,
      password: 'testtest123',
      passwordConfirm: 'testtest123',
    })
    userId = user.id

    // Get auth token
    const userPb = new PocketBase(POCKETBASE_URL)
    await userPb.collection('users').authWithPassword(email, 'testtest123')
    authToken = userPb.authStore.token
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
      expect(res.body.error.message).toContain('token')
    })

    it('should reject requests with invalid token', async () => {
      const res = await request(app)
        .post('/mcp')
        .query({ token: 'invalid_token' })
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
        .query({ token: authToken })
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
        .query({ token: authToken })
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
          .query({ token: authToken })
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
          .query({ token: authToken })
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
          .query({ token: authToken })
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
          .query({ token: authToken })
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
          .query({ token: authToken })
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
          .query({ token: authToken })
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
          .query({ token: authToken })
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
          .query({ token: authToken })
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
          .query({ token: authToken })
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

      it('should create a task with timeOfDay', async () => {
        const res = await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_task',
              arguments: {
                childId,
                title: 'Brush teeth',
                priority: 1,
                timeOfDay: 'morning',
              },
            },
            id: 3,
          })

        expect(res.status).toBe(200)
        expect(res.body.result.content[0].text).toContain('Created task')
        expect(res.body.result.content[0].text).toContain('Brush teeth')

        const taskId = res.body.result.content[0].text.match(/ID: ([a-z0-9]+)/)[1]
        const task = await adminPb.collection('tasks').getOne(taskId)
        expect(task.timeOfDay).toBe('morning')
      })

      it('should reject create_task without timeOfDay', async () => {
        const res = await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_task',
              arguments: {
                childId,
                title: 'No phase',
                priority: 1,
              },
            },
            id: 3,
          })

        expect(res.status).toBe(200)
        expect(res.body.error).toBeDefined()
      })

      it('should reject create_task with invalid timeOfDay', async () => {
        const res = await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_task',
              arguments: {
                childId,
                title: 'Bad phase',
                priority: 1,
                timeOfDay: 'midnight',
              },
            },
            id: 3,
          })

        expect(res.status).toBe(200)
        expect(res.body.error).toBeDefined()
        expect(res.body.error.message).toContain('Invalid parameters')
      })

      it('should list tasks', async () => {
        // Create tasks
        await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_task',
              arguments: { childId, title: 'Task 1', priority: 1, timeOfDay: 'afternoon' },
            },
            id: 3,
          })

        await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_task',
              arguments: { childId, title: 'Task 2', priority: 2, timeOfDay: 'afternoon' },
            },
            id: 4,
          })

        // List tasks
        const res = await request(app)
          .post('/mcp')
          .query({ token: authToken })
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
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_task',
              arguments: { childId, title: 'Original', priority: 1, timeOfDay: 'afternoon' },
            },
            id: 3,
          })
        const taskId = createRes.body.result.content[0].text.match(/ID: ([a-z0-9]+)/)[1]

        // Update task
        const res = await request(app)
          .post('/mcp')
          .query({ token: authToken })
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
          .query({ token: authToken })
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
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_task',
              arguments: { childId, title: 'To Delete', priority: 1, timeOfDay: 'afternoon' },
            },
            id: 3,
          })
        const taskId = createRes.body.result.content[0].text.match(/ID: ([a-z0-9]+)/)[1]

        // Delete task
        const res = await request(app)
          .post('/mcp')
          .query({ token: authToken })
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
          .query({ token: authToken })
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

      it('should create a recurring interval task', async () => {
        const res = await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_task',
              arguments: {
                childId,
                title: 'Duschen',
                timeOfDay: 'morning',
                recurrenceType: 'interval',
                recurrenceInterval: 2,
                dueDate: '2026-03-15T00:00:00Z',
              },
            },
            id: 3,
          })

        expect(res.status).toBe(200)
        expect(res.body.result.content[0].text).toContain('Created task')
        expect(res.body.result.content[0].text).toContain('Repeats every 2 days')

        // Verify fields in DB
        const taskId = res.body.result.content[0].text.match(/ID: ([a-z0-9]+)/)[1]
        const task = await adminPb.collection('tasks').getOne(taskId)
        expect(task.recurrenceType).toBe('interval')
        expect(task.recurrenceInterval).toBe(2)
        expect(task.dueDate).toContain('2026-03-15')
      })

      it('should create a recurring weekly task', async () => {
        const res = await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_task',
              arguments: {
                childId,
                title: 'Hausaufgaben',
                timeOfDay: 'afternoon',
                recurrenceType: 'weekly',
                recurrenceDays: [1, 2, 3, 4, 5],
                dueDate: '2026-03-16T00:00:00Z',
              },
            },
            id: 3,
          })

        expect(res.status).toBe(200)
        expect(res.body.result.content[0].text).toContain('Created task')
        expect(res.body.result.content[0].text).toContain('Repeats on weekdays')

        const taskId = res.body.result.content[0].text.match(/ID: ([a-z0-9]+)/)[1]
        const task = await adminPb.collection('tasks').getOne(taskId)
        expect(task.recurrenceType).toBe('weekly')
        expect(task.recurrenceDays).toEqual([1, 2, 3, 4, 5])
      })

      it('should list tasks with timeOfDay', async () => {
        await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_task',
              arguments: {
                childId,
                title: 'Morning Task',
                timeOfDay: 'morning',
              },
            },
            id: 3,
          })

        const res = await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'list_tasks',
              arguments: { childId },
            },
            id: 4,
          })

        const tasks = JSON.parse(res.body.result.content[0].text)
        expect(tasks[0].timeOfDay).toBe('morning')
      })

      it('should list tasks with recurrence info', async () => {
        await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_task',
              arguments: {
                childId,
                title: 'Recurring Task',
                timeOfDay: 'afternoon',
                recurrenceType: 'interval',
                recurrenceInterval: 3,
                dueDate: '2026-03-15T00:00:00Z',
              },
            },
            id: 3,
          })

        const res = await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'list_tasks',
              arguments: { childId },
            },
            id: 4,
          })

        const tasks = JSON.parse(res.body.result.content[0].text)
        expect(tasks[0].recurrenceType).toBe('interval')
        expect(tasks[0].recurrenceInterval).toBe(3)
        expect(tasks[0].dueDate).toContain('2026-03-15')
      })

      it('should update task timeOfDay', async () => {
        const createRes = await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_task',
              arguments: { childId, title: 'Move me', priority: 1, timeOfDay: 'morning' },
            },
            id: 3,
          })
        const taskId = createRes.body.result.content[0].text.match(/ID: ([a-z0-9]+)/)[1]

        await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'update_task',
              arguments: { taskId, timeOfDay: 'evening' },
            },
            id: 4,
          })

        const task = await adminPb.collection('tasks').getOne(taskId)
        expect(task.timeOfDay).toBe('evening')
      })

      it('should reset a completed task', async () => {
        // Create task
        const createRes = await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_task',
              arguments: { childId, title: 'Recurring', priority: 1, timeOfDay: 'afternoon' },
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
          .query({ token: authToken })
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

    describe('Phase Time Tools', () => {
      let groupId: string

      beforeEach(async () => {
        const groupRes = await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_group',
              arguments: { name: 'Phase Test Family' },
            },
            id: 1,
          })
        groupId = groupRes.body.result.content[0].text.match(/ID: ([a-z0-9]+)/)[1]
      })

      it('should configure phase times for a group', async () => {
        const res = await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'configure_phase_times',
              arguments: {
                groupId,
                morningEnd: '10:00',
                eveningStart: '19:00',
              },
            },
            id: 2,
          })

        expect(res.status).toBe(200)
        expect(res.body.result.content[0].text).toContain('Updated phase times')

        const group = await adminPb.collection('groups').getOne(groupId)
        expect(group.morningEnd).toBe('10:00')
        expect(group.eveningStart).toBe('19:00')
      })

      it('should list groups with phase times', async () => {
        await adminPb.collection('groups').update(groupId, {
          morningEnd: '08:30',
          eveningStart: '17:30',
        })

        const res = await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'list_groups',
              arguments: {},
            },
            id: 2,
          })

        const groups = JSON.parse(res.body.result.content[0].text)
        expect(groups[0].morningEnd).toBe('08:30')
        expect(groups[0].eveningStart).toBe('17:30')
      })

      it('should be listed in tools/list', async () => {
        const res = await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/list',
            id: 1,
          })

        const toolNames = res.body.result.tools.map((t: { name: string }) => t.name)
        expect(toolNames).toContain('configure_phase_times')
      })
    })
  })
})

describe('calculateNextDueDate', () => {
  it('should calculate interval-based next date', () => {
    const completed = new Date('2026-03-13T10:00:00Z')
    const result = calculateNextDueDate('interval', 3, null, completed)
    expect(result).toContain('2026-03-16')
  })

  it('should calculate weekly next date (next weekday)', () => {
    // 2026-03-13 is a Friday (day 5)
    const completed = new Date('2026-03-13T10:00:00Z')
    // Schedule for Mon(1), Wed(3) → next should be Monday
    const result = calculateNextDueDate('weekly', null, [1, 3], completed)
    expect(result).toContain('2026-03-16') // Monday
  })

  it('should wrap around to next week if no later day this week', () => {
    // 2026-03-13 is a Friday (day 5)
    const completed = new Date('2026-03-13T10:00:00Z')
    // Schedule for Tuesday(2) only → next Tuesday
    const result = calculateNextDueDate('weekly', null, [2], completed)
    expect(result).toContain('2026-03-17') // next Tuesday
  })

  it('should return null for non-recurring tasks', () => {
    const completed = new Date('2026-03-13T10:00:00Z')
    expect(calculateNextDueDate(null, null, null, completed)).toBeNull()
    expect(calculateNextDueDate('', null, null, completed)).toBeNull()
  })
})
