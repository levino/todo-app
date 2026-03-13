import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach } from 'vitest'
import PocketBase from 'pocketbase'
import TasksPage from '../../../src/pages/group/[groupId]/tasks/index.astro'
import { resetPocketBase } from '@/lib/pocketbase'

const POCKETBASE_URL =
  process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

describe('Confirmation Dialog on Overview Page', () => {
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

    const email = `confirm-${Date.now()}@example.com`
    const user = await adminPb.collection('users').create({
      email,
      password: 'testtest123',
      passwordConfirm: 'testtest123',
    })
    userId = user.id

    userPb = new PocketBase(POCKETBASE_URL)
    await userPb.collection('users').authWithPassword(email, 'testtest123')

    const group = await adminPb.collection('groups').create({ name: 'Test Family', morningEnd: '00:00', eveningStart: '23:59' })
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

  it('should have confirm dialog markup on overview page', async () => {
    await adminPb.collection('tasks').create({
      title: 'Zähne putzen',
      child: childId,
      completed: false,
      timeOfDay: 'afternoon',
    })

    const html = await container.renderToString(TasksPage, {
      params: { groupId },
      locals: { pb: userPb, user: userPb.authStore.record },
    })

    expect(html).toContain('data-testid="confirm-dialog"')
    expect(html).toContain('Aufgabe erledigt?')
    expect(html).toContain('data-testid="confirm-cancel"')
    expect(html).toContain('data-testid="confirm-ok"')
  })

  it('should have data-task-title on complete forms in overview', async () => {
    await adminPb.collection('tasks').create({
      title: 'Zähne putzen',
      child: childId,
      completed: false,
      timeOfDay: 'afternoon',
    })

    const html = await container.renderToString(TasksPage, {
      params: { groupId },
      locals: { pb: userPb, user: userPb.authStore.record },
    })

    expect(html).toContain('data-task-title="Zähne putzen"')
  })

  it('should have confirm dialog markup on child view page', async () => {
    await adminPb.collection('tasks').create({
      title: 'Aufräumen',
      child: childId,
      completed: false,
      timeOfDay: 'afternoon',
    })

    const html = await container.renderToString(TasksPage, {
      params: { groupId },
      locals: { pb: userPb, user: userPb.authStore.record },
      request: new Request(`http://localhost/group/${groupId}/tasks?child=${childId}`),
    })

    expect(html).toContain('data-testid="confirm-dialog"')
    expect(html).toContain('data-task-title="Aufräumen"')
  })
})
