import PocketBase from 'pocketbase'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'

const POCKETBASE_URL =
  process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

describe('Kiosk Mode - Task List', () => {
  let pb: PocketBase
  let groupId: string
  let childId: string
  let taskIds: string[] = []

  beforeAll(async () => {
    pb = new PocketBase(POCKETBASE_URL)
    await pb
      .collection('_superusers')
      .authWithPassword('admin@test.local', 'testtest123')

    // Create a test group
    const group = await pb.collection('groups').create({
      name: 'Test Family',
    })
    groupId = group.id

    // Create a test child
    const child = await pb.collection('children').create({
      name: 'Max',
      group: groupId,
      avatar: '👦',
    })
    childId = child.id

    // Create test tasks for the child
    const task1 = await pb.collection('kiosk_tasks').create({
      title: 'Zähne putzen',
      child: childId,
      priority: 1,
      completed: false,
    })
    const task2 = await pb.collection('kiosk_tasks').create({
      title: 'Zimmer aufräumen',
      child: childId,
      priority: 2,
      completed: false,
    })
    taskIds = [task1.id, task2.id]
  })

  afterAll(async () => {
    // Clean up test data
    for (const taskId of taskIds) {
      try {
        await pb.collection('kiosk_tasks').delete(taskId)
      } catch {
        // Ignore if already deleted
      }
    }
    try {
      await pb.collection('children').delete(childId)
    } catch {
      // Ignore
    }
    try {
      await pb.collection('groups').delete(groupId)
    } catch {
      // Ignore
    }
  })

  it('should fetch all siblings (children in the same group)', async () => {
    // Create a second child in the same group
    const sibling = await pb.collection('children').create({
      name: 'Lisa',
      group: groupId,
      avatar: '👧',
    })

    try {
      const result = await pb.collection('children').getList(1, 100, {
        filter: `group = "${groupId}"`,
        sort: 'name',
      })

      expect(result.items.length).toBe(2)
      expect(result.items[0].name).toBe('Lisa')
      expect(result.items[1].name).toBe('Max')
    } finally {
      await pb.collection('children').delete(sibling.id)
    }
  })

  it('should fetch tasks for a specific child', async () => {
    const result = await pb.collection('kiosk_tasks').getList(1, 100, {
      filter: `child = "${childId}" && completed = false`,
      sort: 'priority',
    })

    expect(result.items.length).toBe(2)
    expect(result.items[0].title).toBe('Zähne putzen')
    expect(result.items[1].title).toBe('Zimmer aufräumen')
  })

  it('should only return incomplete tasks', async () => {
    // Mark one task as completed
    await pb.collection('kiosk_tasks').update(taskIds[0], {
      completed: true,
      completedAt: new Date().toISOString(),
    })

    const result = await pb.collection('kiosk_tasks').getList(1, 100, {
      filter: `child = "${childId}" && completed = false`,
    })

    expect(result.items.length).toBe(1)
    expect(result.items[0].title).toBe('Zimmer aufräumen')

    // Restore the task for other tests
    await pb.collection('kiosk_tasks').update(taskIds[0], {
      completed: false,
      completedAt: null,
    })
  })

  it('should fetch children for a group', async () => {
    const result = await pb.collection('children').getList(1, 100, {
      filter: `group = "${groupId}"`,
    })

    expect(result.items.length).toBe(1)
    expect(result.items[0].name).toBe('Max')
    expect(result.items[0].avatar).toBe('👦')
  })
})
