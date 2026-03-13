import { describe, expect, it } from 'vitest'
import { getCurrentPhase, getLocalDateString, getLocalTimeMinutes, sortTasks } from './tasks'

describe('getLocalDateString', () => {
  it('should return local date in Europe/Berlin timezone', () => {
    // 2026-03-13 23:30 UTC = 2026-03-14 00:30 in Europe/Berlin (CET = UTC+1)
    const result = getLocalDateString('Europe/Berlin', new Date('2026-03-13T23:30:00Z'))
    expect(result).toBe('2026-03-14')
  })

  it('should return UTC date when no timezone offset', () => {
    const result = getLocalDateString('UTC', new Date('2026-03-13T23:30:00Z'))
    expect(result).toBe('2026-03-13')
  })

  it('should handle summer time (CEST = UTC+2)', () => {
    // 2026-06-15 22:30 UTC = 2026-06-16 00:30 in Europe/Berlin (CEST = UTC+2)
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
    // 2026-03-13 08:30 UTC = 2026-03-13 09:30 in Europe/Berlin (CET)
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
    // 2026-03-13 07:30 UTC = 08:30 CET → morning (before 09:00)
    const phase = getCurrentPhase('09:00', '18:00', 'Europe/Berlin', new Date('2026-03-13T07:30:00Z'))
    expect(phase).toBe('morning')
  })

  it('should be afternoon in Berlin when UTC is still morning', () => {
    // 2026-03-13 08:30 UTC = 09:30 CET → afternoon (after 09:00)
    const phase = getCurrentPhase('09:00', '18:00', 'Europe/Berlin', new Date('2026-03-13T08:30:00Z'))
    expect(phase).toBe('afternoon')
  })

  it('should be evening in Berlin when UTC is still afternoon', () => {
    // 2026-03-13 17:30 UTC = 18:30 CET → evening (after 18:00)
    const phase = getCurrentPhase('09:00', '18:00', 'Europe/Berlin', new Date('2026-03-13T17:30:00Z'))
    expect(phase).toBe('evening')
  })
})

describe('sortTasks with timezone', () => {
  it('should use timezone for overdue detection', () => {
    // 2026-03-13 23:30 UTC = 2026-03-14 in Europe/Berlin
    // A task due on 2026-03-13 is overdue in Berlin on 2026-03-14 local
    const tasks = [
      { id: '1', title: 'Due today', dueDate: '2026-03-14 00:00:00.000Z', priority: 1, completed: false, child: 'c1', recurrenceType: null, recurrenceInterval: null, recurrenceDays: null, timeOfDay: 'afternoon', lastCompletedAt: null, completedAt: null, completedBy: null },
      { id: '2', title: 'Overdue', dueDate: '2026-03-13 00:00:00.000Z', priority: 2, completed: false, child: 'c1', recurrenceType: null, recurrenceInterval: null, recurrenceDays: null, timeOfDay: 'afternoon', lastCompletedAt: null, completedAt: null, completedBy: null },
    ]
    const sorted = sortTasks(tasks, 'Europe/Berlin', new Date('2026-03-13T23:30:00Z'))
    expect(sorted[0].title).toBe('Overdue')
  })
})
