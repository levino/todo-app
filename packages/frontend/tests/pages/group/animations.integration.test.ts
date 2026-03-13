import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach } from 'vitest'
import PocketBase from 'pocketbase'
import TasksPage from '../../../src/pages/group/[groupId]/tasks/index.astro'
import { resetPocketBase } from '@/lib/pocketbase'
import { getCurrentPhase } from '@/lib/tasks'

const POCKETBASE_URL =
  process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

describe('Task Page Animations and Haptic Feedback', () => {
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
      email: `animations-${Date.now()}@test.local`,
      password: 'testtest123',
      passwordConfirm: 'testtest123',
      name: 'Test User',
    })
    await pb
      .collection('users')
      .authWithPassword(user.email, 'testtest123')

    const group = await adminPb.collection('groups').create({
      name: 'Anim Family',
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

  describe('Overview page animations', () => {
    it('should have transition and active:scale classes on task items', async () => {
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

      // Task items should have press-down animation classes
      expect(html).toMatch(/data-testid="task-item"[^>]*transition-transform/)
      expect(html).toMatch(/data-testid="task-item"[^>]*active:scale/)
      expect(html).toMatch(/data-testid="task-item"[^>]*cursor-pointer/)
    })

    it('should have hover shadow on task items', async () => {
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

      expect(html).toMatch(/data-testid="task-item"[^>]*hover:shadow-md/)
    })

    it('should have transition classes on child name links', async () => {
      const html = await container.renderToString(TasksPage, {
        params: { groupId },
        locals: { pb, user: pb.authStore.record },
      })

      // Child name links should have transition-colors
      expect(html).toMatch(/hover:underline[^"]*transition-colors/)
    })

    it('should have animation classes on complete buttons', async () => {
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

      expect(html).toMatch(/data-testid="complete-button"[^>]*transition-transform/)
      expect(html).toMatch(/data-testid="complete-button"[^>]*active:scale-90/)
    })

    it('should have bounce animation on celebration emoji', async () => {
      // No tasks = celebration shown
      const html = await container.renderToString(TasksPage, {
        params: { groupId },
        locals: { pb, user: pb.authStore.record },
      })

      expect(html).toMatch(/data-testid="celebration-emoji"[^>]*animate-bounce/)
    })
  })

  describe('Child detail page animations', () => {
    it('should have animation classes on child switcher tabs', async () => {
      const html = await container.renderToString(TasksPage, {
        params: { groupId },
        request: new Request(`http://localhost/group/${groupId}/tasks?child=${child1Id}`),
        locals: { pb, user: pb.authStore.record },
      })

      expect(html).toMatch(/data-testid="child-tab"[^>]*transition-all/)
      expect(html).toMatch(/data-testid="child-tab"[^>]*active:scale-95/)
    })

    it('should have task item animations in child detail view', async () => {
      await adminPb.collection('tasks').create({
        title: 'Zähne putzen',
        child: child1Id,
        completed: false,
        timeOfDay: currentPhase,
      })

      const html = await container.renderToString(TasksPage, {
        params: { groupId },
        request: new Request(`http://localhost/group/${groupId}/tasks?child=${child1Id}`),
        locals: { pb, user: pb.authStore.record },
      })

      expect(html).toMatch(/data-testid="task-item"[^>]*transition-transform/)
      expect(html).toMatch(/data-testid="task-item"[^>]*active:scale/)
    })
  })

})
