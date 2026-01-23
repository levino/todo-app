import { describe, it, expect, beforeEach } from 'vitest'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import TasksChildPage from '../pages/group/[groupId]/tasks/[childId].astro'
import { createTestUser, createTestGroup, createTestChild, type TestContext } from '../../tests/helpers'

/**
 * Task Visible From Filter Integration Tests
 *
 * Tests that the task list only shows tasks where visibleFrom <= now
 */
describe('Task List Visible From Filter', () => {
  let ctx: TestContext
  let groupId: string
  let childId: string
  let container: AstroContainer

  beforeEach(async () => {
    ctx = await createTestUser()
    groupId = await createTestGroup(ctx.adminPb, ctx.userId)
    childId = await createTestChild(ctx.adminPb, groupId)
    container = await AstroContainer.create()
  })


  it('should show task when visibleFrom is in the past', async () => {
    // Create a task with visibleFrom in the past
    await ctx.adminPb.collection('tasks').create({
      title: 'Past visible task',
      child: childId,
      completed: false,
      visibleFrom: new Date('2026-01-20T08:00:00').toISOString(), // In the past
    })

    // Render the page at a specific time (after visibleFrom)
    const now = new Date('2026-01-23T12:00:00')

    const html = await container.renderToString(TasksChildPage, {
      params: { groupId, childId },
      locals: { pb: ctx.userPb, user: ctx.userPb.authStore.record, now },
    })

    expect(html).toContain('Past visible task')
    expect(html).toContain('data-testid="task-item"')
  })

  it('should NOT show task when visibleFrom is in the future', async () => {
    // Create a task with visibleFrom in the future
    await ctx.adminPb.collection('tasks').create({
      title: 'Future invisible task',
      child: childId,
      completed: false,
      visibleFrom: new Date('2026-01-25T18:00:00').toISOString(), // In the future
    })

    // Render the page at a specific time (before visibleFrom)
    const now = new Date('2026-01-23T12:00:00')

    const html = await container.renderToString(TasksChildPage, {
      params: { groupId, childId },
      locals: { pb: ctx.userPb, user: ctx.userPb.authStore.record, now },
    })

    expect(html).not.toContain('Future invisible task')
    // Should show "Alle Aufgaben erledigt!" since no visible tasks
    expect(html).toContain('Alle Aufgaben erledigt!')
  })

  it('should show task when visibleFrom is exactly now', async () => {
    const now = new Date('2026-01-23T12:00:00')

    await ctx.adminPb.collection('tasks').create({
      title: 'Exactly now task',
      child: childId,
      completed: false,
      visibleFrom: now.toISOString(),
    })

    const html = await container.renderToString(TasksChildPage, {
      params: { groupId, childId },
      locals: { pb: ctx.userPb, user: ctx.userPb.authStore.record, now },
    })

    expect(html).toContain('Exactly now task')
  })

  it('should show task when visibleFrom is null (legacy tasks)', async () => {
    const now = new Date('2026-01-23T12:00:00')

    await ctx.adminPb.collection('tasks').create({
      title: 'No visibleFrom task',
      child: childId,
      completed: false,
      // No visibleFrom set
    })

    const html = await container.renderToString(TasksChildPage, {
      params: { groupId, childId },
      locals: { pb: ctx.userPb, user: ctx.userPb.authStore.record, now },
    })

    expect(html).toContain('No visibleFrom task')
  })

  it('should show mix of visible tasks and hide future ones', async () => {
    const now = new Date('2026-01-23T12:00:00')

    // Create a visible task
    await ctx.adminPb.collection('tasks').create({
      title: 'Visible morning task',
      child: childId,
      completed: false,
      visibleFrom: new Date('2026-01-23T06:00:00').toISOString(),
    })

    // Create a future task (evening)
    await ctx.adminPb.collection('tasks').create({
      title: 'Future evening task',
      child: childId,
      completed: false,
      visibleFrom: new Date('2026-01-23T18:00:00').toISOString(),
    })

    const html = await container.renderToString(TasksChildPage, {
      params: { groupId, childId },
      locals: { pb: ctx.userPb, user: ctx.userPb.authStore.record, now },
    })

    expect(html).toContain('Visible morning task')
    expect(html).not.toContain('Future evening task')
  })
})
