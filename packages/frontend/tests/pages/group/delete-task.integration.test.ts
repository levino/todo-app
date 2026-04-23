import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import PocketBase from 'pocketbase'
import request from 'supertest'
import { app } from '@family-todo/mcp/src/server.js'
import TasksPage from '../../../src/pages/group/[groupId]/tasks/index.astro'
import { deleteTask } from '../../../src/lib/tasks'
import { resetPocketBase } from '@/lib/pocketbase'
import { authUser } from '../../helpers'

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

const mcpCall = (token: string, toolName: string, args: Record<string, unknown>) =>
  request(app)
    .post('/mcp')
    .query({ token })
    .send({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: toolName, arguments: args },
      id: 1,
    })
    .then((res) => res.body)

const extractId = (text: string) => text.match(/ID: ([a-z0-9]+)/)?.[1] ?? ''

const travelTo = (datetime: string) => vi.setSystemTime(new Date(datetime))

describe('Delete Task Integration Tests', () => {
  let authToken: string
  let userPb: PocketBase
  let adminPb: PocketBase
  let container: AstroContainer
  let groupId: string
  let childId: string

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    resetPocketBase()

    adminPb = new PocketBase(POCKETBASE_URL)
    await adminPb
      .collection('_superusers')
      .authWithPassword('admin@test.local', 'testtest123')

    const email = `test-${Date.now()}@example.com`
    await adminPb.collection('users').create({
      email,
      password: 'testtest123',
      passwordConfirm: 'testtest123',
    })

    userPb = new PocketBase(POCKETBASE_URL)
    await userPb.collection('users').authWithPassword(email, 'testtest123')
    authToken = userPb.authStore.token

    container = await AstroContainer.create()

    const groupResult = await mcpCall(authToken, 'create_group', {
      name: 'Test Family',
    })
    groupId = extractId(groupResult.result.content[0].text)

    const childResult = await mcpCall(authToken, 'create_child', {
      groupId,
      name: 'TestKind',
      color: '#FF6B6B',
    })
    childId = extractId(childResult.result.content[0].text)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const createTask = (overrides: Record<string, unknown> = {}) =>
    mcpCall(authToken, 'create_task', {
      childId,
      title: 'Test Task',
      timeOfDay: 'morning',
      priority: 1,
      ...overrides,
    }).then((r) => extractId(r.result.content[0].text))

  const renderPage = () =>
    container.renderToString(TasksPage, {
      params: { groupId },
      locals: { pb: userPb, user: authUser(userPb) },
      request: new Request(
        `http://localhost/group/${groupId}/tasks?child=${childId}`,
      ),
    })

  const doDeleteTask = (taskId: string) => deleteTask(userPb, taskId)

  const getTaskSafe = async (taskId: string) => {
    try {
      return await adminPb.collection('tasks').getOne(taskId)
    } catch {
      return null
    }
  }

  describe('deleteTask function', () => {
    it('deletes a task from PocketBase', async () => {
      travelTo('2026-03-10T07:00:00Z')
      const taskId = await createTask({
        title: 'Unwichtig',
        timeOfDay: 'morning',
        dueDate: '2026-03-10',
      })

      expect(await getTaskSafe(taskId)).not.toBeNull()

      const result = await doDeleteTask(taskId)

      expect(result.error).toBeUndefined()
      expect(await getTaskSafe(taskId)).toBeNull()
    })

    it('deletes a task regardless of phase', async () => {
      travelTo('2026-03-10T13:00:00Z')
      const taskId = await createTask({
        title: 'Abendaufgabe',
        timeOfDay: 'evening',
        dueDate: '2026-03-10',
      })

      const result = await doDeleteTask(taskId)

      expect(result.error).toBeUndefined()
      expect(await getTaskSafe(taskId)).toBeNull()
    })

    it('returns not-found error when task does not exist', async () => {
      const result = await doDeleteTask('nonexistentid1')
      expect(result.error).toBe('not-found')
    })
  })

  describe('UI: delete button', () => {
    it('renders a delete (trash) button on each active task', async () => {
      travelTo('2026-03-10T07:00:00Z')
      await createTask({
        title: 'Löschbar',
        timeOfDay: 'morning',
        dueDate: '2026-03-10',
      })

      const html = await renderPage()

      expect(html).toContain('data-testid="delete-button"')
    })

    it('delete button form posts to deleteTask action with taskId', async () => {
      travelTo('2026-03-10T07:00:00Z')
      const taskId = await createTask({
        title: 'Löschbar',
        timeOfDay: 'morning',
        dueDate: '2026-03-10',
      })

      const html = await renderPage()

      expect(html).toContain('data-testid="delete-form"')
      expect(html).toContain(`value="${taskId}"`)
    })

    it('renders a delete-confirm dialog for the page', async () => {
      travelTo('2026-03-10T07:00:00Z')
      await createTask({
        title: 'Löschbar',
        timeOfDay: 'morning',
        dueDate: '2026-03-10',
      })

      const html = await renderPage()

      expect(html).toContain('data-testid="delete-confirm-dialog"')
    })
  })
})
