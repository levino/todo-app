import { describe, it, expect, beforeEach } from 'vitest'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import TasksChildPage from '../pages/group/[groupId]/tasks/[childId].astro'
import { createTestUser, createTestGroup, createTestChild, type TestContext } from '../../tests/helpers'

/**
 * Task Completion Animation Integration Tests
 *
 * Tests that the task list has proper animation setup:
 * - CSS transitions are defined for slide-out effect
 * - JavaScript handles form submission with animation
 * - Graceful degradation for no-JS
 */
describe('Task Completion Animation', () => {
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

  it('should have CSS classes for animation on task items', async () => {
    await ctx.adminPb.collection('tasks').create({
      title: 'Animated task',
      child: childId,
      completed: false,
    })

    const html = await container.renderToString(TasksChildPage, {
      params: { groupId, childId },
      locals: { pb: ctx.userPb, user: ctx.userPb.authStore.record },
    })

    // Task item should have transition classes
    expect(html).toContain('transition-')
    expect(html).toContain('data-testid="task-item"')
  })

  it('should include animation styles in the page', async () => {
    await ctx.adminPb.collection('tasks').create({
      title: 'Styled task',
      child: childId,
      completed: false,
    })

    const html = await container.renderToString(TasksChildPage, {
      params: { groupId, childId },
      locals: { pb: ctx.userPb, user: ctx.userPb.authStore.record },
    })

    // Should have CSS for slide animation (either inline or class-based)
    // Looking for transform/translate properties that enable sliding
    expect(html).toMatch(/translate|transform/)
  })

  it('should have JavaScript for handling animation on complete', async () => {
    await ctx.adminPb.collection('tasks').create({
      title: 'JS animated task',
      child: childId,
      completed: false,
    })

    const html = await container.renderToString(TasksChildPage, {
      params: { groupId, childId },
      locals: { pb: ctx.userPb, user: ctx.userPb.authStore.record },
    })

    // Should have script for handling form submission with animation
    expect(html).toContain('<script')
    // The script should reference completing/animating tasks
    expect(html).toMatch(/complete|submit|animate/i)
  })

  it('should maintain form fallback for no-JS (graceful degradation)', async () => {
    await ctx.adminPb.collection('tasks').create({
      title: 'Fallback task',
      child: childId,
      completed: false,
    })

    const html = await container.renderToString(TasksChildPage, {
      params: { groupId, childId },
      locals: { pb: ctx.userPb, user: ctx.userPb.authStore.record },
    })

    // Form should still exist for no-JS fallback
    expect(html).toContain('method="POST"')
    expect(html).toContain('action=')
    expect(html).toContain('/complete')
  })
})
