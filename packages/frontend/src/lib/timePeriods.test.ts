/**
 * Time Period Utilities Unit Tests
 *
 * These are unit tests that don't require PocketBase.
 */

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TIME_PERIODS,
  parseTime,
  getTimePeriodStart,
  getTimePeriodEnd,
  isTimeInPeriod,
  getCurrentTimePeriod,
  getTimePeriodStartDateTime,
  type UserTimePeriodSettings,
} from './timePeriods'

describe('Time Period Utilities', () => {
  describe('parseTime', () => {
    it('should parse standard time format', () => {
      expect(parseTime('06:00')).toEqual({ hours: 6, minutes: 0 })
      expect(parseTime('12:30')).toEqual({ hours: 12, minutes: 30 })
      expect(parseTime('23:59')).toEqual({ hours: 23, minutes: 59 })
    })

    it('should parse midnight', () => {
      expect(parseTime('00:00')).toEqual({ hours: 0, minutes: 0 })
    })
  })

  describe('getTimePeriodStart', () => {
    it('should return default start times', () => {
      expect(getTimePeriodStart('morning')).toBe('06:00')
      expect(getTimePeriodStart('afternoon')).toBe('12:00')
      expect(getTimePeriodStart('evening')).toBe('18:00')
    })

    it('should use custom settings', () => {
      const customSettings: UserTimePeriodSettings = {
        morningStart: '07:00',
        afternoonStart: '13:00',
        eveningStart: '19:00',
      }
      expect(getTimePeriodStart('morning', customSettings)).toBe('07:00')
      expect(getTimePeriodStart('afternoon', customSettings)).toBe('13:00')
      expect(getTimePeriodStart('evening', customSettings)).toBe('19:00')
    })
  })

  describe('getTimePeriodEnd', () => {
    it('should return end times based on next period start', () => {
      expect(getTimePeriodEnd('morning')).toBe('12:00')
      expect(getTimePeriodEnd('afternoon')).toBe('18:00')
      expect(getTimePeriodEnd('evening')).toBe('00:00') // Midnight
    })

    it('should use custom settings', () => {
      const customSettings: UserTimePeriodSettings = {
        morningStart: '07:00',
        afternoonStart: '13:00',
        eveningStart: '19:00',
      }
      expect(getTimePeriodEnd('morning', customSettings)).toBe('13:00')
      expect(getTimePeriodEnd('afternoon', customSettings)).toBe('19:00')
      expect(getTimePeriodEnd('evening', customSettings)).toBe('00:00')
    })
  })

  describe('isTimeInPeriod', () => {
    it('should detect morning times', () => {
      const morning8am = new Date('2026-01-23T08:00:00')
      const morning6am = new Date('2026-01-23T06:00:00')
      const morning1159 = new Date('2026-01-23T11:59:00')

      expect(isTimeInPeriod(morning8am, 'morning')).toBe(true)
      expect(isTimeInPeriod(morning6am, 'morning')).toBe(true)
      expect(isTimeInPeriod(morning1159, 'morning')).toBe(true)
      expect(isTimeInPeriod(morning8am, 'afternoon')).toBe(false)
      expect(isTimeInPeriod(morning8am, 'evening')).toBe(false)
    })

    it('should detect afternoon times', () => {
      const afternoon2pm = new Date('2026-01-23T14:00:00')
      const afternoon12pm = new Date('2026-01-23T12:00:00')
      const afternoon5pm = new Date('2026-01-23T17:59:00')

      expect(isTimeInPeriod(afternoon2pm, 'afternoon')).toBe(true)
      expect(isTimeInPeriod(afternoon12pm, 'afternoon')).toBe(true)
      expect(isTimeInPeriod(afternoon5pm, 'afternoon')).toBe(true)
      expect(isTimeInPeriod(afternoon2pm, 'morning')).toBe(false)
      expect(isTimeInPeriod(afternoon2pm, 'evening')).toBe(false)
    })

    it('should detect evening times', () => {
      const evening8pm = new Date('2026-01-23T20:00:00')
      const evening6pm = new Date('2026-01-23T18:00:00')
      const evening1159pm = new Date('2026-01-23T23:59:00')

      expect(isTimeInPeriod(evening8pm, 'evening')).toBe(true)
      expect(isTimeInPeriod(evening6pm, 'evening')).toBe(true)
      expect(isTimeInPeriod(evening1159pm, 'evening')).toBe(true)
      expect(isTimeInPeriod(evening8pm, 'morning')).toBe(false)
      expect(isTimeInPeriod(evening8pm, 'afternoon')).toBe(false)
    })

    it('should use custom settings', () => {
      const customSettings: UserTimePeriodSettings = {
        morningStart: '07:00',
        afternoonStart: '13:00',
        eveningStart: '19:00',
      }

      const time6am = new Date('2026-01-23T06:30:00')
      const time12pm = new Date('2026-01-23T12:30:00')
      const time6pm = new Date('2026-01-23T18:30:00')

      // With default settings
      expect(isTimeInPeriod(time6am, 'morning')).toBe(true)
      expect(isTimeInPeriod(time12pm, 'afternoon')).toBe(true)
      expect(isTimeInPeriod(time6pm, 'evening')).toBe(true)

      // With custom settings (all should be different)
      expect(isTimeInPeriod(time6am, 'morning', customSettings)).toBe(false) // Before morning
      expect(isTimeInPeriod(time12pm, 'afternoon', customSettings)).toBe(false) // Still morning
      expect(isTimeInPeriod(time12pm, 'morning', customSettings)).toBe(true)
      expect(isTimeInPeriod(time6pm, 'evening', customSettings)).toBe(false) // Still afternoon
      expect(isTimeInPeriod(time6pm, 'afternoon', customSettings)).toBe(true)
    })
  })

  describe('getCurrentTimePeriod', () => {
    it('should return correct period for each time of day', () => {
      expect(getCurrentTimePeriod(new Date('2026-01-23T08:00:00'))).toBe('morning')
      expect(getCurrentTimePeriod(new Date('2026-01-23T14:00:00'))).toBe('afternoon')
      expect(getCurrentTimePeriod(new Date('2026-01-23T20:00:00'))).toBe('evening')
    })

    it('should return evening for times before morning start', () => {
      expect(getCurrentTimePeriod(new Date('2026-01-23T03:00:00'))).toBe('evening')
      expect(getCurrentTimePeriod(new Date('2026-01-23T05:59:00'))).toBe('evening')
    })

    it('should handle boundary times', () => {
      // At exactly the boundary, it should be the new period
      expect(getCurrentTimePeriod(new Date('2026-01-23T06:00:00'))).toBe('morning')
      expect(getCurrentTimePeriod(new Date('2026-01-23T12:00:00'))).toBe('afternoon')
      expect(getCurrentTimePeriod(new Date('2026-01-23T18:00:00'))).toBe('evening')
    })
  })

  describe('getTimePeriodStartDateTime', () => {
    it('should create correct datetime for each period', () => {
      const date = new Date('2026-01-23T14:30:00')

      const morningStart = getTimePeriodStartDateTime(date, 'morning')
      expect(morningStart.getHours()).toBe(6)
      expect(morningStart.getMinutes()).toBe(0)
      expect(morningStart.getDate()).toBe(23)

      const afternoonStart = getTimePeriodStartDateTime(date, 'afternoon')
      expect(afternoonStart.getHours()).toBe(12)
      expect(afternoonStart.getMinutes()).toBe(0)

      const eveningStart = getTimePeriodStartDateTime(date, 'evening')
      expect(eveningStart.getHours()).toBe(18)
      expect(eveningStart.getMinutes()).toBe(0)
    })

    it('should use custom settings', () => {
      const date = new Date('2026-01-23T14:30:00')
      const customSettings: UserTimePeriodSettings = {
        morningStart: '07:30',
        afternoonStart: '13:30',
        eveningStart: '19:30',
      }

      const morningStart = getTimePeriodStartDateTime(date, 'morning', customSettings)
      expect(morningStart.getHours()).toBe(7)
      expect(morningStart.getMinutes()).toBe(30)
    })
  })
})
