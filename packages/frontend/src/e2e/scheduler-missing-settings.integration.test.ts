import { describe, it, expect, beforeEach } from 'vitest'
import { processSchedules } from '../lib/scheduleProcessor'
import { createTestUser, createTestGroup, createTestChild, type TestContext } from '../../tests/helpers'

/**
 * Regression Test: Scheduler fails when user has no time period settings
 *
 * Bug: parseTime gets undefined when user.morningStart etc. are not set
 * Error: TypeError: Cannot read properties of undefined (reading 'split')
 *
 * TODO: Tests verbessern - aktuell prüfen sie nur "kein Crash", aber nicht:
 * - Ob Tasks überhaupt erstellt werden
 * - Ob visibleFrom auf Default-Zeiten (06:00, 12:00, 18:00) basiert
 *
 * TODO: Verhalten ist fragwürdig - bei fehlenden/korrupten Daten (keine user_groups,
 * leere Settings) werden still Default-Werte verwendet. Sollte das nicht eher:
 * - Geloggt werden?
 * - Ein Fehler sein wenn keine user_groups existieren?
 * - Die Schedule als invalid markiert werden?
 */
describe('Scheduler with missing user settings', () => {
  let ctx: TestContext
  let groupId: string
  let childId: string

  beforeEach(async () => {
    ctx = await createTestUser()
    groupId = await createTestGroup(ctx.adminPb, ctx.userId)
    childId = await createTestChild(ctx.adminPb, groupId)
  })

  it('should NOT throw when user has no time period settings configured', async () => {
    // Create a schedule - user has NO morningStart/afternoonStart/eveningStart set
    await ctx.userPb.collection('schedules').create({
      title: 'Test task',
      child: childId,
      timePeriod: 'morning',
      daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      active: true,
    })

    // This should NOT throw
    await expect(processSchedules(ctx.adminPb)).resolves.not.toThrow()
  })

  it('should NOT throw when user has empty strings for time period settings', async () => {
    // Set user's time settings to empty strings (PocketBase returns "" for unset text fields)
    await ctx.adminPb.collection('users').update(ctx.userId, {
      morningStart: '',
      afternoonStart: '',
      eveningStart: '',
    })

    await ctx.userPb.collection('schedules').create({
      title: 'Test task with empty settings',
      child: childId,
      timePeriod: 'evening',
      daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      active: true,
    })

    // This should NOT throw
    await expect(processSchedules(ctx.adminPb)).resolves.not.toThrow()
  })

  it('should NOT throw when group has no users in user_groups', async () => {
    // Remove user from user_groups
    const userGroups = await ctx.adminPb.collection('user_groups').getFullList({
      filter: `group = "${groupId}" && user = "${ctx.userId}"`,
    })
    for (const ug of userGroups) {
      await ctx.adminPb.collection('user_groups').delete(ug.id)
    }

    await ctx.adminPb.collection('schedules').create({
      title: 'Test task with no user_groups',
      child: childId,
      timePeriod: 'afternoon',
      daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      active: true,
    })

    // This should NOT throw
    await expect(processSchedules(ctx.adminPb)).resolves.not.toThrow()
  })
})
