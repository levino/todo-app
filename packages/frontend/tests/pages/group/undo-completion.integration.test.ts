import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import PocketBase from 'pocketbase'
import request from 'supertest'
import { app } from '@family-todo/mcp/src/server.js'
import TasksChildPage from '../../../src/pages/group/[groupId]/tasks/[childId].astro'
import { POST as completePost } from '../../../src/pages/api/groups/[groupId]/tasks/[taskId]/complete'
import { resetPocketBase } from '@/lib/pocketbase'

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

describe('Undo Completion Integration Tests', () => {
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
    container.renderToString(TasksChildPage, {
      params: { groupId, childId },
      locals: { pb: userPb, user: userPb.authStore.record },
      request: new Request(
        `http://localhost/group/${groupId}/tasks/${childId}`,
      ),
    })

  const completeTask = (taskId: string) => {
    const formData = new FormData()
    formData.append('childId', childId)
    return completePost({
      params: { groupId, taskId },
      request: new Request(
        `http://localhost/api/groups/${groupId}/tasks/${taskId}/complete`,
        { method: 'POST', body: formData },
      ),
      locals: { pb: userPb, user: userPb.authStore.record },
    } as Parameters<typeof completePost>[0])
  }

  const getTask = (taskId: string) => adminPb.collection('tasks').getOne(taskId)

  // ====== A. Page Rendering — "Heute erledigt" section ======

  describe('A. Page Rendering', () => {
    it('does not show "Heute erledigt" section when nothing completed today', async () => {
      travelTo('2026-03-10T07:00:00Z')
      await createTask({ title: 'Uncompleted Task', timeOfDay: 'morning', dueDate: '2026-03-10' })

      const html = await renderPage()

      expect(html).not.toContain('data-testid="recently-completed"')
    })

    it('shows non-recurring task completed today in "Heute erledigt" section', async () => {
      travelTo('2026-03-10T07:00:00Z')
      const taskId = await createTask({
        title: 'Zähne putzen',
        timeOfDay: 'morning',
        dueDate: '2026-03-10',
      })

      await completeTask(taskId)

      const html = await renderPage()

      expect(html).toContain('data-testid="recently-completed"')
      expect(html).toContain('data-testid="completed-task-item"')
      expect(html).toContain('Zähne putzen')
      expect(html).toContain('Heute erledigt')
    })

    it('shows recurring task completed today in "Heute erledigt" section', async () => {
      travelTo('2026-03-10T07:00:00Z')
      const taskId = await createTask({
        title: 'Zimmer aufräumen',
        timeOfDay: 'morning',
        recurrenceType: 'interval',
        recurrenceInterval: 1,
        dueDate: '2026-03-10',
      })

      await completeTask(taskId)

      const html = await renderPage()

      expect(html).toContain('data-testid="recently-completed"')
      expect(html).toContain('Zimmer aufräumen')
    })

    it('shows tasks from all phases (cross-phase)', async () => {
      travelTo('2026-03-10T07:00:00Z')

      // Create and complete a morning task
      const morningTaskId = await createTask({
        title: 'Morgenaufgabe erledigt',
        timeOfDay: 'morning',
        dueDate: '2026-03-10',
      })
      await completeTask(morningTaskId)

      // Create an afternoon task completed via direct DB update (simulating earlier completion)
      await adminPb.collection('tasks').create({
        title: 'Nachmittagsaufgabe erledigt',
        child: childId,
        timeOfDay: 'afternoon',
        priority: 1,
        completed: true,
        completedAt: '2026-03-10T14:00:00Z',
        lastCompletedAt: '2026-03-10T14:00:00Z',
        dueDate: '2026-03-10',
      })

      const html = await renderPage()

      expect(html).toContain('Morgenaufgabe erledigt')
      expect(html).toContain('Nachmittagsaufgabe erledigt')
    })

    it('does NOT show tasks completed yesterday', async () => {
      // Complete a task yesterday
      travelTo('2026-03-09T07:00:00Z')
      const taskId = await createTask({
        title: 'Gestern erledigt',
        timeOfDay: 'morning',
        dueDate: '2026-03-09',
      })
      await completeTask(taskId)

      // Now it's today
      travelTo('2026-03-10T07:00:00Z')
      const html = await renderPage()

      expect(html).not.toContain('Gestern erledigt')
    })

    it('shows celebration AND "Heute erledigt" together', async () => {
      travelTo('2026-03-10T07:00:00Z')
      const taskId = await createTask({
        title: 'Einzige Aufgabe',
        timeOfDay: 'morning',
        dueDate: '2026-03-10',
      })

      await completeTask(taskId)

      const html = await renderPage()

      // Should show celebration (no active tasks left)
      expect(html).toContain('data-testid="celebration"')
      // AND show the recently completed section
      expect(html).toContain('data-testid="recently-completed"')
      expect(html).toContain('Einzige Aufgabe')
    })

    it('undo button has correct form action', async () => {
      travelTo('2026-03-10T07:00:00Z')
      const taskId = await createTask({
        title: 'Undo Test',
        timeOfDay: 'morning',
        dueDate: '2026-03-10',
      })

      await completeTask(taskId)

      const html = await renderPage()

      expect(html).toContain('data-testid="undo-button"')
      expect(html).toContain(`/api/groups/${groupId}/tasks/${taskId}/undo`)
    })
  })

  // ====== B. Undo API ======

  describe('B. Undo API', () => {
    it('undo non-recurring task: sets completed=false, completedAt=null', async () => {
      travelTo('2026-03-10T07:00:00Z')
      const taskId = await createTask({
        title: 'Undo Non-Recurring',
        timeOfDay: 'morning',
        dueDate: '2026-03-10',
      })

      await completeTask(taskId)

      // Verify task is completed
      const completedTask = await getTask(taskId)
      expect(completedTask.completed).toBe(true)
      expect(completedTask.completedAt).toBeTruthy()

      const { POST: undoPost } = await import('../../../src/pages/api/groups/[groupId]/tasks/[taskId]/undo')

      const formData = new FormData()
      formData.append('childId', childId)

      await undoPost({
        params: { groupId, taskId },
        request: new Request(
          `http://localhost/api/groups/${groupId}/tasks/${taskId}/undo`,
          { method: 'POST', body: formData },
        ),
        locals: { pb: userPb, user: userPb.authStore.record },
      } as Parameters<typeof undoPost>[0])

      const undoneTask = await getTask(taskId)
      expect(undoneTask.completed).toBe(false)
      expect(undoneTask.completedAt).toBe('')
      expect(undoneTask.completedBy).toBe('')
      expect(undoneTask.lastCompletedAt).toBe('')
      expect(undoneTask.previousDueDate).toBe('')
    })

    it('undo recurring task: restores previousDueDate', async () => {
      travelTo('2026-03-10T07:00:00Z')
      const taskId = await createTask({
        title: 'Undo Recurring',
        timeOfDay: 'morning',
        recurrenceType: 'interval',
        recurrenceInterval: 2,
        dueDate: '2026-03-10',
      })

      await completeTask(taskId)

      // Verify task has advanced dueDate
      const completedTask = await getTask(taskId)
      expect(completedTask.dueDate.slice(0, 10)).toBe('2026-03-12')
      expect(completedTask.previousDueDate.slice(0, 10)).toBe('2026-03-10')

      const { POST: undoPost } = await import('../../../src/pages/api/groups/[groupId]/tasks/[taskId]/undo')

      const formData = new FormData()
      formData.append('childId', childId)

      await undoPost({
        params: { groupId, taskId },
        request: new Request(
          `http://localhost/api/groups/${groupId}/tasks/${taskId}/undo`,
          { method: 'POST', body: formData },
        ),
        locals: { pb: userPb, user: userPb.authStore.record },
      } as Parameters<typeof undoPost>[0])

      const undoneTask = await getTask(taskId)
      // dueDate restored to original
      expect(undoneTask.dueDate.slice(0, 10)).toBe('2026-03-10')
      expect(undoneTask.lastCompletedAt).toBe('')
      expect(undoneTask.previousDueDate).toBe('')
    })

    it('undo fails for task completed yesterday', async () => {
      travelTo('2026-03-09T07:00:00Z')
      const taskId = await createTask({
        title: 'Yesterday Task',
        timeOfDay: 'morning',
        dueDate: '2026-03-09',
      })

      await completeTask(taskId)

      // Travel to next day
      travelTo('2026-03-10T07:00:00Z')

      const { POST: undoPost } = await import('../../../src/pages/api/groups/[groupId]/tasks/[taskId]/undo')

      const formData = new FormData()
      formData.append('childId', childId)

      const response = await undoPost({
        params: { groupId, taskId },
        request: new Request(
          `http://localhost/api/groups/${groupId}/tasks/${taskId}/undo`,
          { method: 'POST', body: formData },
        ),
        locals: { pb: userPb, user: userPb.authStore.record },
      } as Parameters<typeof undoPost>[0])

      expect(response.status).toBe(400)
    })

    it('undo without auth returns 401', async () => {
      travelTo('2026-03-10T07:00:00Z')
      const taskId = await createTask({
        title: 'Auth Test',
        timeOfDay: 'morning',
        dueDate: '2026-03-10',
      })

      await completeTask(taskId)

      // Import the undo handler dynamically after it exists
      const { POST: undoPost } = await import('../../../src/pages/api/groups/[groupId]/tasks/[taskId]/undo')

      const formData = new FormData()
      formData.append('childId', childId)

      const response = await undoPost({
        params: { groupId, taskId },
        request: new Request(
          `http://localhost/api/groups/${groupId}/tasks/${taskId}/undo`,
          { method: 'POST', body: formData },
        ),
        locals: { pb: userPb, user: null },
      } as Parameters<typeof undoPost>[0])

      expect(response.status).toBe(401)
    })
  })

  // ====== C. complete.ts — previousDueDate ======

  describe('C. complete.ts saves previousDueDate', () => {
    it('saves previousDueDate for recurring (interval) task', async () => {
      travelTo('2026-03-10T07:00:00Z')
      const taskId = await createTask({
        title: 'Recurring Task',
        timeOfDay: 'morning',
        recurrenceType: 'interval',
        recurrenceInterval: 2,
        dueDate: '2026-03-10',
      })

      await completeTask(taskId)

      const task = await getTask(taskId)
      expect(task.previousDueDate).toBeTruthy()
      // The previousDueDate should contain the old due date (2026-03-10)
      expect(task.previousDueDate.slice(0, 10)).toBe('2026-03-10')
    })

    it('saves previousDueDate for non-recurring task', async () => {
      travelTo('2026-03-10T07:00:00Z')
      const taskId = await createTask({
        title: 'One-time Task',
        timeOfDay: 'morning',
        dueDate: '2026-03-10',
      })

      await completeTask(taskId)

      const task = await getTask(taskId)
      expect(task.previousDueDate).toBeTruthy()
      expect(task.previousDueDate.slice(0, 10)).toBe('2026-03-10')
    })
  })
})
