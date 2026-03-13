import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach } from 'vitest'
import PocketBase from 'pocketbase'
import TasksIndexPage from '../../../src/pages/group/[groupId]/tasks/index.astro'
import { resetPocketBase } from '@/lib/pocketbase'
import { getCurrentPhase } from '@/lib/tasks'

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

describe('Points Display on Task Page', () => {
  let adminPb: PocketBase
  let userPb: PocketBase
  let container: AstroContainer
  let groupId: string
  let childId: string
  let userId: string

  beforeEach(async () => {
    resetPocketBase()

    adminPb = new PocketBase(POCKETBASE_URL)
    await adminPb.collection('_superusers').authWithPassword('admin@test.local', 'testtest123')

    const email = `test-${Date.now()}@example.com`
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

    await adminPb.collection('user_groups').create({
      user: userId,
      group: groupId,
    })

    const child = await adminPb.collection('children').create({
      name: 'Max',
      color: '#FF6B6B',
      group: groupId,
    })
    childId = child.id

    container = await AstroContainer.create()
  })

  it('should show points value on tasks that have points', async () => {
    await adminPb.collection('tasks').create({
      title: 'Bonus Task',
      child: childId,
      priority: 1,
      completed: false,
      timeOfDay: getCurrentPhase('09:00', '18:00', 'Europe/Berlin'),
      points: 10,
    })

    const request = new Request(`http://localhost/group/${groupId}/tasks?child=${childId}`)
    const html = await container.renderToString(TasksIndexPage, {
      params: { groupId },
      locals: { pb: userPb, user: userPb.authStore.record },
      request,
    })

    expect(html).toContain('data-testid="task-points"')
    expect(html).toContain('10')
  })

  it('should not show points badge on tasks without points', async () => {
    await adminPb.collection('tasks').create({
      title: 'No Points Task',
      child: childId,
      priority: 1,
      completed: false,
      timeOfDay: getCurrentPhase('09:00', '18:00', 'Europe/Berlin'),
    })

    const request = new Request(`http://localhost/group/${groupId}/tasks?child=${childId}`)
    const html = await container.renderToString(TasksIndexPage, {
      params: { groupId },
      locals: { pb: userPb, user: userPb.authStore.record },
      request,
    })

    expect(html).not.toContain('data-testid="task-points"')
  })

  it('should show points balance for the child', async () => {
    await adminPb.collection('point_transactions').create({
      child: childId,
      points: 50,
      type: 'earned',
      description: 'Test points',
    })
    await adminPb.collection('point_transactions').create({
      child: childId,
      points: 25,
      type: 'earned',
      description: 'More points',
    })

    await adminPb.collection('tasks').create({
      title: 'Some Task',
      child: childId,
      priority: 1,
      completed: false,
      timeOfDay: getCurrentPhase('09:00', '18:00', 'Europe/Berlin'),
      points: 5,
    })

    const request = new Request(`http://localhost/group/${groupId}/tasks?child=${childId}`)
    const html = await container.renderToString(TasksIndexPage, {
      params: { groupId },
      locals: { pb: userPb, user: userPb.authStore.record },
      request,
    })

    expect(html).toContain('data-testid="points-balance"')
    expect(html).toContain('75')
  })
})
