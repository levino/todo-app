import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import TasksPage from '../../../src/pages/group/[groupId]/tasks/index.astro'
import { authUser, createPb, type PbShim } from '../../helpers'
import { createMcpCall } from '../../mcp-stub'



let mcpCall: ReturnType<typeof createMcpCall>

const extractId = (text: string) => text.match(/ID: ([a-z0-9]+)/)?.[1] ?? ''

const travelTo = (datetime: string) => vi.setSystemTime(new Date(datetime))

describe('Chore Tasks Integration Tests', () => {
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

    const groupResult = await mcpCall(authToken, 'create_group', { name: 'Test Family' })
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
      request: new Request(`http://localhost/group/${groupId}/tasks?child=${childId}`),
    })

  describe('Chore tasks are never marked overdue', () => {
    it('chore task with past dueDate does NOT show overdue badge', async () => {
      travelTo('2026-03-10T07:00:00Z')
      await createTask({
        title: 'Zähne putzen',
        timeOfDay: 'morning',
        dueDate: '2026-03-08',
        isChore: true,
      })

      const html = await renderPage()
      expect(html).toContain('Zähne putzen')
      expect(html).not.toContain('data-overdue="true"')
      expect(html).not.toContain('Überfällig')
    })

    it('non-chore task with past dueDate still shows, but is not marked overdue', async () => {
      travelTo('2026-03-10T07:00:00Z')
      await createTask({
        title: 'Hausaufgaben',
        timeOfDay: 'morning',
        dueDate: '2026-03-08',
      })

      const html = await renderPage()
      expect(html).toContain('Hausaufgaben')
      expect(html).not.toContain('data-overdue="true"')
      expect(html).not.toContain('Überfällig')
    })

    it('chore task appears next day without being marked overdue', async () => {
      travelTo('2026-03-10T07:00:00Z')
      await createTask({
        title: 'Bett machen',
        timeOfDay: 'morning',
        dueDate: '2026-03-10',
        isChore: true,
      })

      // Next day: task was never completed
      travelTo('2026-03-11T07:00:00Z')
      const html = await renderPage()
      expect(html).toContain('Bett machen')
      expect(html).not.toContain('Überfällig')
      expect(html).not.toContain('data-overdue="true"')
    })

    it('chore task does not sort before non-chore tasks due to overdue status', async () => {
      travelTo('2026-03-10T07:00:00Z')
      await createTask({
        title: 'NormalePrio1',
        timeOfDay: 'morning',
        dueDate: '2026-03-10',
        priority: 1,
      })
      await createTask({
        title: 'ChorePrio2',
        timeOfDay: 'morning',
        dueDate: '2026-03-08', // Past due but chore
        priority: 2,
        isChore: true,
      })

      const html = await renderPage()
      const normalPos = html.indexOf('NormalePrio1')
      const chorePos = html.indexOf('ChorePrio2')
      // Normal task should come first (lower priority number), chore should not jump to top
      expect(normalPos).toBeLessThan(chorePos)
    })
  })
})
