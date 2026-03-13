import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import PocketBase from 'pocketbase'
import request from 'supertest'
import { app } from '@family-todo/mcp/src/server.js'
import TasksChildPage from '../../../src/pages/group/[groupId]/tasks/[childId].astro'
import { POST } from '../../../src/pages/api/groups/[groupId]/tasks/[taskId]/complete'
import { resetPocketBase } from '@/lib/pocketbase'

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

const mcpCall = (token: string, toolName: string, args: Record<string, unknown>) =>
  request(app)
    .post('/mcp')
    .query({ token })
    .send({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: toolName, arguments: args },
      id: 1,
    })
    .then((res) => res.body)

const extractId = (text: string) => text.match(/ID: ([a-z0-9]+)/)?.[1] ?? ''

const travelTo = (datetime: string) => vi.setSystemTime(new Date(datetime))

describe('Time-Travel Integration Tests', () => {
  let authToken: string
  let userPb: PocketBase
  let adminPb: PocketBase
  let container: AstroContainer
  let groupId: string
  let childId: string

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    resetPocketBase()

    adminPb = new PocketBase(POCKETBASE_URL)
    await adminPb
      .collection('_superusers')
      .authWithPassword('admin@test.local', 'testtest123')

    const email = `test-${Date.now()}@example.com`
    await adminPb.collection('users').create({
      email,
      password: 'testtest123',
      passwordConfirm: 'testtest123',
    })

    userPb = new PocketBase(POCKETBASE_URL)
    await userPb.collection('users').authWithPassword(email, 'testtest123')
    authToken = userPb.authStore.token

    container = await AstroContainer.create()

    const groupResult = await mcpCall(authToken, 'create_group', {
      name: 'Test Family',
    })
    groupId = extractId(groupResult.result.content[0].text)

    const childResult = await mcpCall(authToken, 'create_child', {
      groupId,
      name: 'TestKind',
      color: '#FF6B6B',
    })
    childId = extractId(childResult.result.content[0].text)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const createTask = (overrides: Record<string, unknown> = {}) =>
    mcpCall(authToken, 'create_task', {
      childId,
      title: 'Test Task',
      timeOfDay: 'morning',
      priority: 1,
      ...overrides,
    }).then((r) => extractId(r.result.content[0].text))

  const renderPage = (errorParam?: string) => {
    const url = errorParam
      ? `http://localhost/group/${groupId}/tasks/${childId}?error=${errorParam}`
      : `http://localhost/group/${groupId}/tasks/${childId}`
    return container.renderToString(TasksChildPage, {
      params: { groupId, childId },
      locals: { pb: userPb, user: userPb.authStore.record },
      request: new Request(url),
    })
  }

  const completeTask = (taskId: string) => {
    const formData = new FormData()
    formData.append('childId', childId)
    return POST({
      params: { groupId, taskId },
      request: new Request(
        `http://localhost/api/groups/${groupId}/tasks/${taskId}/complete`,
        { method: 'POST', body: formData },
      ),
      locals: { pb: userPb, user: userPb.authStore.record },
    } as Parameters<typeof POST>[0])
  }

  const getTask = (taskId: string) => adminPb.collection('tasks').getOne(taskId)

  // ====== A. Phase Filtering ======

  describe('A. Phase Filtering', () => {
    it('at 7:00, child sees only morning tasks', async () => {
      await createTask({ title: 'Morgenaufgabe', timeOfDay: 'morning' })
      await createTask({ title: 'Nachmittagsaufgabe', timeOfDay: 'afternoon' })
      await createTask({ title: 'Abendaufgabe', timeOfDay: 'evening' })
      travelTo('2026-03-10T07:00:00Z')
      const html = await renderPage()
      expect(html).toContain('Morgenaufgabe')
      expect(html).not.toContain('Nachmittagsaufgabe')
      expect(html).not.toContain('Abendaufgabe')
    })

    it('at 14:00, child sees only afternoon tasks', async () => {
      await createTask({ title: 'Morgenaufgabe', timeOfDay: 'morning' })
      await createTask({ title: 'Nachmittagsaufgabe', timeOfDay: 'afternoon' })
      await createTask({ title: 'Abendaufgabe', timeOfDay: 'evening' })
      travelTo('2026-03-10T14:00:00Z')
      const html = await renderPage()
      expect(html).not.toContain('Morgenaufgabe')
      expect(html).toContain('Nachmittagsaufgabe')
      expect(html).not.toContain('Abendaufgabe')
    })

    it('at 20:00, child sees only evening tasks', async () => {
      await createTask({ title: 'Morgenaufgabe', timeOfDay: 'morning' })
      await createTask({ title: 'Nachmittagsaufgabe', timeOfDay: 'afternoon' })
      await createTask({ title: 'Abendaufgabe', timeOfDay: 'evening' })
      travelTo('2026-03-10T20:00:00Z')
      const html = await renderPage()
      expect(html).not.toContain('Morgenaufgabe')
      expect(html).not.toContain('Nachmittagsaufgabe')
      expect(html).toContain('Abendaufgabe')
    })

    it('at 08:59 (1min before morningEnd), morning tasks still show', async () => {
      await createTask({ title: 'Morgenaufgabe', timeOfDay: 'morning' })
      travelTo('2026-03-10T08:59:00Z')
      const html = await renderPage()
      expect(html).toContain('Morgenaufgabe')
    })

    it('at 09:00 (exactly morningEnd), afternoon tasks show', async () => {
      await createTask({ title: 'Nachmittagsaufgabe', timeOfDay: 'afternoon' })
      travelTo('2026-03-10T09:00:00Z')
      const html = await renderPage()
      expect(html).toContain('Nachmittagsaufgabe')
    })

    it('at 17:59 (1min before eveningStart), afternoon tasks still show', async () => {
      await createTask({ title: 'Nachmittagsaufgabe', timeOfDay: 'afternoon' })
      travelTo('2026-03-10T17:59:00Z')
      const html = await renderPage()
      expect(html).toContain('Nachmittagsaufgabe')
    })

    it('at 18:00 (exactly eveningStart), evening tasks show', async () => {
      await createTask({ title: 'Abendaufgabe', timeOfDay: 'evening' })
      travelTo('2026-03-10T18:00:00Z')
      const html = await renderPage()
      expect(html).toContain('Abendaufgabe')
    })

    it('at midnight (00:00), morning tasks show', async () => {
      await createTask({ title: 'Morgenaufgabe', timeOfDay: 'morning' })
      travelTo('2026-03-10T00:00:00Z')
      const html = await renderPage()
      expect(html).toContain('Morgenaufgabe')
    })
  })

  // ====== B. Custom Phase Times ======

  describe('B. Custom Phase Times', () => {
    it('morningEnd=11:00: at 10:30 morning tasks show', async () => {
      await mcpCall(authToken, 'configure_phase_times', {
        groupId,
        morningEnd: '11:00',
        eveningStart: '18:00',
      })
      await createTask({ title: 'Morgenaufgabe', timeOfDay: 'morning' })
      travelTo('2026-03-10T10:30:00Z')
      const html = await renderPage()
      expect(html).toContain('Morgenaufgabe')
    })

    it('morningEnd=11:00: at 11:00 afternoon tasks show', async () => {
      await mcpCall(authToken, 'configure_phase_times', {
        groupId,
        morningEnd: '11:00',
        eveningStart: '18:00',
      })
      await createTask({ title: 'Nachmittagsaufgabe', timeOfDay: 'afternoon' })
      travelTo('2026-03-10T11:00:00Z')
      const html = await renderPage()
      expect(html).toContain('Nachmittagsaufgabe')
    })

    it('eveningStart=16:00: at 16:00 evening tasks show', async () => {
      await mcpCall(authToken, 'configure_phase_times', {
        groupId,
        morningEnd: '09:00',
        eveningStart: '16:00',
      })
      await createTask({ title: 'Abendaufgabe', timeOfDay: 'evening' })
      travelTo('2026-03-10T16:00:00Z')
      const html = await renderPage()
      expect(html).toContain('Abendaufgabe')
    })

    it('morningEnd=06:00, eveningStart=20:00: at 07:00 afternoon shows', async () => {
      await mcpCall(authToken, 'configure_phase_times', {
        groupId,
        morningEnd: '06:00',
        eveningStart: '20:00',
      })
      await createTask({ title: 'Nachmittagsaufgabe', timeOfDay: 'afternoon' })
      travelTo('2026-03-10T07:00:00Z')
      const html = await renderPage()
      expect(html).toContain('Nachmittagsaufgabe')
    })

    it('morningEnd=23:59, eveningStart=23:59: morning tasks show all day', async () => {
      await mcpCall(authToken, 'configure_phase_times', {
        groupId,
        morningEnd: '23:59',
        eveningStart: '23:59',
      })
      await createTask({ title: 'Immer Morgen', timeOfDay: 'morning' })
      await createTask({ title: 'Nie sichtbar', timeOfDay: 'afternoon' })

      travelTo('2026-03-10T15:00:00Z')
      const html = await renderPage()
      expect(html).toContain('Immer Morgen')
      expect(html).not.toContain('Nie sichtbar')
    })
  })

  // ====== C. Due Date Filtering ======

  describe('C. Due Date Filtering', () => {
    it('task with dueDate=today shows in its phase', async () => {
      travelTo('2026-03-10T14:00:00Z')
      await createTask({
        title: 'Heute fällig',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-10',
      })
      const html = await renderPage()
      expect(html).toContain('Heute fällig')
    })

    it('task with dueDate=yesterday shows (overdue)', async () => {
      travelTo('2026-03-10T14:00:00Z')
      await createTask({
        title: 'Gestern fällig',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-09',
      })
      const html = await renderPage()
      expect(html).toContain('Gestern fällig')
    })

    it('task with dueDate=tomorrow does NOT show', async () => {
      travelTo('2026-03-10T14:00:00Z')
      await createTask({
        title: 'Morgen fällig',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-11',
      })
      const html = await renderPage()
      expect(html).not.toContain('Morgen fällig')
    })

    it('task with no dueDate shows normally', async () => {
      travelTo('2026-03-10T14:00:00Z')
      await createTask({ title: 'Ohne Datum', timeOfDay: 'afternoon' })
      const html = await renderPage()
      expect(html).toContain('Ohne Datum')
    })

    it('task with dueDate far in the future does NOT show', async () => {
      travelTo('2026-03-10T14:00:00Z')
      await createTask({
        title: 'Weit weg',
        timeOfDay: 'afternoon',
        dueDate: '2026-12-31',
      })
      const html = await renderPage()
      expect(html).not.toContain('Weit weg')
    })

    it('task with dueDate=today shows at any time that day', async () => {
      await createTask({
        title: 'Heute morgens',
        timeOfDay: 'morning',
        dueDate: '2026-03-10',
      })

      travelTo('2026-03-10T00:01:00Z')
      const htmlEarly = await renderPage()
      expect(htmlEarly).toContain('Heute morgens')

      travelTo('2026-03-10T08:58:00Z')
      const htmlLate = await renderPage()
      expect(htmlLate).toContain('Heute morgens')
    })

    it('mix: only due/overdue tasks show, future ones hidden', async () => {
      travelTo('2026-03-10T14:00:00Z')
      await createTask({
        title: 'Fällig',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-10',
      })
      await createTask({
        title: 'Überfällig',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-08',
      })
      await createTask({
        title: 'Zukunft',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-15',
      })
      const html = await renderPage()
      expect(html).toContain('Fällig')
      expect(html).toContain('Überfällig')
      expect(html).not.toContain('Zukunft')
    })
  })

  // ====== D. Overdue Display ======

  describe('D. Overdue Display', () => {
    it('overdue task shows overdue badge', async () => {
      travelTo('2026-03-10T14:00:00Z')
      await createTask({
        title: 'Alte Aufgabe',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-08',
      })
      const html = await renderPage()
      expect(html).toContain('data-overdue="true"')
      expect(html).toContain('Überfällig')
    })

    it('task due today does NOT show overdue badge', async () => {
      travelTo('2026-03-10T14:00:00Z')
      await createTask({
        title: 'Heute',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-10',
      })
      const html = await renderPage()
      expect(html).toContain('Heute')
      expect(html).not.toContain('data-overdue="true"')
    })

    it('task due yesterday shows overdue badge', async () => {
      travelTo('2026-03-10T14:00:00Z')
      await createTask({
        title: 'Gestern',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-09',
      })
      const html = await renderPage()
      expect(html).toContain('data-overdue="true"')
    })

    it('overdue tasks sorted before non-overdue', async () => {
      travelTo('2026-03-10T14:00:00Z')
      await createTask({
        title: 'NormaleAufgabe',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-10',
        priority: 1,
      })
      await createTask({
        title: 'ÜberfälligeAufgabe',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-08',
        priority: 2,
      })
      const html = await renderPage()
      const overduePos = html.indexOf('ÜberfälligeAufgabe')
      const normalPos = html.indexOf('NormaleAufgabe')
      expect(overduePos).toBeLessThan(normalPos)
    })

    it('multiple overdue tasks sorted by priority', async () => {
      travelTo('2026-03-10T14:00:00Z')
      await createTask({
        title: 'Prio2',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-08',
        priority: 2,
      })
      await createTask({
        title: 'Prio1',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-07',
        priority: 1,
      })
      const html = await renderPage()
      const prio1Pos = html.indexOf('Prio1')
      const prio2Pos = html.indexOf('Prio2')
      expect(prio1Pos).toBeLessThan(prio2Pos)
    })

    it('task becomes overdue at midnight: badge shows at 00:01 next day', async () => {
      await createTask({
        title: 'WirdÜberfällig',
        timeOfDay: 'morning',
        dueDate: '2026-03-10',
      })

      travelTo('2026-03-10T08:00:00Z')
      const htmlBefore = await renderPage()
      expect(htmlBefore).toContain('WirdÜberfällig')
      expect(htmlBefore).not.toContain('data-overdue="true"')

      travelTo('2026-03-11T00:01:00Z')
      const htmlAfter = await renderPage()
      expect(htmlAfter).toContain('WirdÜberfällig')
      expect(htmlAfter).toContain('data-overdue="true"')
    })
  })

  // ====== E. Interval Recurrence ======

  describe('E. Interval Recurrence', () => {
    it('completing daily recurring task: disappears from active list, appears in recently completed', async () => {
      travelTo('2026-03-10T14:00:00Z')
      const taskId = await createTask({
        title: 'Täglich',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-10',
        recurrenceType: 'interval',
        recurrenceInterval: 1,
      })

      const htmlBefore = await renderPage()
      expect(htmlBefore).toContain('Täglich')

      await completeTask(taskId)

      const htmlAfter = await renderPage()
      // Task disappears from active list
      expect(htmlAfter).not.toContain('data-testid="task-item"')
      // But appears in recently completed section
      expect(htmlAfter).toContain('data-testid="recently-completed"')
      expect(htmlAfter).toContain('Täglich')
    })

    it('after traveling to tomorrow: completed daily task reappears', async () => {
      travelTo('2026-03-10T14:00:00Z')
      const taskId = await createTask({
        title: 'Täglich',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-10',
        recurrenceType: 'interval',
        recurrenceInterval: 1,
      })

      await completeTask(taskId)

      travelTo('2026-03-11T14:00:00Z')
      const html = await renderPage()
      expect(html).toContain('Täglich')
    })

    it('every-3-days task: disappears for 2 days, reappears on day 3', async () => {
      travelTo('2026-03-10T14:00:00Z')
      const taskId = await createTask({
        title: 'Alle3Tage',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-10',
        recurrenceType: 'interval',
        recurrenceInterval: 3,
      })

      await completeTask(taskId)

      travelTo('2026-03-11T14:00:00Z')
      const htmlDay1 = await renderPage()
      expect(htmlDay1).not.toContain('Alle3Tage')

      travelTo('2026-03-12T14:00:00Z')
      const htmlDay2 = await renderPage()
      expect(htmlDay2).not.toContain('Alle3Tage')

      travelTo('2026-03-13T14:00:00Z')
      const htmlDay3 = await renderPage()
      expect(htmlDay3).toContain('Alle3Tage')
    })

    it('completing recurring task records lastCompletedAt', async () => {
      travelTo('2026-03-10T14:00:00Z')
      const taskId = await createTask({
        title: 'Recurring',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-10',
        recurrenceType: 'interval',
        recurrenceInterval: 1,
      })

      await completeTask(taskId)

      const task = await getTask(taskId)
      expect(task.lastCompletedAt).toBeTruthy()
      expect(task.lastCompletedAt).toContain('2026-03-10')
    })

    it('completing recurring task keeps completed=false', async () => {
      travelTo('2026-03-10T14:00:00Z')
      const taskId = await createTask({
        title: 'Recurring',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-10',
        recurrenceType: 'interval',
        recurrenceInterval: 1,
      })

      await completeTask(taskId)

      const task = await getTask(taskId)
      expect(task.completed).toBe(false)
    })

    it('complete daily task twice over 2 days: dueDate advances each time', async () => {
      travelTo('2026-03-10T14:00:00Z')
      const taskId = await createTask({
        title: 'Täglich',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-10',
        recurrenceType: 'interval',
        recurrenceInterval: 1,
      })

      await completeTask(taskId)
      const taskAfter1 = await getTask(taskId)
      expect(taskAfter1.dueDate).toContain('2026-03-11')

      travelTo('2026-03-11T14:00:00Z')
      await completeTask(taskId)
      const taskAfter2 = await getTask(taskId)
      expect(taskAfter2.dueDate).toContain('2026-03-12')
    })

    it('recurring interval=1: complete Monday, not in active list Monday, back in active list Tuesday', async () => {
      travelTo('2026-03-09T14:00:00Z') // Monday
      const taskId = await createTask({
        title: 'Täglich',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-09',
        recurrenceType: 'interval',
        recurrenceInterval: 1,
      })

      await completeTask(taskId)

      const htmlMonday = await renderPage()
      // Not in active task list on Monday (but may be in recently completed)
      expect(htmlMonday).not.toContain('data-testid="task-item"')

      travelTo('2026-03-10T14:00:00Z') // Tuesday
      const htmlTuesday = await renderPage()
      expect(htmlTuesday).toContain('Täglich')
    })

    it('recurring task completed at 23:50: next due is tomorrow', async () => {
      travelTo('2026-03-10T23:50:00Z')
      const taskId = await createTask({
        title: 'Spät erledigt',
        timeOfDay: 'evening',
        dueDate: '2026-03-10',
        recurrenceType: 'interval',
        recurrenceInterval: 1,
      })

      await completeTask(taskId)
      const task = await getTask(taskId)
      expect(task.dueDate).toContain('2026-03-11')
    })
  })

  // ====== F. Weekly Recurrence ======

  describe('F. Weekly Recurrence', () => {
    // 2026-03-09=Mon(1), 10=Tue(2), 11=Wed(3), 12=Thu(4), 13=Fri(5), 14=Sat(6), 15=Sun(0)

    it('weekly Mon/Wed/Fri: complete Monday → dueDate=Wednesday', async () => {
      travelTo('2026-03-09T14:00:00Z') // Monday
      const taskId = await createTask({
        title: 'MoMiFr',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-09',
        recurrenceType: 'weekly',
        recurrenceDays: [1, 3, 5],
      })

      await completeTask(taskId)
      const task = await getTask(taskId)
      expect(task.dueDate).toContain('2026-03-11') // Wednesday
    })

    it('weekly Mon/Wed/Fri: complete Friday → dueDate=next Monday', async () => {
      travelTo('2026-03-13T14:00:00Z') // Friday
      const taskId = await createTask({
        title: 'MoMiFr',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-13',
        recurrenceType: 'weekly',
        recurrenceDays: [1, 3, 5],
      })

      await completeTask(taskId)
      const task = await getTask(taskId)
      expect(task.dueDate).toContain('2026-03-16') // next Monday
    })

    it('weekly Mon/Wed/Fri: on Tuesday, completed Monday task not visible', async () => {
      travelTo('2026-03-09T14:00:00Z') // Monday
      const taskId = await createTask({
        title: 'MoMiFr',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-09',
        recurrenceType: 'weekly',
        recurrenceDays: [1, 3, 5],
      })

      await completeTask(taskId)

      travelTo('2026-03-10T14:00:00Z') // Tuesday
      const html = await renderPage()
      expect(html).not.toContain('MoMiFr')
    })

    it('weekly Mon/Wed/Fri: on Wednesday, task visible again', async () => {
      travelTo('2026-03-09T14:00:00Z') // Monday
      const taskId = await createTask({
        title: 'MoMiFr',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-09',
        recurrenceType: 'weekly',
        recurrenceDays: [1, 3, 5],
      })

      await completeTask(taskId)

      travelTo('2026-03-11T14:00:00Z') // Wednesday
      const html = await renderPage()
      expect(html).toContain('MoMiFr')
    })

    it('weekly Sat/Sun: complete Saturday → dueDate=Sunday', async () => {
      travelTo('2026-03-14T14:00:00Z') // Saturday
      const taskId = await createTask({
        title: 'Wochenende',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-14',
        recurrenceType: 'weekly',
        recurrenceDays: [0, 6],
      })

      await completeTask(taskId)
      const task = await getTask(taskId)
      expect(task.dueDate).toContain('2026-03-15') // Sunday
    })

    it('weekly Sat/Sun: complete Sunday → dueDate=next Saturday', async () => {
      travelTo('2026-03-15T14:00:00Z') // Sunday
      const taskId = await createTask({
        title: 'Wochenende',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-15',
        recurrenceType: 'weekly',
        recurrenceDays: [0, 6],
      })

      await completeTask(taskId)
      const task = await getTask(taskId)
      expect(task.dueDate).toContain('2026-03-21') // next Saturday
    })

    it('weekly single day (Thu): complete → dueDate=next Thursday', async () => {
      travelTo('2026-03-12T14:00:00Z') // Thursday
      const taskId = await createTask({
        title: 'Donnerstag',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-12',
        recurrenceType: 'weekly',
        recurrenceDays: [4],
      })

      await completeTask(taskId)
      const task = await getTask(taskId)
      expect(task.dueDate).toContain('2026-03-19') // next Thursday
    })

    it('weekly recurrence across multiple weeks works correctly', async () => {
      travelTo('2026-03-09T14:00:00Z') // Monday
      const taskId = await createTask({
        title: 'Wöchentlich',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-09',
        recurrenceType: 'weekly',
        recurrenceDays: [1], // Mondays only
      })

      await completeTask(taskId)
      const task1 = await getTask(taskId)
      expect(task1.dueDate).toContain('2026-03-16') // next Monday

      travelTo('2026-03-16T14:00:00Z') // next Monday
      await completeTask(taskId)
      const task2 = await getTask(taskId)
      expect(task2.dueDate).toContain('2026-03-23') // Monday after
    })
  })

  // ====== G. Celebration State ======

  describe('G. Celebration State', () => {
    it('all non-recurring tasks completed → celebration shows', async () => {
      travelTo('2026-03-10T14:00:00Z')
      const taskId = await createTask({
        title: 'Einmalig',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-10',
      })

      await completeTask(taskId)

      const html = await renderPage()
      expect(html).toContain('data-testid="celebration"')
      expect(html).toContain('Super gemacht!')
    })

    it('all recurring tasks completed (future dueDate) → celebration shows', async () => {
      travelTo('2026-03-10T14:00:00Z')
      const taskId = await createTask({
        title: 'Täglich',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-10',
        recurrenceType: 'interval',
        recurrenceInterval: 1,
      })

      await completeTask(taskId)

      const html = await renderPage()
      expect(html).toContain('data-testid="celebration"')
    })

    it('one task remains → no celebration', async () => {
      travelTo('2026-03-10T14:00:00Z')
      await createTask({
        title: 'Noch da',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-10',
      })

      const html = await renderPage()
      expect(html).not.toContain('data-testid="celebration"')
      expect(html).toContain('Noch da')
    })

    it('tasks only in other phases → celebration for current phase', async () => {
      travelTo('2026-03-10T14:00:00Z')
      await createTask({
        title: 'Morgenaufgabe',
        timeOfDay: 'morning',
        dueDate: '2026-03-10',
      })

      const html = await renderPage()
      expect(html).toContain('data-testid="celebration"')
      expect(html).not.toContain('Morgenaufgabe')
    })
  })

  // ====== H. Server Validation ======

  describe('H. Server Validation', () => {
    it('cannot complete morning task when it is afternoon → error response', async () => {
      travelTo('2026-03-10T07:00:00Z')
      const taskId = await createTask({
        title: 'Morgenaufgabe',
        timeOfDay: 'morning',
        dueDate: '2026-03-10',
      })

      travelTo('2026-03-10T14:00:00Z')
      const response = await completeTask(taskId)
      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toContain('error=wrong-phase')
    })

    it('cannot complete evening task when it is morning → error response', async () => {
      travelTo('2026-03-10T20:00:00Z')
      const taskId = await createTask({
        title: 'Abendaufgabe',
        timeOfDay: 'evening',
        dueDate: '2026-03-10',
      })

      travelTo('2026-03-10T07:00:00Z')
      const response = await completeTask(taskId)
      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toContain('error=wrong-phase')
    })

    it('cannot complete task with dueDate=tomorrow → error response', async () => {
      travelTo('2026-03-10T14:00:00Z')
      const taskId = await createTask({
        title: 'Morgen',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-11',
      })

      const response = await completeTask(taskId)
      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toContain('error=not-yet-due')
    })

    it('cannot complete task with dueDate=next week → error response', async () => {
      travelTo('2026-03-10T14:00:00Z')
      const taskId = await createTask({
        title: 'Nächste Woche',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-17',
      })

      const response = await completeTask(taskId)
      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toContain('error=not-yet-due')
    })

    it('cannot complete already-completed task → error response', async () => {
      travelTo('2026-03-10T14:00:00Z')
      const taskId = await createTask({
        title: 'Einmalig',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-10',
      })

      await completeTask(taskId)

      const response = await completeTask(taskId)
      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toContain('error=already-completed')
    })

    it('cannot complete task without childId → 400 error', async () => {
      travelTo('2026-03-10T14:00:00Z')
      const taskId = await createTask({
        title: 'Test',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-10',
      })

      const response = await POST({
        params: { groupId, taskId },
        request: new Request(
          `http://localhost/api/groups/${groupId}/tasks/${taskId}/complete`,
          { method: 'POST', body: new FormData() },
        ),
        locals: { pb: userPb, user: userPb.authStore.record },
      } as Parameters<typeof POST>[0])

      expect(response.status).toBe(400)
    })

    it('cannot complete task without auth → 401 error', async () => {
      travelTo('2026-03-10T14:00:00Z')
      const taskId = await createTask({
        title: 'Test',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-10',
      })

      const response = await POST({
        params: { groupId, taskId },
        request: new Request(
          `http://localhost/api/groups/${groupId}/tasks/${taskId}/complete`,
          { method: 'POST', body: new FormData() },
        ),
        locals: { pb: userPb, user: null },
      } as Parameters<typeof POST>[0])

      expect(response.status).toBe(401)
    })

    it('error response from completion displays error in UI', async () => {
      const html = await renderPage('wrong-phase')
      expect(html).toContain('Diese Aufgabe ist gerade nicht dran')
    })
  })

  // ====== I. Edge Cases ======

  describe('I. Edge Cases', () => {
    it('phase transition: visible at 08:59, invisible at 09:01', async () => {
      await createTask({ title: 'Morgenaufgabe', timeOfDay: 'morning' })

      travelTo('2026-03-10T08:59:00Z')
      const htmlBefore = await renderPage()
      expect(htmlBefore).toContain('Morgenaufgabe')

      travelTo('2026-03-10T09:01:00Z')
      const htmlAfter = await renderPage()
      expect(htmlAfter).not.toContain('Morgenaufgabe')
    })

    it('task created at exact midnight boundary', async () => {
      travelTo('2026-03-10T00:00:00Z')
      await createTask({
        title: 'Mitternacht',
        timeOfDay: 'morning',
        dueDate: '2026-03-10',
      })
      const html = await renderPage()
      expect(html).toContain('Mitternacht')
    })

    it('non-recurring task completion: completed=true, never reappears', async () => {
      travelTo('2026-03-10T14:00:00Z')
      const taskId = await createTask({
        title: 'Einmalig',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-10',
      })

      await completeTask(taskId)

      const task = await getTask(taskId)
      expect(task.completed).toBe(true)

      travelTo('2026-03-11T14:00:00Z')
      const html = await renderPage()
      expect(html).not.toContain('Einmalig')
    })

    it('recurrenceType set but no recurrenceInterval → treated as non-recurring', async () => {
      travelTo('2026-03-10T14:00:00Z')
      const taskId = await createTask({
        title: 'Kaputt',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-10',
        recurrenceType: 'interval',
      })

      await completeTask(taskId)

      const task = await getTask(taskId)
      expect(task.completed).toBe(true)
    })

    it('rapid double-completion of same recurring task in same minute', async () => {
      travelTo('2026-03-10T14:00:00Z')
      const taskId = await createTask({
        title: 'Doppelt',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-10',
        recurrenceType: 'interval',
        recurrenceInterval: 1,
      })

      await completeTask(taskId)
      const task1 = await getTask(taskId)
      expect(task1.dueDate).toContain('2026-03-11')

      // Second completion should fail because dueDate is now tomorrow
      const response = await completeTask(taskId)
      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toContain('error=not-yet-due')
    })
  })

  // ====== J. Reset Task ======

  describe('J. Reset Task', () => {
    const resetTask = (taskId: string, dueDate?: string) =>
      mcpCall(authToken, 'reset_task', { taskId, ...(dueDate ? { dueDate } : {}) })

    it('reset recurring task completed today restores dueDate to today', async () => {
      travelTo('2026-03-10T14:00:00Z')
      const taskId = await createTask({
        title: 'Daily Task',
        timeOfDay: 'afternoon',
        dueDate: '2026-03-10',
        recurrenceType: 'interval',
        recurrenceInterval: 1,
      })

      await completeTask(taskId)
      const completedTask = await getTask(taskId)
      // After completion, dueDate is advanced to tomorrow
      expect(completedTask.dueDate).toContain('2026-03-11')

      await resetTask(taskId)
      const resetTaskResult = await getTask(taskId)
      expect(resetTaskResult.completed).toBe(false)
      // dueDate should be restored to today, not left at tomorrow
      expect(resetTaskResult.dueDate).toContain('2026-03-10')
    })

    it('reset with explicit dueDate parameter sets that date', async () => {
      travelTo('2026-03-10T14:00:00Z')
      const taskId = await createTask({
        title: 'Custom Reset',
        timeOfDay: 'morning',
        dueDate: '2026-03-10',
        recurrenceType: 'interval',
        recurrenceInterval: 1,
      })

      await completeTask(taskId)
      await resetTask(taskId, '2026-03-12')
      const task = await getTask(taskId)
      expect(task.completed).toBe(false)
      expect(task.dueDate).toContain('2026-03-12')
    })
  })
})
