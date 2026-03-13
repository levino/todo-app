import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach } from 'vitest'
import PocketBase from 'pocketbase'
import TasksPage from '../../../src/pages/group/[groupId]/tasks/index.astro'
import { resetPocketBase } from '@/lib/pocketbase'

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

describe('Future Tasks Preview', () => {
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

    const group = await adminPb.collection('groups').create({ name: 'Test Family' })
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

  const renderChildPage = (queryParams: string = '') =>
    container.renderToString(TasksPage, {
      params: { groupId },
      locals: { pb: userPb, user: userPb.authStore.record },
      request: new Request(`http://localhost/group/${groupId}/tasks?child=${childId}${queryParams}`),
    })

  const renderOverviewPage = () =>
    container.renderToString(TasksPage, {
      params: { groupId },
      locals: { pb: userPb, user: userPb.authStore.record },
    })

  it('should not show future tasks section by default', async () => {
    const nextWeek = new Date()
    nextWeek.setDate(nextWeek.getDate() + 7)

    await adminPb.collection('tasks').create({
      title: 'Future Task',
      child: childId,
      priority: 1,
      completed: false,
      dueDate: nextWeek.toISOString(),
      timeOfDay: 'afternoon',
    })

    const html = await renderChildPage()

    expect(html).not.toContain('data-testid="future-tasks-section"')
    expect(html).not.toContain('Future Task')
  })

  it('should show future tasks when showFuture=true', async () => {
    const nextWeek = new Date()
    nextWeek.setDate(nextWeek.getDate() + 7)

    await adminPb.collection('tasks').create({
      title: 'Future Task',
      child: childId,
      priority: 1,
      completed: false,
      dueDate: nextWeek.toISOString(),
      timeOfDay: 'afternoon',
    })

    const html = await renderChildPage('&showFuture=true')

    expect(html).toContain('data-testid="future-tasks-section"')
    expect(html).toContain('Future Task')
  })

  it('should not show complete buttons for future tasks', async () => {
    const nextWeek = new Date()
    nextWeek.setDate(nextWeek.getDate() + 7)

    await adminPb.collection('tasks').create({
      title: 'Future Task No Button',
      child: childId,
      priority: 1,
      completed: false,
      dueDate: nextWeek.toISOString(),
      timeOfDay: 'afternoon',
    })

    const html = await renderChildPage('&showFuture=true')

    const futureSection = html.split('data-testid="future-tasks-section"')[1]
    expect(futureSection).toBeDefined()
    expect(futureSection).not.toContain('data-testid="complete-button"')
    expect(futureSection).toContain('Future Task No Button')
  })

  it('should show due dates for future tasks', async () => {
    const nextWeek = new Date()
    nextWeek.setDate(nextWeek.getDate() + 7)
    const dueDateStr = nextWeek.toISOString().slice(0, 10)

    await adminPb.collection('tasks').create({
      title: 'Dated Future Task',
      child: childId,
      priority: 1,
      completed: false,
      dueDate: nextWeek.toISOString(),
      timeOfDay: 'afternoon',
    })

    const html = await renderChildPage('&showFuture=true')

    expect(html).toContain('data-testid="future-task-date"')
    expect(html).toContain(dueDateStr)
  })

  it('should sort future tasks by dueDate ascending', async () => {
    const nextWeek = new Date()
    nextWeek.setDate(nextWeek.getDate() + 7)
    const nextMonth = new Date()
    nextMonth.setDate(nextMonth.getDate() + 30)

    await adminPb.collection('tasks').create({
      title: 'Later Task',
      child: childId,
      priority: 1,
      completed: false,
      dueDate: nextMonth.toISOString(),
      timeOfDay: 'afternoon',
    })
    await adminPb.collection('tasks').create({
      title: 'Sooner Task',
      child: childId,
      priority: 1,
      completed: false,
      dueDate: nextWeek.toISOString(),
      timeOfDay: 'afternoon',
    })

    const html = await renderChildPage('&showFuture=true')

    const soonerIndex = html.indexOf('Sooner Task')
    const laterIndex = html.indexOf('Later Task')
    expect(soonerIndex).toBeLessThan(laterIndex)
  })

  it('should show toggle link to enable future tasks', async () => {
    const html = await renderChildPage()

    expect(html).toContain('data-testid="future-tasks-toggle"')
    expect(html).toContain('showFuture=true')
  })

  it('should show toggle link to hide future tasks when active', async () => {
    const html = await renderChildPage('&showFuture=true')

    expect(html).toContain('data-testid="future-tasks-toggle"')
    expect(html).not.toContain('showFuture=true')
  })

  it('should not show future tasks toggle on overview page', async () => {
    const html = await renderOverviewPage()

    expect(html).not.toContain('data-testid="future-tasks-toggle"')
  })

  it('should show future tasks from all phases, not just current', async () => {
    const nextWeek = new Date()
    nextWeek.setDate(nextWeek.getDate() + 7)

    await adminPb.collection('tasks').create({
      title: 'Future Morning Task',
      child: childId,
      priority: 1,
      completed: false,
      dueDate: nextWeek.toISOString(),
      timeOfDay: 'morning',
    })
    await adminPb.collection('tasks').create({
      title: 'Future Evening Task',
      child: childId,
      priority: 1,
      completed: false,
      dueDate: nextWeek.toISOString(),
      timeOfDay: 'evening',
    })

    const html = await renderChildPage('&showFuture=true')

    expect(html).toContain('Future Morning Task')
    expect(html).toContain('Future Evening Task')
  })
})
