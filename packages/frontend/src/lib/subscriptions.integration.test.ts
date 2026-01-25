import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import PocketBase from 'pocketbase'
import { createTestUser, createTestGroup, createTestChild, type TestContext } from '../../tests/helpers'

/**
 * PocketBase Subscriptions Integration Tests
 *
 * IMPORTANT: Tests run as regular users, not superusers, to catch permission issues.
 */
describe('PocketBase Subscriptions', () => {
  let ctx: TestContext
  let groupId: string
  let childId: string

  beforeEach(async () => {
    ctx = await createTestUser()
    groupId = await createTestGroup(ctx.adminPb, ctx.userId)
    childId = await createTestChild(ctx.adminPb, groupId)
  })

  afterEach(async () => {
    // Clean up subscriptions
    try {
      await ctx.userPb.collection('tasks').unsubscribe('*')
    } catch {
      // ignore
    }
  })

  it('should receive create event when task is added', async () => {
    const events: unknown[] = []

    await ctx.userPb.collection('tasks').subscribe('*', (e) => {
      events.push(e)
    })

    await ctx.userPb.collection('tasks').create({
      title: 'New Task',
      child: childId,
      completed: false,
    })

    // Wait for subscription event
    await new Promise((r) => setTimeout(r, 100))

    await ctx.userPb.collection('tasks').unsubscribe('*')

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      action: 'create',
      record: expect.objectContaining({ title: 'New Task' }),
    })
  })

  it('should receive update event when task is modified', async () => {
    const task = await ctx.userPb.collection('tasks').create({
      title: 'Original',
      child: childId,
      completed: false,
    })

    const events: unknown[] = []

    await ctx.userPb.collection('tasks').subscribe('*', (e) => {
      events.push(e)
    })

    await ctx.userPb.collection('tasks').update(task.id, { title: 'Updated' })

    await new Promise((r) => setTimeout(r, 100))

    await ctx.userPb.collection('tasks').unsubscribe('*')

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      action: 'update',
      record: expect.objectContaining({ title: 'Updated' }),
    })
  })

  it('should filter subscription to specific child tasks', async () => {
    const events: unknown[] = []

    await ctx.userPb.collection('tasks').subscribe('*', (e) => {
      if (e.record.child === childId) {
        events.push(e)
      }
    })

    // Create task for our child
    await ctx.userPb.collection('tasks').create({
      title: 'Task for Max',
      child: childId,
      completed: false,
    })

    await new Promise((r) => setTimeout(r, 100))

    await ctx.userPb.collection('tasks').unsubscribe('*')

    expect(events).toHaveLength(1)
  })
})
