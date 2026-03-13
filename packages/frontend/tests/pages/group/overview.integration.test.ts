import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest'
import PocketBase from 'pocketbase'
import TasksPage from '../../../src/pages/group/[groupId]/tasks/index.astro'
import { resetPocketBase } from '@/lib/pocketbase'
import { getCurrentPhase, completeTask, undoTask } from '@/lib/tasks'

const POCKETBASE_URL =
  process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

describe('Tasks Overview Page', () => {
  let pb: PocketBase
  let adminPb: PocketBase
  let container: AstroContainer
  let groupId: string
  let child1Id: string
  let child2Id: string
  let currentPhase: string

  beforeEach(async () => {
    resetPocketBase()
    adminPb = new PocketBase(POCKETBASE_URL)
    await adminPb
      .collection('_superusers')
      .authWithPassword('admin@test.local', 'testtest123')

    pb = new PocketBase(POCKETBASE_URL)
    const user = await adminPb.collection('users').create({
      email: `overview-${Date.now()}@test.local`,
      password: 'testtest123',
      passwordConfirm: 'testtest123',
      name: 'Test User',
    })
    await pb
      .collection('users')
      .authWithPassword(`overview-${Date.now()}@test.local`, 'testtest123')
      .catch(() =>
        pb
          .collection('users')
          .authWithPassword(user.email, 'testtest123'),
      )

    const group = await adminPb.collection('groups').create({
      name: 'Test Family',
      morningEnd: '00:00',
      eveningStart: '23:59',
    })
    groupId = group.id
    currentPhase = getCurrentPhase('00:00', '23:59', 'Europe/Berlin')

    await adminPb.collection('user_groups').create({
      user: user.id,
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

  it('should show tasks from all children', async () => {
    await adminPb.collection('tasks').create({
      title: 'Zähne putzen',
      child: child1Id,
      completed: false,
      timeOfDay: currentPhase,
    })
    await adminPb.collection('tasks').create({
      title: 'Hausaufgaben',
      child: child2Id,
      completed: false,
      timeOfDay: currentPhase,
    })

    const html = await container.renderToString(TasksPage, {
      params: { groupId },
      locals: { pb, user: pb.authStore.record },
    })

    expect(html).toContain('Max')
    expect(html).toContain('Lisa')
    expect(html).toContain('Zähne putzen')
    expect(html).toContain('Hausaufgaben')
  })

  it('should show celebration for child with no tasks', async () => {
    await adminPb.collection('tasks').create({
      title: 'Zähne putzen',
      child: child1Id,
      completed: false,
      timeOfDay: currentPhase,
    })

    const html = await container.renderToString(TasksPage, {
      params: { groupId },
      locals: { pb, user: pb.authStore.record },
    })

    expect(html).toContain('Max')
    expect(html).toContain('Zähne putzen')
    expect(html).toContain('Lisa')
    expect(html).toContain('data-testid="celebration"')
  })

  it('should not show tasks with future dueDate', async () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)

    await adminPb.collection('tasks').create({
      title: 'Future Task',
      child: child1Id,
      completed: false,
      timeOfDay: currentPhase,
      dueDate: tomorrow.toISOString(),
    })
    await adminPb.collection('tasks').create({
      title: 'Today Task',
      child: child1Id,
      completed: false,
      timeOfDay: currentPhase,
    })

    const html = await container.renderToString(TasksPage, {
      params: { groupId },
      locals: { pb, user: pb.authStore.record },
    })

    expect(html).not.toContain('Future Task')
    expect(html).toContain('Today Task')
  })

  it('should include completedBy hidden field in forms', async () => {
    await adminPb.collection('tasks').create({
      title: 'Aufräumen',
      child: child1Id,
      completed: false,
      timeOfDay: currentPhase,
    })

    const html = await container.renderToString(TasksPage, {
      params: { groupId },
      locals: { pb, user: pb.authStore.record },
    })

    expect(html).toContain('name="completedBy"')
  })

  describe('Heute erledigt section on overview', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should show recently completed tasks with undo button on overview page', async () => {
      vi.setSystemTime(new Date('2026-03-10T14:00:00Z'))

      const task = await adminPb.collection('tasks').create({
        title: 'Zimmer aufräumen',
        child: child1Id,
        completed: false,
        timeOfDay: 'afternoon',
        priority: 1,
        dueDate: '2026-03-10',
      })

      await completeTask(pb, task.id, child1Id, child1Id, groupId)

      const html = await container.renderToString(TasksPage, {
        params: { groupId },
        locals: { pb, user: pb.authStore.record },
      })

      expect(html).toContain('data-testid="recently-completed"')
      expect(html).toContain('Zimmer aufräumen')
      expect(html).toContain('data-testid="undo-button"')
    })

    it('should not show completed task in active list after undo on overview', async () => {
      vi.setSystemTime(new Date('2026-03-10T14:00:00Z'))

      const task = await adminPb.collection('tasks').create({
        title: 'Tisch decken',
        child: child1Id,
        completed: false,
        timeOfDay: 'afternoon',
        priority: 1,
        dueDate: '2026-03-10',
      })

      await completeTask(pb, task.id, child1Id, child1Id, groupId)
      await undoTask(pb, task.id)

      const html = await container.renderToString(TasksPage, {
        params: { groupId },
        locals: { pb, user: pb.authStore.record },
      })

      expect(html).toContain('Tisch decken')
      expect(html).toContain('data-testid="task-item"')
      expect(html).not.toContain('data-testid="recently-completed"')
    })
  })
})
