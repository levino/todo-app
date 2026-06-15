import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest'
import TasksPage from '../../../src/pages/group/[groupId]/tasks/index.astro'
import { authUser, createPb, type PbShim } from '../../helpers'

describe('Overdue display on overview page', () => {
  let pb: PbShim
  let adminPb: PbShim
  let container: AstroContainer
  let groupId: string
  let childId: string

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-03-13T14:00:00Z'))
    adminPb = createPb()
    await adminPb
      .collection('_superusers')
      .authWithPassword('admin@test.local', 'testtest123')

    pb = createPb()
    const user = await adminPb.collection('users').create({
      email: `overdue-overview-${Date.now()}@test.local`,
      password: 'testtest123',
      passwordConfirm: 'testtest123',
      name: 'Test User',
    })
    await pb
      .collection('users')
      .authWithPassword(user.email, 'testtest123')

    const group = await adminPb.collection('groups').create({
      name: 'Overdue Test Family',
      morningEnd: '00:00',
      eveningStart: '23:59',
    })
    groupId = group.id

    await adminPb.collection('user_groups').create({
      user: user.id,
      group: groupId,
    })

    const child = await adminPb.collection('children').create({
      name: 'Anna',
      color: '#FF6B6B',
      group: groupId,
    })
    childId = child.id

    container = await AstroContainer.create()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should NOT mark a task due today as overdue on the overview page', async () => {
    await adminPb.collection('tasks').create({
      title: 'Task Due Today',
      child: childId,
      completed: false,
      timeOfDay: 'afternoon',
      dueDate: '2026-03-13',
    })

    const html = await container.renderToString(TasksPage, {
      params: { groupId },
      locals: { db: pb.db, user: authUser(pb) },
    })

    expect(html).toContain('Task Due Today')
    expect(html).not.toContain('data-overdue="true"')
  })

  it('shows a task due yesterday on the overview page but does NOT mark it overdue', async () => {
    await adminPb.collection('tasks').create({
      title: 'Task Due Yesterday',
      child: childId,
      completed: false,
      timeOfDay: 'afternoon',
      dueDate: '2026-03-12',
    })

    const html = await container.renderToString(TasksPage, {
      params: { groupId },
      locals: { db: pb.db, user: authUser(pb) },
    })

    expect(html).toContain('Task Due Yesterday')
    expect(html).not.toContain('data-overdue="true"')
    expect(html).not.toContain('Überfällig')
  })
})
