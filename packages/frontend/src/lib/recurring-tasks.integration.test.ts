import PocketBase from 'pocketbase'
import { describe, expect, it, beforeEach } from 'vitest'

const POCKETBASE_URL =
  process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

/**
 * Recurring Tasks Integration Tests
 *
 * These tests verify the recurring tasks feature:
 * - Daily tasks that reset at midnight
 * - Weekly tasks that appear on specific days
 * - Time period filtering (morning, afternoon, evening)
 */
describe('Recurring Tasks', () => {
  let pb: PocketBase
  let groupId: string
  let childId: string

  beforeEach(async () => {
    pb = new PocketBase(POCKETBASE_URL)
    await pb
      .collection('_superusers')
      .authWithPassword('admin@test.local', 'testtest123')

    // Create test group and child
    const group = await pb.collection('groups').create({ name: 'Test Family' })
    groupId = group.id

    const child = await pb.collection('children').create({
      name: 'Max',
      group: groupId,
      color: '#4DABF7',
    })
    childId = child.id
  })

  describe('Task Schema - Recurrence Fields', () => {
    it('should allow creating a task with recurrence type "none"', async () => {
      const task = await pb.collection('kiosk_tasks').create({
        title: 'Regular task',
        child: childId,
        recurrence: 'none',
        completed: false,
      })

      expect(task.recurrence).toBe('none')
    })

    it('should allow creating a daily recurring task', async () => {
      const task = await pb.collection('kiosk_tasks').create({
        title: 'Brush teeth',
        child: childId,
        recurrence: 'daily',
        completed: false,
      })

      expect(task.recurrence).toBe('daily')
    })

    it('should allow creating a weekly recurring task with specific days', async () => {
      // Days: 0=Sunday, 1=Monday, ..., 6=Saturday
      const task = await pb.collection('kiosk_tasks').create({
        title: 'Piano practice',
        child: childId,
        recurrence: 'weekly',
        daysOfWeek: [1, 3], // Monday and Wednesday
        completed: false,
      })

      expect(task.recurrence).toBe('weekly')
      expect(task.daysOfWeek).toEqual([1, 3])
    })
  })

  describe('Task Schema - Time Period Fields', () => {
    it('should allow creating a task with time period "morning"', async () => {
      const task = await pb.collection('kiosk_tasks').create({
        title: 'Get dressed',
        child: childId,
        timePeriod: 'morning',
        completed: false,
      })

      expect(task.timePeriod).toBe('morning')
    })

    it('should allow creating a task with time period "afternoon"', async () => {
      const task = await pb.collection('kiosk_tasks').create({
        title: 'Do homework',
        child: childId,
        timePeriod: 'afternoon',
        completed: false,
      })

      expect(task.timePeriod).toBe('afternoon')
    })

    it('should allow creating a task with time period "evening"', async () => {
      const task = await pb.collection('kiosk_tasks').create({
        title: 'Put on pajamas',
        child: childId,
        timePeriod: 'evening',
        completed: false,
      })

      expect(task.timePeriod).toBe('evening')
    })

    it('should allow creating a task without time period (all day)', async () => {
      const task = await pb.collection('kiosk_tasks').create({
        title: 'Clean room',
        child: childId,
        completed: false,
      })

      // timePeriod should be empty or not set
      expect(task.timePeriod).toBeFalsy()
    })
  })

  describe('Filtering Tasks by Time Period', () => {
    beforeEach(async () => {
      // Create tasks for different time periods
      await pb.collection('kiosk_tasks').create({
        title: 'Morning task 1',
        child: childId,
        timePeriod: 'morning',
        completed: false,
      })
      await pb.collection('kiosk_tasks').create({
        title: 'Morning task 2',
        child: childId,
        timePeriod: 'morning',
        completed: false,
      })
      await pb.collection('kiosk_tasks').create({
        title: 'Afternoon task',
        child: childId,
        timePeriod: 'afternoon',
        completed: false,
      })
      await pb.collection('kiosk_tasks').create({
        title: 'Evening task',
        child: childId,
        timePeriod: 'evening',
        completed: false,
      })
      await pb.collection('kiosk_tasks').create({
        title: 'All day task',
        child: childId,
        completed: false,
      })
    })

    it('should filter tasks by morning time period', async () => {
      const result = await pb.collection('kiosk_tasks').getList(1, 100, {
        filter: `child = "${childId}" && timePeriod = "morning"`,
      })

      expect(result.items.length).toBe(2)
      expect(result.items.every((t) => t.timePeriod === 'morning')).toBe(true)
    })

    it('should filter tasks by afternoon time period', async () => {
      const result = await pb.collection('kiosk_tasks').getList(1, 100, {
        filter: `child = "${childId}" && timePeriod = "afternoon"`,
      })

      expect(result.items.length).toBe(1)
      expect(result.items[0].title).toBe('Afternoon task')
    })

    it('should filter tasks by evening time period', async () => {
      const result = await pb.collection('kiosk_tasks').getList(1, 100, {
        filter: `child = "${childId}" && timePeriod = "evening"`,
      })

      expect(result.items.length).toBe(1)
      expect(result.items[0].title).toBe('Evening task')
    })

    it('should get tasks without time period (all day)', async () => {
      const result = await pb.collection('kiosk_tasks').getList(1, 100, {
        filter: `child = "${childId}" && (timePeriod = "" || timePeriod = null)`,
      })

      expect(result.items.length).toBe(1)
      expect(result.items[0].title).toBe('All day task')
    })
  })

  describe('Recurring Task Reset Logic', () => {
    it('should identify daily tasks that need to be reset', async () => {
      // Create a daily task that was completed yesterday
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)

      const task = await pb.collection('kiosk_tasks').create({
        title: 'Daily task',
        child: childId,
        recurrence: 'daily',
        completed: true,
        completedAt: yesterday.toISOString(),
      })

      // Query for daily tasks completed before today that need reset
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const result = await pb.collection('kiosk_tasks').getList(1, 100, {
        filter: `recurrence = "daily" && completed = true && completedAt < "${today.toISOString()}"`,
      })

      expect(result.items.length).toBe(1)
      expect(result.items[0].id).toBe(task.id)
    })

    it('should NOT reset daily tasks completed today', async () => {
      // Create a daily task completed today
      const task = await pb.collection('kiosk_tasks').create({
        title: 'Daily task',
        child: childId,
        recurrence: 'daily',
        completed: true,
        completedAt: new Date().toISOString(),
      })

      // Query for daily tasks completed before today
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const result = await pb.collection('kiosk_tasks').getList(1, 100, {
        filter: `recurrence = "daily" && completed = true && completedAt < "${today.toISOString()}"`,
      })

      // Task completed today should not appear in reset query
      expect(result.items.find((t) => t.id === task.id)).toBeUndefined()
    })

    it('should reset a recurring task by clearing completed status', async () => {
      const task = await pb.collection('kiosk_tasks').create({
        title: 'Daily task',
        child: childId,
        recurrence: 'daily',
        completed: true,
        completedAt: new Date().toISOString(),
      })

      // Reset the task
      await pb.collection('kiosk_tasks').update(task.id, {
        completed: false,
        completedAt: null,
      })

      const updated = await pb.collection('kiosk_tasks').getOne(task.id)
      expect(updated.completed).toBe(false)
      expect(updated.completedAt).toBeFalsy()
    })
  })

  describe('Weekly Task Day Filtering', () => {
    it('should identify weekly tasks for current day of week', async () => {
      const today = new Date().getDay() // 0-6

      // Create a weekly task for today
      await pb.collection('kiosk_tasks').create({
        title: 'Today weekly task',
        child: childId,
        recurrence: 'weekly',
        daysOfWeek: [today],
        completed: false,
      })

      // Create a weekly task for another day
      const otherDay = (today + 1) % 7
      await pb.collection('kiosk_tasks').create({
        title: 'Other day task',
        child: childId,
        recurrence: 'weekly',
        daysOfWeek: [otherDay],
        completed: false,
      })

      // Query weekly tasks that include today
      // PocketBase JSON array contains operator: daysOfWeek ?~ "value"
      const result = await pb.collection('kiosk_tasks').getList(1, 100, {
        filter: `child = "${childId}" && recurrence = "weekly" && daysOfWeek ~ "${today}"`,
      })

      expect(result.items.length).toBe(1)
      expect(result.items[0].title).toBe('Today weekly task')
    })
  })
})
