import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest'
import TasksPage from '../../../src/pages/group/[groupId]/tasks/index.astro'
import { authUser, createPb, type PbShim } from '../../helpers'

// The "Überfällig" (overdue) feature was removed entirely: past-due tasks must
// still be shown (so they can be completed) but must NEVER be flagged overdue.
describe('No overdue marking', () => {
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
      email: `no-overdue-${Date.now()}@test.local`,
      password: 'testtest123',
      passwordConfirm: 'testtest123',
      name: 'Test User',
    })
    await pb.collection('users').authWithPassword(user.email, 'testtest123')

    const group = await adminPb.collection('groups').create({
      name: 'No Overdue Family',
      morningEnd: '00:00',
      eveningStart: '23:59',
    })
    groupId = group.id
    await adminPb.collection('user_groups').create({ user: user.id, group: groupId })

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

  const render = () =>
    container.renderToString(TasksPage, {
      params: { groupId },
      locals: { db: pb.db, user: authUser(pb) },
    })

  it('shows a past-due task but never marks it as überfällig', async () => {
    await adminPb.collection('tasks').create({
      title: 'Duschen',
      child: childId,
      completed: false,
      timeOfDay: 'afternoon',
      dueDate: '2026-03-12', // yesterday
    })

    const html = await render()

    // The task is still visible so it can be done...
    expect(html).toContain('Duschen')
    // ...but the overdue feature is gone entirely.
    expect(html).not.toContain('data-overdue="true"')
    expect(html).not.toContain('data-testid="overdue-badge"')
    expect(html).not.toContain('Überfällig')
  })
})
