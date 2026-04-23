import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import PocketBase from 'pocketbase'
import request from 'supertest'
import { app } from '@family-todo/mcp/src/server.js'
import TasksIndexPage from '../../../src/pages/group/[groupId]/tasks/index.astro'
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

describe('Bug #47: Completed task stays visible after completion', () => {
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
      title: 'Geige spielen',
      timeOfDay: 'morning',
      priority: 1,
      ...overrides,
    }).then((r) => extractId(r.result.content[0].text))

  const renderChildPage = () => {
    const req = new Request(`http://localhost/group/${groupId}/tasks?child=${childId}`)
    return container.renderToString(TasksIndexPage, {
      params: { groupId },
      locals: { pb: userPb, user: authUser(userPb) },
      request: req,
    })
  }

  const renderOverviewPage = () =>
    container.renderToString(TasksIndexPage, {
      params: { groupId },
      locals: { pb: userPb, user: authUser(userPb) },
      request: new Request(`http://localhost/group/${groupId}/tasks`),
    })

  const completeTaskViaPb = async (taskId: string) => {
    const task = await adminPb.collection('tasks').getOne(taskId)
    const now = new Date().toISOString()

    if (task.recurrenceType === 'interval' || task.recurrenceType === 'weekly') {
      const nextDueDate = new Date()
      nextDueDate.setDate(nextDueDate.getDate() + 1)
      await adminPb.collection('tasks').update(taskId, {
        completed: false,
        lastCompletedAt: now,
        previousDueDate: task.dueDate,
        dueDate: nextDueDate.toISOString().slice(0, 10),
      })
    } else {
      await adminPb.collection('tasks').update(taskId, {
        completed: true,
        completedAt: now,
      })
    }
  }

  describe('child task page', () => {
    it('recurring daily task disappears from active list after completion', async () => {
      travelTo('2026-03-10T07:00:00Z')
      const taskId = await createTask({
        title: 'Geige spielen',
        timeOfDay: 'morning',
        recurrenceType: 'interval',
        recurrenceInterval: 1,
        dueDate: '2026-03-10',
      })

      const htmlBefore = await renderChildPage()
      expect(htmlBefore).toContain('Geige spielen')
      expect(htmlBefore).toContain('data-testid="task-item"')

      await completeTaskViaPb(taskId)

      const htmlAfter = await renderChildPage()
      expect(htmlAfter).not.toContain('data-testid="task-item"')
    })
  })

  describe('overview page (no child selected)', () => {
    it('recurring daily task disappears from overview after completion', async () => {
      travelTo('2026-03-10T07:00:00Z')
      const taskId = await createTask({
        title: 'Geige spielen',
        timeOfDay: 'morning',
        recurrenceType: 'interval',
        recurrenceInterval: 1,
        dueDate: '2026-03-10',
      })

      const htmlBefore = await renderOverviewPage()
      expect(htmlBefore).toContain('Geige spielen')
      expect(htmlBefore).toContain('data-testid="task-item"')

      await completeTaskViaPb(taskId)

      const htmlAfter = await renderOverviewPage()
      expect(htmlAfter).not.toContain('data-testid="task-item"')
    })

    it('recurring weekly task disappears from overview after completion', async () => {
      travelTo('2026-03-10T07:00:00Z')
      const taskId = await createTask({
        title: 'Geige spielen',
        timeOfDay: 'morning',
        recurrenceType: 'weekly',
        recurrenceDays: [2],
        dueDate: '2026-03-10',
      })

      const htmlBefore = await renderOverviewPage()
      expect(htmlBefore).toContain('Geige spielen')
      expect(htmlBefore).toContain('data-testid="task-item"')

      await completeTaskViaPb(taskId)

      const htmlAfter = await renderOverviewPage()
      expect(htmlAfter).not.toContain('data-testid="task-item"')
    })
  })
})
