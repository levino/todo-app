import { expect, test } from '@playwright/test'
import PocketBase from 'pocketbase'

const POCKETBASE_URL =
  process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

test.describe('Kiosk Mode', () => {
  let pb: PocketBase
  let groupId: string
  let childId: string
  let taskIds: string[] = []

  test.beforeAll(async () => {
    pb = new PocketBase(POCKETBASE_URL)
    await pb
      .collection('_superusers')
      .authWithPassword('admin@test.local', 'testtest123')

    // Create a test group
    const group = await pb.collection('groups').create({
      name: 'E2E Test Family',
    })
    groupId = group.id

    // Create a test child
    const child = await pb.collection('children').create({
      name: 'Emma',
      group: groupId,
      avatar: '👧',
    })
    childId = child.id

    // Create test tasks
    const task1 = await pb.collection('kiosk_tasks').create({
      title: 'Hausaufgaben machen',
      child: childId,
      priority: 1,
      completed: false,
    })
    const task2 = await pb.collection('kiosk_tasks').create({
      title: 'Bett machen',
      child: childId,
      priority: 2,
      completed: false,
    })
    taskIds = [task1.id, task2.id]
  })

  test.afterAll(async () => {
    // Clean up test data
    for (const taskId of taskIds) {
      try {
        await pb.collection('kiosk_tasks').delete(taskId)
      } catch {
        // Ignore if already deleted
      }
    }
    try {
      await pb.collection('children').delete(childId)
    } catch {
      // Ignore
    }
    try {
      await pb.collection('groups').delete(groupId)
    } catch {
      // Ignore
    }
  })

  test('should display the kiosk page with child name', async ({ page }) => {
    await page.goto(`/kiosk/${childId}`)

    // Should show child's name or avatar
    await expect(page.locator('body')).toContainText('Emma')
  })

  test('should display tasks for the child', async ({ page }) => {
    await page.goto(`/kiosk/${childId}`)

    // Should show task titles in large readable text
    await expect(page.locator('body')).toContainText('Hausaufgaben machen')
    await expect(page.locator('body')).toContainText('Bett machen')
  })

  test('should have large touch-friendly task items', async ({ page }) => {
    await page.goto(`/kiosk/${childId}`)

    // Find task items - they should have minimum 44px height for touch targets
    const taskItems = page.locator('[data-testid="task-item"]')
    const count = await taskItems.count()
    expect(count).toBeGreaterThan(0)

    // Check first task item has sufficient size
    const firstTask = taskItems.first()
    const box = await firstTask.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(44)
  })

  test('should be optimized for tablet landscape', async ({ page }) => {
    // Set viewport to tablet landscape
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.goto(`/kiosk/${childId}`)

    // Page should render without horizontal scroll
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  })

  test('should not show editing controls', async ({ page }) => {
    await page.goto(`/kiosk/${childId}`)

    // Should not have edit buttons, delete buttons, or text inputs
    await expect(page.locator('input[type="text"]')).not.toBeVisible()
    await expect(page.locator('button:has-text("Delete")')).not.toBeVisible()
    await expect(page.locator('button:has-text("Edit")')).not.toBeVisible()
    await expect(page.locator('button:has-text("Löschen")')).not.toBeVisible()
    await expect(page.locator('button:has-text("Bearbeiten")')).not.toBeVisible()
  })
})
