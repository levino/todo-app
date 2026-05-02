/**
 * MCP Server Integration Tests
 *
 * Tests the MCP server with actual HTTP requests using supertest.
 * Requires PocketBase to be running.
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import PocketBase from 'pocketbase'
import { app, calculateNextDueDate, calculateInitialDueDate } from './server.js'

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

    it('should document the recurrenceDays weekday numbering in create_task description', async () => {
      const res = await request(app)
        .post('/mcp')
        .query({ token: authToken })
        .send({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        })

      const createTask = res.body.result.tools.find((t: { name: string }) => t.name === 'create_task')
      expect(createTask).toBeDefined()
      expect(createTask.description).toMatch(/0\s*=\s*Sunday/i)
      expect(createTask.description).toMatch(/6\s*=\s*Saturday/i)
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

      it('should update recurrenceDays and dueDate on an existing task', async () => {
        // Create a weekly task on Mondays
        const createRes = await request(app)
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
                timeOfDay: 'evening',
                recurrenceType: 'weekly',
                recurrenceDays: [1],
                dueDate: '2026-05-04T00:00:00Z',
              },
            },
            id: 3,
          })
        const taskId = createRes.body.result.content[0].text.match(/ID: ([a-z0-9]+)/)[1]

        // Update both recurrenceDays (to Mon-Fri) and dueDate
        const res = await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'update_task',
              arguments: {
                taskId,
                recurrenceDays: [1, 2, 3, 4, 5],
                dueDate: '2026-05-11T00:00:00Z',
              },
            },
            id: 4,
          })

        expect(res.status).toBe(200)
        expect(res.body.error).toBeUndefined()

        // Verify the task was actually updated in the DB
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
        const updated = tasks.find((t: { id: string }) => t.id === taskId)
        expect(updated.recurrenceDays).toEqual([1, 2, 3, 4, 5])
        expect(updated.dueDate).toContain('2026-05-11')
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

      it('should auto-set dueDate when creating weekly task without explicit dueDate', async () => {
        const today = new Date()
        const todayDay = today.getDay()
        const nonTodayDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== todayDay)
        const recurrenceDays = nonTodayDays.slice(0, 2)

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
                title: 'Weekly No DueDate',
                timeOfDay: 'afternoon',
                recurrenceType: 'weekly',
                recurrenceDays,
              },
            },
            id: 3,
          })

        expect(res.status).toBe(200)
        const taskId = res.body.result.content[0].text.match(/ID: ([a-z0-9]+)/)[1]
        const task = await adminPb.collection('tasks').getOne(taskId)
        expect(task.dueDate).not.toBe('')
        expect(task.dueDate).not.toBeNull()

        const dueDate = new Date(task.dueDate)
        const dueDay = dueDate.getDay()
        expect(recurrenceDays).toContain(dueDay)
      })

      it('should set dueDate to today when creating weekly task that includes today', async () => {
        const today = new Date()
        const todayDay = today.getDay()

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
                title: 'Weekly Includes Today',
                timeOfDay: 'afternoon',
                recurrenceType: 'weekly',
                recurrenceDays: [todayDay],
              },
            },
            id: 3,
          })

        expect(res.status).toBe(200)
        const taskId = res.body.result.content[0].text.match(/ID: ([a-z0-9]+)/)[1]
        const task = await adminPb.collection('tasks').getOne(taskId)
        expect(task.dueDate).not.toBe('')
        expect(task.dueDate).not.toBeNull()

        const dueDate = new Date(task.dueDate)
        expect(dueDate.toISOString().slice(0, 10)).toBe(today.toISOString().slice(0, 10))
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

      it('should configure timezone for a group', async () => {
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
                timezone: 'America/New_York',
              },
            },
            id: 2,
          })

        expect(res.status).toBe(200)

        const group = await adminPb.collection('groups').getOne(groupId)
        expect(group.timezone).toBe('America/New_York')
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

      it('should list groups with timezone', async () => {
        await adminPb.collection('groups').update(groupId, {
          timezone: 'Europe/Berlin',
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
        expect(groups[0].timezone).toBe('Europe/Berlin')
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

    describe('Reward Tools', () => {
      let groupId: string
      let childId: string

      beforeEach(async () => {
        const groupRes = await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_group',
              arguments: { name: 'Reward Test Family' },
            },
            id: 1,
          })
        groupId = groupRes.body.result.content[0].text.match(/ID: ([a-z0-9]+)/)[1]

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

      it('should create a reward', async () => {
        const res = await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_reward',
              arguments: {
                groupId,
                name: 'Ice Cream',
                description: 'A scoop of ice cream',
                pointsCost: 50,
              },
            },
            id: 3,
          })

        expect(res.status).toBe(200)
        expect(res.body.result.content[0].text).toContain('Created reward')
        expect(res.body.result.content[0].text).toContain('Ice Cream')
      })

      it('should list rewards for a group', async () => {
        await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_reward',
              arguments: { groupId, name: 'Ice Cream', pointsCost: 50 },
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
              name: 'list_rewards',
              arguments: { groupId },
            },
            id: 4,
          })

        expect(res.status).toBe(200)
        const rewards = JSON.parse(res.body.result.content[0].text)
        expect(rewards).toHaveLength(1)
        expect(rewards[0].name).toBe('Ice Cream')
        expect(rewards[0].pointsCost).toBe(50)
      })

      it('should update a reward', async () => {
        const createRes = await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_reward',
              arguments: { groupId, name: 'Ice Cream', pointsCost: 50 },
            },
            id: 3,
          })
        const rewardId = createRes.body.result.content[0].text.match(/ID: ([a-z0-9]+)/)[1]

        const res = await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'update_reward',
              arguments: { rewardId, name: 'Double Ice Cream', pointsCost: 100 },
            },
            id: 4,
          })

        expect(res.status).toBe(200)
        expect(res.body.result.content[0].text).toContain('Updated reward')
      })

      it('should delete a reward', async () => {
        const createRes = await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_reward',
              arguments: { groupId, name: 'Ice Cream', pointsCost: 50 },
            },
            id: 3,
          })
        const rewardId = createRes.body.result.content[0].text.match(/ID: ([a-z0-9]+)/)[1]

        const res = await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'delete_reward',
              arguments: { rewardId },
            },
            id: 4,
          })

        expect(res.status).toBe(200)
        expect(res.body.result.content[0].text).toContain('Deleted reward')
      })

      it('should get points balance for a child', async () => {
        const res = await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'get_points_balance',
              arguments: { childId },
            },
            id: 3,
          })

        expect(res.status).toBe(200)
        const result = JSON.parse(res.body.result.content[0].text)
        expect(result.balance).toBe(0)
        expect(result.childId).toBe(childId)
      })

      it('should redeem a reward and deduct points', async () => {
        await adminPb.collection('point_transactions').create({
          child: childId,
          points: 100,
          type: 'earned',
          description: 'Test points',
        })

        const rewardRes = await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_reward',
              arguments: { groupId, name: 'Ice Cream', pointsCost: 50 },
            },
            id: 3,
          })
        const rewardId = rewardRes.body.result.content[0].text.match(/ID: ([a-z0-9]+)/)[1]

        const res = await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'redeem_reward',
              arguments: { childId, rewardId },
            },
            id: 4,
          })

        expect(res.status).toBe(200)
        expect(res.body.result.content[0].text).toContain('Redeemed')

        const balanceRes = await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'get_points_balance',
              arguments: { childId },
            },
            id: 5,
          })

        const balance = JSON.parse(balanceRes.body.result.content[0].text)
        expect(balance.balance).toBe(50)
      })

      it('should reject redemption when insufficient points', async () => {
        const rewardRes = await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'create_reward',
              arguments: { groupId, name: 'Expensive', pointsCost: 1000 },
            },
            id: 3,
          })
        const rewardId = rewardRes.body.result.content[0].text.match(/ID: ([a-z0-9]+)/)[1]

        const res = await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'redeem_reward',
              arguments: { childId, rewardId },
            },
            id: 4,
          })

        expect(res.status).toBe(200)
        expect(res.body.result.isError).toBe(true)
        expect(res.body.result.content[0].text).toContain('Insufficient')
      })

      it('should create task with points', async () => {
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
                title: 'Bonus Task',
                timeOfDay: 'morning',
                points: 10,
              },
            },
            id: 3,
          })

        expect(res.status).toBe(200)
        const taskId = res.body.result.content[0].text.match(/ID: ([a-z0-9]+)/)[1]
        const task = await adminPb.collection('tasks').getOne(taskId)
        expect(task.points).toBe(10)
      })

      it('should list tasks with points field', async () => {
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
                title: 'Points Task',
                timeOfDay: 'afternoon',
                points: 5,
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
        expect(tasks[0].points).toBe(5)
      })

      it('should include reward tools in tools/list', async () => {
        const res = await request(app)
          .post('/mcp')
          .query({ token: authToken })
          .send({
            jsonrpc: '2.0',
            method: 'tools/list',
            id: 1,
          })

        const toolNames = res.body.result.tools.map((t: { name: string }) => t.name)
        expect(toolNames).toContain('create_reward')
        expect(toolNames).toContain('list_rewards')
        expect(toolNames).toContain('update_reward')
        expect(toolNames).toContain('delete_reward')
        expect(toolNames).toContain('get_points_balance')
        expect(toolNames).toContain('redeem_reward')
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

  it('should use timezone to determine weekday correctly', () => {
    // 2026-03-13 23:30 UTC = 2026-03-14 00:30 Europe/Berlin (CET = UTC+1)
    // In UTC it's Friday (day 5), but in Berlin it's Saturday (day 6)
    const completed = new Date('2026-03-13T23:30:00Z')
    // Schedule for Sunday(0) only
    // In UTC (Friday), next Sunday = 2 days = 2026-03-15
    // In Berlin (Saturday), next Sunday = 1 day = 2026-03-15
    // Schedule for Saturday(6) only
    // In UTC (Friday), next Saturday = 1 day = 2026-03-14
    // In Berlin (Saturday), it's already Saturday, so next Saturday = 7 days = 2026-03-21
    // But calculateNextDueDate uses > not >= so even in Berlin next Sat = 7 days
    // Let's test with Monday(1):
    // In UTC (Friday day 5): next Monday = 3 days = 2026-03-16
    // In Berlin (Saturday day 6): next Monday = 2 days = 2026-03-16 (same result but different day calc)
    // Better test: schedule for Friday(5)
    // In UTC (Friday day 5): next Friday = 7 days (since > not >=) = 2026-03-20
    // In Berlin (Saturday day 6): next Friday = 6 days = 2026-03-20 (same)
    // Most telling test: schedule for Saturday(6)
    // In UTC (Friday day 5): next Saturday = 1 day = 2026-03-14
    // In Berlin (Saturday day 6): next Saturday = 7 days = 2026-03-21
    const result = calculateNextDueDate('weekly', null, [6], completed, 'Europe/Berlin')
    expect(result).toContain('2026-03-21') // next Saturday in Berlin timezone
  })
})

describe('calculateInitialDueDate', () => {
  it('should return today when today is in recurrenceDays', () => {
    // 2026-03-13 is a Friday (day 5)
    const today = new Date('2026-03-13T10:00:00Z')
    const result = calculateInitialDueDate('weekly', null, [5], today)
    expect(result).toContain('2026-03-13')
  })

  it('should return next matching day when today is not in recurrenceDays', () => {
    // 2026-03-13 is a Friday (day 5)
    const today = new Date('2026-03-13T10:00:00Z')
    const result = calculateInitialDueDate('weekly', null, [1, 3], today)
    expect(result).toContain('2026-03-16') // Monday
  })

  it('should return today for interval type', () => {
    const today = new Date('2026-03-13T10:00:00Z')
    const result = calculateInitialDueDate('interval', 3, null, today)
    expect(result).toContain('2026-03-13')
  })

  it('should return null for non-recurring tasks', () => {
    const today = new Date('2026-03-13T10:00:00Z')
    expect(calculateInitialDueDate(null, null, null, today)).toBeNull()
  })

  it('should use timezone to determine today correctly', () => {
    // 2026-03-13 23:30 UTC = 2026-03-14 00:30 Europe/Berlin
    // In UTC it's Friday (day 5), in Berlin it's Saturday (day 6)
    const today = new Date('2026-03-13T23:30:00Z')
    // recurrenceDays includes Saturday(6)
    // In Berlin, today IS Saturday, so should return 2026-03-14
    const result = calculateInitialDueDate('weekly', null, [6], today, 'Europe/Berlin')
    expect(result).toContain('2026-03-14')
  })

  it('should return today in local timezone for interval type', () => {
    // 2026-03-13 23:30 UTC = 2026-03-14 00:30 in Europe/Berlin
    const today = new Date('2026-03-13T23:30:00Z')
    const result = calculateInitialDueDate('interval', 3, null, today, 'Europe/Berlin')
    expect(result).toContain('2026-03-14')
  })
})
