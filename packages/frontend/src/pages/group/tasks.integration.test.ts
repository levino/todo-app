import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach } from 'vitest'
import TasksIndexPage from './[groupId]/tasks/index.astro'
import TasksChildPage from './[groupId]/tasks/[childId].astro'
import { adminPb, createRandomUser } from '../../../tests/pocketbase'

describe('Tasks Index Page', () => {
  let userPb: Awaited<ReturnType<typeof createRandomUser>>
  let container: AstroContainer
  let groupId: string
  let userId: string

  beforeEach(async () => {
    userPb = await createRandomUser()
    userId = userPb.authStore.record!.id

    const group = await adminPb.collection('groups').create({ name: 'Test Family' })
    groupId = group.id

    await adminPb.collection('user_groups').create({
      user: userId,
      group: groupId,
    })

    container = await AstroContainer.create()
  })

  it('should show message when no children exist', async () => {
    const html = await container.renderToString(TasksIndexPage, {
      params: { groupId },
      locals: { pb: userPb, user: userPb.authStore.record },
    })

    expect(html).toContain('Noch keine Kinder angelegt')
    expect(html).toContain('MCP Verbindung')
  })

  it('should display children with colored initials', async () => {
    await adminPb.collection('children').create({
      name: 'Max',
      color: '#FF6B6B',
      group: groupId,
    })

    const html = await container.renderToString(TasksIndexPage, {
      params: { groupId },
      locals: { pb: userPb, user: userPb.authStore.record },
    })

    expect(html).toContain('Max')
    expect(html).toContain('#FF6B6B')
    expect(html).toContain('M')
  })

  it('should have links to child task pages', async () => {
    const child = await adminPb.collection('children').create({
      name: 'Max',
      color: '#FF6B6B',
      group: groupId,
    })

    const html = await container.renderToString(TasksIndexPage, {
      params: { groupId },
      locals: { pb: userPb, user: userPb.authStore.record },
    })

    expect(html).toContain(`href="/group/${groupId}/tasks/${child.id}"`)
  })

  it('should display multiple children', async () => {
    await adminPb.collection('children').create({
      name: 'Max',
      color: '#FF6B6B',
      group: groupId,
    })
    await adminPb.collection('children').create({
      name: 'Lisa',
      color: '#4DABF7',
      group: groupId,
    })

    const html = await container.renderToString(TasksIndexPage, {
      params: { groupId },
      locals: { pb: userPb, user: userPb.authStore.record },
    })

    expect(html).toContain('Max')
    expect(html).toContain('Lisa')
  })
})

describe('Tasks Child Page', () => {
  let userPb: Awaited<ReturnType<typeof createRandomUser>>
  let container: AstroContainer
  let groupId: string
  let childId: string
  let userId: string

  beforeEach(async () => {
    userPb = await createRandomUser()
    userId = userPb.authStore.record!.id

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

  it('should render child with colored initials', async () => {
    await adminPb.collection('tasks').create({
      title: 'Test Task',
      child: childId,
      priority: 1,
      completed: false,
    })

    const html = await container.renderToString(TasksChildPage, {
      params: { groupId, childId },
      locals: { pb: userPb, user: userPb.authStore.record },
    })

    expect(html).toContain('Max')
    expect(html).toContain('#FF6B6B')
    expect(html).toContain('M')
  })

  it('should display tasks for the child', async () => {
    await adminPb.collection('tasks').create({
      title: 'Zähne putzen',
      child: childId,
      priority: 1,
      completed: false,
    })
    await adminPb.collection('tasks').create({
      title: 'Zimmer aufräumen',
      child: childId,
      priority: 2,
      completed: false,
    })

    const html = await container.renderToString(TasksChildPage, {
      params: { groupId, childId },
      locals: { pb: userPb, user: userPb.authStore.record },
    })

    expect(html).toContain('Zähne putzen')
    expect(html).toContain('Zimmer aufräumen')
    expect(html).toContain('data-testid="task-item"')
  })

  it('should show celebration when no tasks exist', async () => {
    const html = await container.renderToString(TasksChildPage, {
      params: { groupId, childId },
      locals: { pb: userPb, user: userPb.authStore.record },
    })

    expect(html).toContain('data-testid="celebration"')
    expect(html).toContain('Super gemacht!')
    expect(html).toContain('Alle Aufgaben erledigt!')
  })

  it('should not show completed tasks', async () => {
    await adminPb.collection('tasks').create({
      title: 'Completed Task',
      child: childId,
      priority: 1,
      completed: true,
      completedAt: new Date().toISOString(),
    })
    await adminPb.collection('tasks').create({
      title: 'Pending Task',
      child: childId,
      priority: 2,
      completed: false,
    })

    const html = await container.renderToString(TasksChildPage, {
      params: { groupId, childId },
      locals: { pb: userPb, user: userPb.authStore.record },
    })

    expect(html).not.toContain('Completed Task')
    expect(html).toContain('Pending Task')
  })

  it('should show child switcher when multiple children exist', async () => {
    const child2 = await adminPb.collection('children').create({
      name: 'Lisa',
      color: '#4DABF7',
      group: groupId,
    })

    const html = await container.renderToString(TasksChildPage, {
      params: { groupId, childId },
      locals: { pb: userPb, user: userPb.authStore.record },
    })

    expect(html).toContain('data-testid="child-switcher"')
    expect(html).toContain('Max')
    expect(html).toContain('Lisa')
    expect(html).toContain(`href="/group/${groupId}/tasks/${childId}"`)
    expect(html).toContain(`href="/group/${groupId}/tasks/${child2.id}"`)
  })

  it('should hide child switcher when only one child exists', async () => {
    const html = await container.renderToString(TasksChildPage, {
      params: { groupId, childId },
      locals: { pb: userPb, user: userPb.authStore.record },
    })

    expect(html).not.toContain('data-testid="child-switcher"')
  })

  it('should have completion form pointing to correct API endpoint', async () => {
    const task = await adminPb.collection('tasks').create({
      title: 'Test Task',
      child: childId,
      priority: 1,
      completed: false,
    })

    const html = await container.renderToString(TasksChildPage, {
      params: { groupId, childId },
      locals: { pb: userPb, user: userPb.authStore.record },
    })

    expect(html).toContain(`action="/api/groups/${groupId}/tasks/${task.id}/complete"`)
    expect(html).toContain('method="POST"')
    expect(html).toContain(`value="${childId}"`)
  })

  it('should order tasks by priority', async () => {
    await adminPb.collection('tasks').create({
      title: 'Low Priority',
      child: childId,
      priority: 10,
      completed: false,
    })
    await adminPb.collection('tasks').create({
      title: 'High Priority',
      child: childId,
      priority: 1,
      completed: false,
    })

    const html = await container.renderToString(TasksChildPage, {
      params: { groupId, childId },
      locals: { pb: userPb, user: userPb.authStore.record },
    })

    const highIndex = html.indexOf('High Priority')
    const lowIndex = html.indexOf('Low Priority')
    expect(highIndex).toBeLessThan(lowIndex)
  })
})
