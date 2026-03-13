import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach } from 'vitest'
import PocketBase from 'pocketbase'
import TasksPage from '../../../src/pages/group/[groupId]/tasks/index.astro'
import { resetPocketBase } from '@/lib/pocketbase'

const POCKETBASE_URL =
  process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

describe('Tasks Overview Page', () => {
  let pb: PocketBase
  let adminPb: PocketBase
  let container: AstroContainer
  let groupId: string
  let child1Id: string
  let child2Id: string

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
      morningEnd: '09:00',
      eveningStart: '18:00',
    })
    groupId = group.id

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
      timeOfDay: 'afternoon',
    })
    await adminPb.collection('tasks').create({
      title: 'Hausaufgaben',
      child: child2Id,
      completed: false,
      timeOfDay: 'afternoon',
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
      timeOfDay: 'afternoon',
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
      timeOfDay: 'afternoon',
      dueDate: tomorrow.toISOString(),
    })
    await adminPb.collection('tasks').create({
      title: 'Today Task',
      child: child1Id,
      completed: false,
      timeOfDay: 'afternoon',
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
      timeOfDay: 'afternoon',
    })

    const html = await container.renderToString(TasksPage, {
      params: { groupId },
      locals: { pb, user: pb.authStore.record },
    })

    expect(html).toContain('name="completedBy"')
  })
})
