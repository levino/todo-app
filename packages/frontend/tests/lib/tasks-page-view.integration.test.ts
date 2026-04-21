import { describe, expect, it, beforeEach } from 'vitest'
import PocketBase from 'pocketbase'
import { resetPocketBase } from '@/lib/pocketbase'

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

interface TasksPageViewRow {
  id: string
  child_id: string
  child_name: string
  child_color: string
  group_id: string
  child_points_balance: number
  task_id: string
  task_title: string
  task_priority: number | null
  task_time_of_day: string
  task_due_date: string
  task_completed: boolean
  task_completed_at: string
  task_last_completed_at: string
  task_recurrence_type: string
  task_points: number
}

describe('tasks_page_view collection', () => {
  let adminPb: PocketBase
  let groupId: string
  let childId: string

  beforeEach(async () => {
    resetPocketBase()
    adminPb = new PocketBase(POCKETBASE_URL)
    await adminPb.collection('_superusers').authWithPassword('admin@test.local', 'testtest123')

    const group = await adminPb.collection('groups').create({ name: 'Test Group' })
    groupId = group.id

    const child = await adminPb.collection('children').create({
      name: 'Kid',
      color: '#FF6B6B',
      group: groupId,
    })
    childId = child.id
  })

  it('returns one row per task of a child, with child and task fields', async () => {
    await adminPb.collection('tasks').create({
      title: 'Morgenaufgabe',
      child: childId,
      priority: 1,
      completed: false,
      timeOfDay: 'morning',
      points: 5,
    })

    const rows = await adminPb
      .collection<TasksPageViewRow>('tasks_page_view')
      .getFullList({ filter: `child_id = "${childId}"` })

    const taskRow = rows.find((r) => r.task_title === 'Morgenaufgabe')
    expect(taskRow).toBeDefined()
    expect(taskRow!.child_id).toBe(childId)
    expect(taskRow!.child_name).toBe('Kid')
    expect(taskRow!.child_color).toBe('#FF6B6B')
    expect(taskRow!.group_id).toBe(groupId)
    expect(taskRow!.task_time_of_day).toBe('morning')
    expect(taskRow!.task_points).toBe(5)
  })

  it('returns a phantom row for a child with no tasks', async () => {
    const rows = await adminPb
      .collection<TasksPageViewRow>('tasks_page_view')
      .getFullList({ filter: `child_id = "${childId}"` })

    expect(rows).toHaveLength(1)
    expect(rows[0].child_id).toBe(childId)
    expect(rows[0].task_id).toBe('')
    expect(rows[0].task_title).toBe('')
  })

  it('aggregates child_points_balance as sum of point_transactions', async () => {
    await adminPb.collection('point_transactions').create({
      child: childId,
      points: 10,
      type: 'earned',
    })
    await adminPb.collection('point_transactions').create({
      child: childId,
      points: 5,
      type: 'earned',
    })
    await adminPb.collection('point_transactions').create({
      child: childId,
      points: -3,
      type: 'redeemed',
    })

    const rows = await adminPb
      .collection<TasksPageViewRow>('tasks_page_view')
      .getFullList({ filter: `child_id = "${childId}"` })

    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.child_points_balance).toBe(12)
    }
  })

  it('returns zero child_points_balance when child has no transactions', async () => {
    const rows = await adminPb
      .collection<TasksPageViewRow>('tasks_page_view')
      .getFullList({ filter: `child_id = "${childId}"` })

    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.child_points_balance).toBe(0)
    }
  })

  it('filters rows by group_id', async () => {
    const otherGroup = await adminPb.collection('groups').create({ name: 'Other' })
    const otherChild = await adminPb.collection('children').create({
      name: 'Other Kid',
      color: '#4DABF7',
      group: otherGroup.id,
    })
    await adminPb.collection('tasks').create({
      title: 'OtherTask',
      child: otherChild.id,
      priority: 1,
      completed: false,
      timeOfDay: 'afternoon',
    })

    const rows = await adminPb
      .collection<TasksPageViewRow>('tasks_page_view')
      .getFullList({ filter: `group_id = "${groupId}"` })

    for (const row of rows) {
      expect(row.group_id).toBe(groupId)
      expect(row.task_title).not.toBe('OtherTask')
    }
  })

  it('includes completed tasks (not just active ones)', async () => {
    await adminPb.collection('tasks').create({
      title: 'DoneTask',
      child: childId,
      priority: 1,
      completed: true,
      completedAt: '2026-03-10 10:00:00.000Z',
      timeOfDay: 'morning',
    })

    const rows = await adminPb
      .collection<TasksPageViewRow>('tasks_page_view')
      .getFullList({ filter: `child_id = "${childId}" && task_title = "DoneTask"` })

    expect(rows).toHaveLength(1)
    expect(rows[0].task_completed).toBe(true)
  })
})
