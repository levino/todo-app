import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import PocketBase from 'pocketbase'
import TasksPage from '../../../src/pages/group/[groupId]/tasks/index.astro'
import { resetPocketBase } from '@/lib/pocketbase'
import { authUser } from '../../helpers'

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

describe('Phase Preservation on Task Actions', () => {
  let adminPb: PocketBase
  let userPb: PocketBase
  let container: AstroContainer
  let groupId: string
  let childId: string
  let afternoonTaskId: string

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // It is morning in Berlin - but the user has switched to ?phase=afternoon
    vi.setSystemTime(new Date('2026-03-10T06:00:00Z')) // 07:00 Berlin → morning
    resetPocketBase()

    adminPb = new PocketBase(POCKETBASE_URL)
    await adminPb.collection('_superusers').authWithPassword('admin@test.local', 'testtest123')

    const email = `test-${Date.now()}@example.com`
    const user = await adminPb.collection('users').create({
      email,
      password: 'testtest123',
      passwordConfirm: 'testtest123',
    })

    userPb = new PocketBase(POCKETBASE_URL)
    await userPb.collection('users').authWithPassword(email, 'testtest123')

    const group = await adminPb.collection('groups').create({
      name: 'Test Family',
      morningEnd: '09:00',
      eveningStart: '18:00',
      timezone: 'Europe/Berlin',
    })
    groupId = group.id

    await adminPb.collection('user_groups').create({
      user: user.id,
      group: groupId,
    })

    const child = await adminPb.collection('children').create({
      name: 'Kind',
      color: '#FF6B6B',
      group: groupId,
    })
    childId = child.id

    const afternoonTask = await adminPb.collection('tasks').create({
      title: 'Nachmittagsaufgabe',
      child: childId,
      priority: 1,
      completed: false,
      timeOfDay: 'afternoon',
    })
    afternoonTaskId = afternoonTask.id

    container = await AstroContainer.create()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const renderPage = (query: string) =>
    container.renderToString(TasksPage, {
      params: { groupId },
      locals: { pb: userPb, user: authUser(userPb) },
      request: new Request(`http://localhost/group/${groupId}/tasks?child=${childId}&${query}`),
    })

  it('complete form action URL preserves phase=afternoon so redirect keeps the phase', async () => {
    const html = await renderPage('phase=afternoon')

    // Astro actions redirect back to the form's POST URL (minus _astroAction).
    // So the form's action attribute must carry phase=afternoon for it to survive the redirect.
    // Look for forms with action containing "completeTask" and query parameters
    const completeForms = html.match(/<form[^>]*action="[^"]*completeTask[^"]*"[^>]*>/g) ?? []
    expect(completeForms.length).toBeGreaterThan(0)
    for (const form of completeForms) {
      expect(form).toContain('phase=afternoon')
    }
  })

  it('delete form action URL preserves phase=afternoon so redirect keeps the phase', async () => {
    const html = await renderPage('phase=afternoon')

    const deleteForms = html.match(/<form[^>]*action="[^"]*deleteTask[^"]*"[^>]*>/g) ?? []
    expect(deleteForms.length).toBeGreaterThan(0)
    for (const form of deleteForms) {
      expect(form).toContain('phase=afternoon')
    }
  })

  it('undo form action URL preserves phase=afternoon so redirect keeps the phase', async () => {
    // Complete a task so the undo form renders in the "recently completed" section.
    await adminPb.collection('tasks').update(afternoonTaskId, {
      completed: true,
      completedAt: new Date('2026-03-10T06:05:00Z').toISOString(),
      completedBy: childId,
    })

    const html = await renderPage('phase=afternoon')

    const undoForms = html.match(/<form[^>]*action="[^"]*undoTask[^"]*"[^>]*>/g) ?? []
    expect(undoForms.length).toBeGreaterThan(0)
    for (const form of undoForms) {
      expect(form).toContain('phase=afternoon')
    }
  })

  it('child-switcher links preserve the phase query param', async () => {
    // Create a second child so the switcher renders.
    const sibling = await adminPb.collection('children').create({
      name: 'Geschwister',
      color: '#4ECDC4',
      group: groupId,
    })

    const html = await renderPage('phase=afternoon')

    const childTabRegex = new RegExp(
      `<a[^>]*href="[^"]*/group/${groupId}/tasks\\?[^"]*child=${sibling.id}[^"]*"[^>]*data-testid="child-tab"`,
    )
    const match = html.match(childTabRegex)
    expect(match).not.toBeNull()
    expect(match![0]).toContain('phase=afternoon')
  })

  it('future-tasks toggle link preserves the phase query param', async () => {
    const html = await renderPage('phase=afternoon')

    const toggleMatch = html.match(/<a[^>]*data-testid="future-tasks-toggle"[^>]*>/)
    expect(toggleMatch).not.toBeNull()
    expect(toggleMatch![0]).toContain('phase=afternoon')
  })
})
