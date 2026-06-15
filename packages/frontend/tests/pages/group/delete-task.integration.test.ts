import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import TasksPage from '../../../src/pages/group/[groupId]/tasks/index.astro'
import { deleteTask } from '../../../src/lib/tasks'
import { authUser, createPb, type PbShim } from '../../helpers'
import { createMcpCall } from '../../mcp-stub'



let mcpCall: ReturnType<typeof createMcpCall>

const extractId = (text: string) => text.match(/ID: ([a-z0-9]+)/)?.[1] ?? ''

const travelTo = (datetime: string) => vi.setSystemTime(new Date(datetime))

describe('Delete Task Integration Tests', () => {
  let authToken: string
  let userPb: PbShim
  let adminPb: PbShim
  let container: AstroContainer
  let groupId: string
  let childId: string

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    adminPb = createPb()
    await adminPb
      .collection('_superusers')
      .authWithPassword('admin@test.local', 'testtest123')

    const email = `test-${Date.now()}@example.com`
    await adminPb.collection('users').create({
      email,
      password: 'testtest123',
      passwordConfirm: 'testtest123',
    })

    userPb = createPb()
    await userPb.collection('users').authWithPassword(email, 'testtest123')
    authToken = userPb.authStore.token
    mcpCall = createMcpCall(userPb.db, userPb.authStore.record!.id)

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
      locals: { db: userPb.db, user: authUser(userPb) },
      request: new Request(
        `http://localhost/group/${groupId}/tasks?child=${childId}`,
      ),
    })

  const doDeleteTask = (taskId: string) => deleteTask(userPb.db, taskId)

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

    it('skips only the current instance of an interval-recurring task', async () => {
      travelTo('2026-03-10T07:00:00Z')
      const taskId = await createTask({
        title: 'Müll rausbringen',
        timeOfDay: 'morning',
        dueDate: '2026-03-09',
        recurrenceType: 'interval',
        recurrenceInterval: 2,
      })

      travelTo('2026-03-10T07:00:00Z')
      const result = await doDeleteTask(taskId)

      expect(result.error).toBeUndefined()

      const task = await getTaskSafe(taskId)
      expect(task).not.toBeNull()
      expect(task?.dueDate?.slice(0, 10)).toBe('2026-03-11')
      expect(task?.recurrenceType).toBe('interval')
      expect(task?.recurrenceInterval).toBe(2)
      expect(task?.lastCompletedAt).toBeFalsy()
      expect(task?.completed).toBe(false)
    })

    it('skips only the current instance of a weekly-recurring task', async () => {
      travelTo('2026-03-10T07:00:00Z')
      const taskId = await createTask({
        title: 'Klavier üben',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-09',
        recurrenceType: 'weekly',
        recurrenceDays: [1, 3, 5],
      })

      travelTo('2026-03-10T07:00:00Z')
      const result = await doDeleteTask(taskId)

      expect(result.error).toBeUndefined()

      const task = await getTaskSafe(taskId)
      expect(task).not.toBeNull()
      expect(task?.dueDate?.slice(0, 10)).toBe('2026-03-11')
      expect(task?.recurrenceType).toBe('weekly')
      expect(task?.lastCompletedAt).toBeFalsy()
      expect(task?.completed).toBe(false)
    })

    // Bug: a weekly task (Mon-Fri) left uncompleted for several days piles up
    // overdue instances. Deleting it should clear the whole backlog in ONE click
    // and reappear only at the next occurrence AFTER today, not the next calendar
    // day still in the past.
    it('clears the whole overdue backlog of a weekly task and jumps past today', async () => {
      // 2026-03-09 is a Monday. Task recurs Mon-Fri but was never done.
      travelTo('2026-03-09T07:00:00Z')
      const taskId = await createTask({
        title: 'Zähne putzen',
        timeOfDay: 'morning',
        dueDate: '2026-03-09',
        recurrenceType: 'weekly',
        recurrenceDays: [1, 2, 3, 4, 5],
      })

      // It's now Thursday (2026-03-12). dueDate is still stuck on Monday.
      travelTo('2026-03-12T07:00:00Z')
      const result = await doDeleteTask(taskId)

      expect(result.error).toBeUndefined()

      // After one delete it must be gone for today (Thu) and reappear on Friday.
      const task = await getTaskSafe(taskId)
      expect(task).not.toBeNull()
      expect(task?.dueDate?.slice(0, 10)).toBe('2026-03-13') // Friday
      expect(task?.completed).toBe(false)
    })

    it('does not leave todays instance behind when deleting an overdue daily-interval task', async () => {
      // interval=1 (daily), never completed since Monday.
      travelTo('2026-03-09T07:00:00Z')
      const taskId = await createTask({
        title: 'Vitamin nehmen',
        timeOfDay: 'morning',
        dueDate: '2026-03-09',
        recurrenceType: 'interval',
        recurrenceInterval: 1,
      })

      // Delete on Tuesday -> must skip Tuesday too, reappear Wednesday.
      travelTo('2026-03-10T07:00:00Z')
      const result = await doDeleteTask(taskId)

      expect(result.error).toBeUndefined()

      const task = await getTaskSafe(taskId)
      expect(task).not.toBeNull()
      expect(task?.dueDate?.slice(0, 10)).toBe('2026-03-11') // Wednesday
      expect(task?.completed).toBe(false)
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

    it('gives the delete button a large (>=56px) finger-friendly tap target', async () => {
      travelTo('2026-03-10T07:00:00Z')
      await createTask({
        title: 'Löschbar',
        timeOfDay: 'morning',
        dueDate: '2026-03-10',
      })

      const html = await renderPage()

      const deleteButton = html.match(/<button[^>]*data-testid="delete-button"[^>]*>/)?.[0] ?? ''
      expect(deleteButton).not.toBe('')
      // The trash icon was too small to hit reliably; the button must now be a
      // proper >=56px touch target instead of the tiny btn-sm circle.
      expect(deleteButton).toContain('min-h-[56px]')
      expect(deleteButton).toContain('min-w-[56px]')
      expect(deleteButton).not.toContain('btn-sm')
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
