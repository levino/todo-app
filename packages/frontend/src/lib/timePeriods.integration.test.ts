/**
 * Time Period Settings Integration Tests
 *
 * Tests that verify user-configurable time period settings
 * are correctly loaded from PocketBase and applied.
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { createTestUser, type TestContext } from '../../tests/helpers'
import {
  DEFAULT_TIME_PERIODS,
  getUserTimePeriodSettings,
} from './timePeriods'

describe('User Time Period Settings Integration', () => {
  let ctx: TestContext

  beforeEach(async () => {
    ctx = await createTestUser()
  })

  it('should return default settings when user has no custom settings', async () => {
    const settings = await getUserTimePeriodSettings(ctx.userPb, ctx.userId)

    expect(settings).toEqual(DEFAULT_TIME_PERIODS)
    expect(settings.morningStart).toBe('06:00')
    expect(settings.afternoonStart).toBe('12:00')
    expect(settings.eveningStart).toBe('18:00')
  })

  it('should return custom settings when user has configured them', async () => {
    // Update user with custom time period settings (using admin because user may not have permission to update their own record fully)
    await ctx.adminPb.collection('users').update(ctx.userId, {
      morningStart: '07:00',
      afternoonStart: '13:00',
      eveningStart: '19:00',
    })

    const settings = await getUserTimePeriodSettings(ctx.userPb, ctx.userId)

    expect(settings.morningStart).toBe('07:00')
    expect(settings.afternoonStart).toBe('13:00')
    expect(settings.eveningStart).toBe('19:00')
  })

  it('should use defaults for unset fields', async () => {
    // Update user with only some custom settings
    await ctx.adminPb.collection('users').update(ctx.userId, {
      morningStart: '08:00',
      afternoonStart: '',
      eveningStart: '',
    })

    const settings = await getUserTimePeriodSettings(ctx.userPb, ctx.userId)

    expect(settings.morningStart).toBe('08:00')
    expect(settings.afternoonStart).toBe('12:00') // Default
    expect(settings.eveningStart).toBe('18:00') // Default
  })

  it('should return defaults if user not found', async () => {
    const settings = await getUserTimePeriodSettings(ctx.userPb, 'nonexistent-user-id')

    expect(settings).toEqual(DEFAULT_TIME_PERIODS)
  })
})
