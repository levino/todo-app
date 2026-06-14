import { describe, expect, it } from 'vitest'
import {
  calculateInitialDueDate,
  calculateNextDueDate,
  getCurrentPhase,
  getLocalDateString,
  getLocalTimeMinutes,
  getLocalWeekday,
  sortTasks,
  validateRecurrenceDays,
} from './tasks.js'

// Ported from packages/frontend/src/lib/tasks.test.ts

describe('getLocalDateString', () => {
  it('should return local date in Europe/Berlin timezone', () => {
    const result = getLocalDateString('Europe/Berlin', new Date('2026-03-13T23:30:00Z'))
    expect(result).toBe('2026-03-14')
  })

  it('should return UTC date when no timezone offset', () => {
    const result = getLocalDateString('UTC', new Date('2026-03-13T23:30:00Z'))
    expect(result).toBe('2026-03-13')
  })

  it('should handle summer time (CEST = UTC+2)', () => {
    const result = getLocalDateString('Europe/Berlin', new Date('2026-06-15T22:30:00Z'))
    expect(result).toBe('2026-06-16')
  })

  it('should default to Europe/Berlin when empty timezone', () => {
    const result = getLocalDateString('', new Date('2026-03-13T23:30:00Z'))
    expect(result).toBe('2026-03-14')
  })
})

describe('getLocalTimeMinutes', () => {
  it('should return local time in minutes for Europe/Berlin', () => {
    const result = getLocalTimeMinutes('Europe/Berlin', new Date('2026-03-13T08:30:00Z'))
    expect(result).toBe(9 * 60 + 30)
  })

  it('should return UTC time when timezone is UTC', () => {
    const result = getLocalTimeMinutes('UTC', new Date('2026-03-13T08:30:00Z'))
    expect(result).toBe(8 * 60 + 30)
  })
})

describe('getCurrentPhase with timezone', () => {
  it('should use timezone to determine current phase', () => {
    const phase = getCurrentPhase('09:00', '18:00', 'Europe/Berlin', new Date('2026-03-13T07:30:00Z'))
    expect(phase).toBe('morning')
  })

  it('should be afternoon in Berlin when UTC is still morning', () => {
    const phase = getCurrentPhase('09:00', '18:00', 'Europe/Berlin', new Date('2026-03-13T08:30:00Z'))
    expect(phase).toBe('afternoon')
  })

  it('should be evening in Berlin when UTC is still afternoon', () => {
    const phase = getCurrentPhase('09:00', '18:00', 'Europe/Berlin', new Date('2026-03-13T17:30:00Z'))
    expect(phase).toBe('evening')
  })
})

describe('sortTasks', () => {
  it('sorts purely by priority and does NOT hoist past-due tasks', () => {
    const tasks = [
      { id: '1', title: 'Due today', priority: 1 },
      { id: '2', title: 'Past due', priority: 2 },
    ]
    const sorted = sortTasks(tasks, 'Europe/Berlin', new Date('2026-03-13T23:30:00Z'))
    expect(sorted[0].title).toBe('Due today')
  })

  it('treats null/0 priority as lowest', () => {
    const tasks = [
      { id: '1', title: 'No prio', priority: null },
      { id: '2', title: 'Prio 5', priority: 5 },
      { id: '3', title: 'Zero prio', priority: 0 },
    ]
    const sorted = sortTasks(tasks)
    expect(sorted[0].title).toBe('Prio 5')
  })
})

describe('calculateNextDueDate', () => {
  it('advances by interval days', () => {
    const next = calculateNextDueDate('interval', 3, null, new Date('2026-03-10T12:00:00Z'), 'UTC')
    expect(next?.slice(0, 10)).toBe('2026-03-13')
  })

  it('finds the next weekly weekday', () => {
    // 2026-03-10 is a Tuesday (2). Next configured day Friday (5) -> +3 days.
    const next = calculateNextDueDate('weekly', null, [5], new Date('2026-03-10T12:00:00Z'), 'UTC')
    expect(getLocalWeekday('UTC', new Date(next as string))).toBe(5)
  })

  it('returns null for no recurrence', () => {
    expect(calculateNextDueDate(null, null, null, new Date(), 'UTC')).toBeNull()
  })
})

describe('calculateInitialDueDate', () => {
  it('returns today for interval recurrence', () => {
    const due = calculateInitialDueDate('interval', 2, null, new Date('2026-03-10T12:00:00Z'), 'UTC')
    expect(due?.slice(0, 10)).toBe('2026-03-10')
  })

  it('returns today if today matches a weekly day', () => {
    // 2026-03-10 Tuesday (2) is in the set -> due today.
    const due = calculateInitialDueDate('weekly', null, [2], new Date('2026-03-10T12:00:00Z'), 'UTC')
    expect(due?.slice(0, 10)).toBe('2026-03-10')
  })
})

describe('validateRecurrenceDays', () => {
  it('accepts null', () => {
    expect(validateRecurrenceDays(null)).toBeNull()
  })
  it('accepts valid 0..6', () => {
    expect(validateRecurrenceDays([0, 3, 6])).toBeNull()
  })
  it('rejects 7 (legacy Sunday)', () => {
    expect(validateRecurrenceDays([7])).toMatch(/Invalid weekday 7/)
  })
  it('rejects duplicates', () => {
    expect(validateRecurrenceDays([1, 1])).toMatch(/duplicate/)
  })
  it('rejects non-array', () => {
    expect(validateRecurrenceDays(42 as unknown as number[])).toMatch(/array/)
  })
})
