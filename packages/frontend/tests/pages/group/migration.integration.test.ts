import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import PocketBase from 'pocketbase'
import TasksPage from '../../../src/pages/group/[groupId]/tasks/index.astro'
import { resetPocketBase } from '@/lib/pocketbase'

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

const makeTimeOfDayOptional = (adminPb: PocketBase) =>
  adminPb.collections.getOne('tasks').then((collection) =>
    adminPb.collections.update(collection.id, {
      fields: collection.fields.map((field: { name: string }) =>
        field.name === 'timeOfDay' ? { ...field, required: false } : field,
      ),
    }),
  )

const makeTimeOfDayRequired = (adminPb: PocketBase) =>
  adminPb.collections.getOne('tasks').then((collection) =>
    adminPb.collections.update(collection.id, {
      fields: collection.fields.map((field: { name: string }) =>
        field.name === 'timeOfDay' ? { ...field, required: true } : field,
      ),
    }),
  )

const runMigrationSql = (adminPb: PocketBase) =>
  adminPb.send('/api/batch', {
    method: 'POST',
    body: {
      requests: [
        {
          method: 'PATCH',
          url: '/api/collections/tasks',
          body: {},
        },
      ],
    },
  }).catch(() => {})

describe('timeOfDay Migration', () => {
  let adminPb: PocketBase
  let userPb: PocketBase
  let container: AstroContainer
  let groupId: string
  let childId: string

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

    userPb = new PocketBase(POCKETBASE_URL)
    await userPb.collection('users').authWithPassword(email, 'testtest123')

    const group = await adminPb.collection('groups').create({ name: 'Migration Family' })
    groupId = group.id

    await adminPb.collection('user_groups').create({
      user: user.id,
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

  afterEach(async () => {
    await makeTimeOfDayRequired(adminPb).catch(() => {})
  })

  it('should migrate pre-existing tasks without timeOfDay to afternoon', async () => {
    await makeTimeOfDayOptional(adminPb)

    const task1 = await adminPb.collection('tasks').create({
      title: 'Alte Aufgabe 1',
      child: childId,
      priority: 1,
      completed: false,
    })
    const task2 = await adminPb.collection('tasks').create({
      title: 'Alte Aufgabe 2',
      child: childId,
      priority: 2,
      completed: false,
    })

    expect(task1.timeOfDay).toBe('')
    expect(task2.timeOfDay).toBe('')

    await adminPb.send('/api/sql', {
      method: 'POST',
      body: { query: "UPDATE tasks SET timeOfDay = 'afternoon' WHERE timeOfDay = '' OR timeOfDay IS NULL" },
    }).catch(async () => {
      const allTasks = await adminPb.collection('tasks').getFullList()
      for (const task of allTasks) {
        if (!task.timeOfDay) {
          await adminPb.collection('tasks').update(task.id, { timeOfDay: 'afternoon' })
        }
      }
    })

    await makeTimeOfDayRequired(adminPb)

    const migratedTask1 = await adminPb.collection('tasks').getOne(task1.id)
    const migratedTask2 = await adminPb.collection('tasks').getOne(task2.id)

    expect(migratedTask1.timeOfDay).toBe('afternoon')
    expect(migratedTask2.timeOfDay).toBe('afternoon')
  })

  it('should display migrated tasks in the frontend', async () => {
    await makeTimeOfDayOptional(adminPb)

    await adminPb.collection('tasks').create({
      title: 'Migrierte Aufgabe',
      child: childId,
      priority: 1,
      completed: false,
    })

    const allTasks = await adminPb.collection('tasks').getFullList()
    for (const task of allTasks) {
      if (!task.timeOfDay) {
        await adminPb.collection('tasks').update(task.id, { timeOfDay: 'afternoon' })
      }
    }

    await makeTimeOfDayRequired(adminPb)

    await adminPb.collection('groups').update(groupId, {
      morningEnd: '00:00',
      eveningStart: '23:59',
    })

    const html = await container.renderToString(TasksPage, {
      params: { groupId },
      locals: { pb: userPb, user: userPb.authStore.record },
      request: new Request(`http://localhost/group/${groupId}/tasks?child=${childId}`),
    })

    expect(html).toContain('Migrierte Aufgabe')
    expect(html).toContain('data-testid="task-item"')
  })

  it('should not lose tasks that already have timeOfDay during migration', async () => {
    await adminPb.collection('tasks').create({
      title: 'Morning Task',
      child: childId,
      priority: 1,
      completed: false,
      timeOfDay: 'morning',
    })

    await makeTimeOfDayOptional(adminPb)

    await adminPb.collection('tasks').create({
      title: 'Old Task',
      child: childId,
      priority: 2,
      completed: false,
    })

    const allTasks = await adminPb.collection('tasks').getFullList()
    for (const task of allTasks) {
      if (!task.timeOfDay) {
        await adminPb.collection('tasks').update(task.id, { timeOfDay: 'afternoon' })
      }
    }

    await makeTimeOfDayRequired(adminPb)

    const morningTask = await adminPb.collection('tasks').getFullList({
      filter: `timeOfDay = "morning"`,
    })
    const afternoonTask = await adminPb.collection('tasks').getFullList({
      filter: `timeOfDay = "afternoon"`,
    })

    expect(morningTask).toHaveLength(1)
    expect(morningTask[0].title).toBe('Morning Task')
    expect(afternoonTask).toHaveLength(1)
    expect(afternoonTask[0].title).toBe('Old Task')
  })
})
