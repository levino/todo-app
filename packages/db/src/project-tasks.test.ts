import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type DB,
  createChild,
  createDb,
  createGroup,
  createTask,
  completeTask,
  deferTask,
  getLocalDateString,
  getTask,
  getTasksPageViewForChild,
  splitViewRowsByChild,
  undoTask,
  updateTask,
  upsertUserByEmail,
} from './index.js'

// Project tasks ("Projektaufgaben"): tasks you chip away at over several days.
// They have TWO completion actions:
//  - "Für heute geschafft" (defer): hide until tomorrow, reappear next day.
//  - "Ganz fertig" (complete): finally done (one-off) or rescheduled to its
//    next due date (recurring) — the existing completeTask behaviour.
describe('Project tasks (Projektaufgaben)', () => {
  let db: DB

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // A Sunday afternoon in Berlin (CEST = UTC+2): local date 2026-06-14.
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'))
    db = createDb(':memory:')
  })

  afterEach(() => {
    vi.useRealTimers()
    db.close()
  })

  function setup() {
    const alice = upsertUserByEmail(db, 'alice@example.com')
    const g = createGroup(db, alice.id, 'Family A')
    const child = createChild(db, g.id, 'Kid', '#FF6B6B')
    return { alice, g, child }
  }

  const TZ = 'Europe/Berlin'

  it('createTask persists isProject and defaults deferredUntil to null', () => {
    const { child } = setup()
    const task = createTask(db, child.id, {
      title: 'Stricken',
      timeOfDay: 'afternoon',
      isProject: true,
    })
    const stored = getTask(db, task.id)
    expect(stored?.isProject).toBe(true)
    expect(stored?.deferredUntil).toBeNull()
  })

  it('createTask defaults isProject to false for normal tasks', () => {
    const { child } = setup()
    const task = createTask(db, child.id, { title: 'Zähne putzen', timeOfDay: 'morning' })
    expect(getTask(db, task.id)?.isProject).toBe(false)
  })

  it('tasks_page_view exposes the new columns', () => {
    const { child } = setup()
    createTask(db, child.id, { title: 'Stricken', timeOfDay: 'afternoon', isProject: true })
    const rows = getTasksPageViewForChild(db, child.id)
    const row = rows.find((r) => r.task_title === 'Stricken')!
    expect(row).toBeDefined()
    expect(row.task_is_project).toBeTruthy()
    expect(row.task_deferred_until == null || row.task_deferred_until === '').toBe(true)
  })

  it('deferTask hides the task until the next local day', () => {
    const { child } = setup()
    const task = createTask(db, child.id, {
      title: 'Stricken',
      timeOfDay: 'afternoon',
      isProject: true,
    })

    deferTask(db, task.id, TZ)

    const stored = getTask(db, task.id)!
    // deferred until tomorrow's local date (2026-06-15)
    expect(stored.deferredUntil?.slice(0, 10)).toBe('2026-06-15')
    expect(stored.completed).toBe(false)
  })

  it('a deferred project task drops out of active and shows as done for today', () => {
    const { child } = setup()
    const task = createTask(db, child.id, {
      title: 'Stricken',
      timeOfDay: 'afternoon',
      isProject: true,
    })

    const today = getLocalDateString(TZ) // 2026-06-14
    const splitParams = { phase: 'afternoon' as const, todayDateStr: today, timezone: TZ, showFuture: false }

    // Before deferring: active.
    let split = splitViewRowsByChild(getTasksPageViewForChild(db, child.id), splitParams)[0]
    expect(split.active.map((t) => t.id)).toContain(task.id)
    expect(split.recentlyCompleted.map((t) => t.id)).not.toContain(task.id)

    deferTask(db, task.id, TZ)

    // After deferring (same day): hidden from active, listed as done-for-today.
    split = splitViewRowsByChild(getTasksPageViewForChild(db, child.id), splitParams)[0]
    expect(split.active.map((t) => t.id)).not.toContain(task.id)
    expect(split.recentlyCompleted.map((t) => t.id)).toContain(task.id)
  })

  it('a deferred project task reappears as active the next day', () => {
    const { child } = setup()
    const task = createTask(db, child.id, {
      title: 'Stricken',
      timeOfDay: 'afternoon',
      isProject: true,
    })
    deferTask(db, task.id, TZ)

    // Simulate "tomorrow" by passing tomorrow's date to the splitter.
    const tomorrow = '2026-06-15'
    const split = splitViewRowsByChild(getTasksPageViewForChild(db, child.id), {
      phase: 'afternoon',
      todayDateStr: tomorrow,
      timezone: TZ,
      showFuture: false,
    })[0]
    expect(split.active.map((t) => t.id)).toContain(task.id)
    expect(split.recentlyCompleted.map((t) => t.id)).not.toContain(task.id)
  })

  it('undoTask clears the deferral (brings a done-for-today task back to active)', () => {
    const { child } = setup()
    const task = createTask(db, child.id, {
      title: 'Stricken',
      timeOfDay: 'afternoon',
      isProject: true,
    })
    deferTask(db, task.id, TZ)
    expect(getTask(db, task.id)?.deferredUntil).toBeTruthy()

    const res = undoTask(db, task.id, TZ)
    expect(res.error).toBeUndefined()
    expect(getTask(db, task.id)?.deferredUntil).toBeNull()

    const today = getLocalDateString(TZ)
    const split = splitViewRowsByChild(getTasksPageViewForChild(db, child.id), {
      phase: 'afternoon',
      todayDateStr: today,
      timezone: TZ,
      showFuture: false,
    })[0]
    expect(split.active.map((t) => t.id)).toContain(task.id)
  })

  it('completeTask on a deferred one-off project task marks it done and clears the deferral', () => {
    const { alice, g, child } = setup()
    const task = createTask(db, child.id, {
      title: 'Stricken',
      timeOfDay: 'afternoon',
      isProject: true,
    })
    deferTask(db, task.id, TZ)

    const res = completeTask(db, task.id, child.id, alice.id, g.id)
    expect(res.error).toBeUndefined()

    const stored = getTask(db, task.id)!
    expect(stored.completed).toBe(true)
    expect(stored.deferredUntil).toBeNull()
  })

  it('updateTask can toggle isProject', () => {
    const { child } = setup()
    const task = createTask(db, child.id, { title: 'Stricken', timeOfDay: 'afternoon' })
    expect(getTask(db, task.id)?.isProject).toBe(false)

    updateTask(db, task.id, { isProject: true })
    expect(getTask(db, task.id)?.isProject).toBe(true)

    updateTask(db, task.id, { isProject: false })
    expect(getTask(db, task.id)?.isProject).toBe(false)
  })
})
