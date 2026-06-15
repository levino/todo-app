import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest'
import TasksPage from '../../../src/pages/group/[groupId]/tasks/index.astro'
import { authUser, createPb, type PbShim } from '../../helpers'

// Issue #79: "Tagesaufgaben" — daily-only tasks that expire silently instead of
// becoming overdue and carrying forward.
describe('Daily-only (Tagesaufgaben) tasks', () => {
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
      email: `daily-only-${Date.now()}@test.local`,
      password: 'testtest123',
      passwordConfirm: 'testtest123',
      name: 'Test User',
    })
    await pb.collection('users').authWithPassword(user.email, 'testtest123')

    const group = await adminPb.collection('groups').create({
      name: 'Daily Only Family',
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

  const render = () =>
    container.renderToString(TasksPage, {
      params: { groupId },
      locals: { db: pb.db, user: authUser(pb) },
    })

  it('shows a daily-only task that is due today, without an overdue marker', async () => {
    await adminPb.collection('tasks').create({
      title: 'Fenster putzen',
      child: childId,
      completed: false,
      timeOfDay: 'afternoon',
      dueDate: '2026-03-13',
      dailyOnly: true,
    })

    const html = await render()

    expect(html).toContain('Fenster putzen')
    expect(html).not.toContain('data-overdue="true"')
  })

  it('does NOT show a daily-only task once its due date has passed (expires silently)', async () => {
    await adminPb.collection('tasks').create({
      title: 'Unkraut jaeten',
      child: childId,
      completed: false,
      timeOfDay: 'afternoon',
      dueDate: '2026-03-12', // yesterday
      dailyOnly: true,
    })

    const html = await render()

    expect(html).not.toContain('Unkraut jaeten')
  })

  it('still carries forward a normal (non daily-only) past-due task, without marking it overdue', async () => {
    await adminPb.collection('tasks').create({
      title: 'Normale Aufgabe',
      child: childId,
      completed: false,
      timeOfDay: 'afternoon',
      dueDate: '2026-03-12', // yesterday
      dailyOnly: false,
    })

    const html = await render()

    // A normal task still carries forward (stays visible)...
    expect(html).toContain('Normale Aufgabe')
    // ...but the overdue feature was removed, so it is never flagged.
    expect(html).not.toContain('data-overdue="true"')
    expect(html).not.toContain('Überfällig')
  })
})
