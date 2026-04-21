import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import PocketBase from 'pocketbase'
import TasksPage from '../../../src/pages/group/[groupId]/tasks/index.astro'
import { resetPocketBase } from '@/lib/pocketbase'

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

describe('Phase Switcher', () => {
  let adminPb: PocketBase
  let userPb: PocketBase
  let container: AstroContainer
  let groupId: string
  let childId: string

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
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

    await adminPb.collection('tasks').create({
      title: 'Morgenaufgabe',
      child: childId,
      priority: 1,
      completed: false,
      timeOfDay: 'morning',
    })
    await adminPb.collection('tasks').create({
      title: 'Nachmittagsaufgabe',
      child: childId,
      priority: 1,
      completed: false,
      timeOfDay: 'afternoon',
    })
    await adminPb.collection('tasks').create({
      title: 'Abendaufgabe',
      child: childId,
      priority: 1,
      completed: false,
      timeOfDay: 'evening',
    })

    container = await AstroContainer.create()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const renderPage = (query = '') =>
    container.renderToString(TasksPage, {
      params: { groupId },
      locals: { pb: userPb, user: userPb.authStore.record },
      request: new Request(`http://localhost/group/${groupId}/tasks?child=${childId}${query ? `&${query}` : ''}`),
    })

  it('renders three phase buttons on the tasks page', async () => {
    vi.setSystemTime(new Date('2026-03-10T13:00:00Z')) // 14:00 Berlin → afternoon
    const html = await renderPage()
    expect(html).toContain('data-testid="phase-button-morning"')
    expect(html).toContain('data-testid="phase-button-afternoon"')
    expect(html).toContain('data-testid="phase-button-evening"')
  })

  it('phase buttons opt into Astro prefetch so the target page is ready on click', async () => {
    vi.setSystemTime(new Date('2026-03-10T13:00:00Z'))
    const html = await renderPage()
    for (const phase of ['morning', 'afternoon', 'evening'] as const) {
      expect(html).toMatch(
        new RegExp(`data-testid="phase-button-${phase}"[^>]*data-astro-prefetch`),
      )
    }
  })

  it('marks the calculated phase as active when no query param is set', async () => {
    vi.setSystemTime(new Date('2026-03-10T13:00:00Z')) // 14:00 Berlin → afternoon
    const html = await renderPage()
    expect(html).toMatch(/data-testid="phase-button-afternoon"[^>]*data-active="true"/)
    expect(html).not.toMatch(/data-testid="phase-button-morning"[^>]*data-active="true"/)
    expect(html).not.toMatch(/data-testid="phase-button-evening"[^>]*data-active="true"/)
  })

  it('overrides the phase with ?phase=morning even when real time is afternoon', async () => {
    vi.setSystemTime(new Date('2026-03-10T13:00:00Z')) // 14:00 Berlin → afternoon
    const html = await renderPage('phase=morning')
    expect(html).toContain('Morgenaufgabe')
    expect(html).not.toContain('Nachmittagsaufgabe')
    expect(html).not.toContain('Abendaufgabe')
    expect(html).toMatch(/data-testid="phase-button-morning"[^>]*data-active="true"/)
  })

  it('overrides the phase with ?phase=evening even when real time is morning', async () => {
    vi.setSystemTime(new Date('2026-03-10T06:00:00Z')) // 07:00 Berlin → morning
    const html = await renderPage('phase=evening')
    expect(html).toContain('Abendaufgabe')
    expect(html).not.toContain('Morgenaufgabe')
    expect(html).not.toContain('Nachmittagsaufgabe')
    expect(html).toMatch(/data-testid="phase-button-evening"[^>]*data-active="true"/)
  })

  it('overrides the phase with ?phase=afternoon even when real time is evening', async () => {
    vi.setSystemTime(new Date('2026-03-10T19:00:00Z')) // 20:00 Berlin → evening
    const html = await renderPage('phase=afternoon')
    expect(html).toContain('Nachmittagsaufgabe')
    expect(html).not.toContain('Morgenaufgabe')
    expect(html).not.toContain('Abendaufgabe')
    expect(html).toMatch(/data-testid="phase-button-afternoon"[^>]*data-active="true"/)
  })

  it('ignores an invalid phase query and falls back to the calculated phase', async () => {
    vi.setSystemTime(new Date('2026-03-10T13:00:00Z')) // 14:00 Berlin → afternoon
    const html = await renderPage('phase=bogus')
    expect(html).toContain('Nachmittagsaufgabe')
    expect(html).not.toContain('Morgenaufgabe')
    expect(html).not.toContain('Abendaufgabe')
    expect(html).toMatch(/data-testid="phase-button-afternoon"[^>]*data-active="true"/)
  })

  it('phase button links preserve the child query param', async () => {
    vi.setSystemTime(new Date('2026-03-10T13:00:00Z'))
    const html = await renderPage()
    for (const phase of ['morning', 'afternoon', 'evening'] as const) {
      const match = new RegExp(
        `data-testid="phase-button-${phase}"[^>]*href="[^"]*child=${childId}[^"]*phase=${phase}"`,
      )
      const reverseMatch = new RegExp(
        `href="[^"]*child=${childId}[^"]*phase=${phase}"[^>]*data-testid="phase-button-${phase}"`,
      )
      expect(html).toMatch(new RegExp(`${match.source}|${reverseMatch.source}`))
    }
  })

  it('phase switcher is rendered on the group overview (no child selected)', async () => {
    vi.setSystemTime(new Date('2026-03-10T13:00:00Z'))
    const html = await container.renderToString(TasksPage, {
      params: { groupId },
      locals: { pb: userPb, user: userPb.authStore.record },
      request: new Request(`http://localhost/group/${groupId}/tasks`),
    })
    expect(html).toContain('data-testid="phase-button-morning"')
    expect(html).toContain('data-testid="phase-button-afternoon"')
    expect(html).toContain('data-testid="phase-button-evening"')
    expect(html).toContain(`/group/${groupId}/tasks?phase=morning`)
  })
})
