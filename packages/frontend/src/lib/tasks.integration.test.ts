import PocketBase from 'pocketbase'
import { describe, expect, it, beforeEach } from 'vitest'
import { createTestUser, createTestGroup, createTestChild, type TestContext } from '../../tests/helpers'

/**
 * Task List Integration Tests
 *
 * IMPORTANT: Tests run as regular users, not superusers, to catch permission issues.
 */
describe('Task List', () => {
  let ctx: TestContext
  let groupId: string
  let childId: string
  let taskIds: string[] = []

  beforeEach(async () => {
    ctx = await createTestUser()
    groupId = await createTestGroup(ctx.adminPb, ctx.userId)
    childId = await createTestChild(ctx.adminPb, groupId)

    // Create test tasks using userPb to verify permissions
    const task1 = await ctx.userPb.collection('tasks').create({
      title: 'Zähne putzen',
      child: childId,
      priority: 1,
      completed: false,
    })
    const task2 = await ctx.userPb.collection('tasks').create({
      title: 'Zimmer aufräumen',
      child: childId,
      priority: 2,
      completed: false,
    })
    taskIds = [task1.id, task2.id]
  })

  it('should fetch all siblings (children in the same group)', async () => {
    // Create a second child using admin (setup)
    await ctx.adminPb.collection('children').create({
      name: 'Lisa',
      group: groupId,
      color: '#F783AC',
    })

    // Fetch using user
    const result = await ctx.userPb.collection('children').getList(1, 100, {
      filter: `group = "${groupId}"`,
      sort: 'name',
    })

    expect(result.items.length).toBe(2)
    expect(result.items[0].name).toBe('Lisa')
    expect(result.items[1].name).toBe('Max')
  })

  it('should fetch tasks for a specific child', async () => {
    const result = await ctx.userPb.collection('tasks').getList(1, 100, {
      filter: `child = "${childId}" && completed = false`,
      sort: 'priority',
    })

    expect(result.items.length).toBe(2)
    expect(result.items[0].title).toBe('Zähne putzen')
    expect(result.items[1].title).toBe('Zimmer aufräumen')
  })

  it('should only return incomplete tasks', async () => {
    // Mark one task as completed
    await ctx.userPb.collection('tasks').update(taskIds[0], {
      completed: true,
      completedAt: new Date().toISOString(),
    })

    const result = await ctx.userPb.collection('tasks').getList(1, 100, {
      filter: `child = "${childId}" && completed = false`,
    })

    expect(result.items.length).toBe(1)
    expect(result.items[0].title).toBe('Zimmer aufräumen')
  })

  it('should fetch children for a group', async () => {
    const result = await ctx.userPb.collection('children').getList(1, 100, {
      filter: `group = "${groupId}"`,
    })

    expect(result.items.length).toBe(1)
    expect(result.items[0].name).toBe('Max')
    expect(result.items[0].color).toBe('#4DABF7')
  })

  it('should mark a task as completed with timestamp', async () => {
    const taskId = taskIds[0]
    const beforeComplete = new Date()

    await ctx.userPb.collection('tasks').update(taskId, {
      completed: true,
      completedAt: new Date().toISOString(),
    })

    const task = await ctx.userPb.collection('tasks').getOne(taskId)
    expect(task.completed).toBe(true)
    expect(task.completedAt).toBeDefined()
    expect(new Date(task.completedAt).getTime()).toBeGreaterThanOrEqual(beforeComplete.getTime())
  })
})
