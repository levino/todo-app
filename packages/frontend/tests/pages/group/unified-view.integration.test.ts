import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest'
import PocketBase from 'pocketbase'
import TasksPage from '../../../src/pages/group/[groupId]/tasks/index.astro'
import { resetPocketBase } from '@/lib/pocketbase'
import { getCurrentPhase, completeTask } from '@/lib/tasks'
import { authUser } from '../../helpers'

const POCKETBASE_URL =
  process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

describe('Unified Task View', () => {
  let adminPb: PocketBase
  let userPb: PocketBase
  let container: AstroContainer
  let groupId: string
  let child1Id: string
  let child2Id: string
  let userId: string
  let currentPhase: string

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-03-13T14:00:00Z'))

    resetPocketBase()

    adminPb = new PocketBase(POCKETBASE_URL)
    await adminPb
      .collection('_superusers')
      .authWithPassword('admin@test.local', 'testtest123')

    const email = `unified-${Date.now()}@example.com`
    const user = await adminPb.collection('users').create({
      email,
      password: 'testtest123',
      passwordConfirm: 'testtest123',
    })
    userId = user.id

    userPb = new PocketBase(POCKETBASE_URL)
    await userPb.collection('users').authWithPassword(email, 'testtest123')

    const group = await adminPb.collection('groups').create({
      name: 'Test Family',
      morningEnd: '00:00',
      eveningStart: '23:59',
    })
    groupId = group.id
    currentPhase = getCurrentPhase('00:00', '23:59', 'Europe/Berlin')

    await adminPb.collection('user_groups').create({
      user: userId,
      group: groupId,
    })

    const child1 = await adminPb.collection('children').create({
      name: 'Max',
      color: '#FF6B6B',
      group: groupId,
    })
    child1Id = child1.id

    const child2 = await adminPb.collection('children').create({
      name: 'Lisa',
      color: '#4ECDC4',
      group: groupId,
    })
    child2Id = child2.id

    container = await AstroContainer.create()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const renderOverview = () =>
    container.renderToString(TasksPage, {
      params: { groupId },
      locals: { pb: userPb, user: authUser(userPb) },
    })

  const renderDetailView = (childId: string) =>
    container.renderToString(TasksPage, {
      params: { groupId },
      locals: { pb: userPb, user: authUser(userPb) },
      request: new Request(
        `http://localhost/group/${groupId}/tasks?child=${childId}`,
      ),
    })

  describe('Overview (no ?child=) shows child columns', () => {
    it('should render each child as a column with data-testid="child-column"', async () => {
      const html = await renderOverview()

      const columnCount = (html.match(/data-testid="child-column"/g) || [])
        .length
      expect(columnCount).toBe(2)
    })
  })

  describe('Detail view (?child=X) shows single child column', () => {
    it('should render exactly one child column', async () => {
      const html = await renderDetailView(child1Id)

      const columnCount = (html.match(/data-testid="child-column"/g) || [])
        .length
      expect(columnCount).toBe(1)
    })
  })

  describe('Both views have identical task card structure', () => {
    it('overview task cards should have data-task-title, complete-button, task-points', async () => {
      await adminPb.collection('tasks').create({
        title: 'Bonus Task',
        child: child1Id,
        completed: false,
        timeOfDay: currentPhase,
        points: 5,
        priority: 1,
        dueDate: '2026-03-12T00:00:00.000Z',
      })

      const html = await renderOverview()

      // data-task-title on form
      expect(html).toContain('data-task-title="Bonus Task"')
      // complete button
      expect(html).toContain('data-testid="complete-button"')
      // task points badge
      expect(html).toContain('data-testid="task-points"')
      // overdue badge (task is from yesterday)
      expect(html).toContain('data-testid="overdue-badge"')
    })

    it('detail task cards should have same structure', async () => {
      await adminPb.collection('tasks').create({
        title: 'Bonus Task',
        child: child1Id,
        completed: false,
        timeOfDay: currentPhase,
        points: 5,
        priority: 1,
        dueDate: '2026-03-12T00:00:00.000Z',
      })

      const html = await renderDetailView(child1Id)

      expect(html).toContain('data-task-title="Bonus Task"')
      expect(html).toContain('data-testid="complete-button"')
      expect(html).toContain('data-testid="task-points"')
      expect(html).toContain('data-testid="overdue-badge"')
    })
  })

  describe('Overview uses string comparison for overdue (not Date)', () => {
    it('should mark yesterday task as overdue in overview using string comparison', async () => {
      await adminPb.collection('tasks').create({
        title: 'Yesterday Task',
        child: child1Id,
        completed: false,
        timeOfDay: currentPhase,
        priority: 1,
        dueDate: '2026-03-12T00:00:00.000Z',
      })

      const html = await renderOverview()

      expect(html).toContain('data-overdue="true"')
      expect(html).toContain('data-testid="overdue-badge"')
    })
  })

  describe('Overview shows points balance per child', () => {
    it('should display points balance for each child in overview', async () => {
      await adminPb.collection('point_transactions').create({
        child: child1Id,
        points: 42,
        type: 'earned',
        description: 'Test',
      })

      await adminPb.collection('tasks').create({
        title: 'Some Task',
        child: child1Id,
        completed: false,
        timeOfDay: currentPhase,
        points: 5,
        priority: 1,
      })

      const html = await renderOverview()

      expect(html).toContain('data-testid="points-balance"')
      expect(html).toContain('42')
    })
  })

  describe('Overview shows recently completed with undo buttons', () => {
    it('should show undo button in overview recently completed section', async () => {
      const task = await adminPb.collection('tasks').create({
        title: 'Done Task',
        child: child1Id,
        completed: false,
        timeOfDay: currentPhase,
        priority: 1,
        dueDate: '2026-03-13T00:00:00.000Z',
      })

      await completeTask(userPb, task.id, child1Id, child1Id, groupId)

      const html = await renderOverview()

      expect(html).toContain('data-testid="recently-completed"')
      expect(html).toContain('Done Task')
      expect(html).toContain('data-testid="undo-button"')
    })
  })

  describe('Container width differs between views', () => {
    it('overview should use max-w-6xl', async () => {
      const html = await renderOverview()
      expect(html).toContain('max-w-6xl')
    })

    it('detail view should use max-w-3xl', async () => {
      const html = await renderDetailView(child1Id)
      expect(html).toContain('max-w-3xl')
    })
  })
})
