import { expect, test } from '@playwright/test'
import PocketBase from 'pocketbase'

const POCKETBASE_URL =
  process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

test.describe('Kiosk Mode', () => {
  let pb: PocketBase
  let groupId: string
  let childId: string
  let siblingId: string
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

    // Create a sibling for testing child switcher
    const sibling = await pb.collection('children').create({
      name: 'Leon',
      group: groupId,
      avatar: '👦',
    })
    siblingId = sibling.id

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
      await pb.collection('children').delete(siblingId)
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

  test('should show child switcher when multiple children exist', async ({ page }) => {
    await page.goto(`/kiosk/${childId}`)

    // Child switcher should be visible
    const switcher = page.locator('[data-testid="child-switcher"]')
    await expect(switcher).toBeVisible()

    // Should show both children as tabs
    const tabs = page.locator('[data-testid="child-tab"]')
    await expect(tabs).toHaveCount(2)

    // Should show both names
    await expect(page.locator('[data-testid="child-switcher"]')).toContainText('Emma')
    await expect(page.locator('[data-testid="child-switcher"]')).toContainText('Leon')
  })

  test('should highlight the currently selected child', async ({ page }) => {
    await page.goto(`/kiosk/${childId}`)

    // The selected child tab should have primary styling
    const selectedTab = page.locator(`[data-testid="child-tab"][href="/kiosk/${childId}"]`)
    await expect(selectedTab).toHaveClass(/bg-primary/)
  })

  test('should switch to sibling when clicking their tab', async ({ page }) => {
    await page.goto(`/kiosk/${childId}`)

    // Click on Leon's tab
    await page.click(`[data-testid="child-tab"][href="/kiosk/${siblingId}"]`)

    // Should navigate to Leon's page
    await expect(page).toHaveURL(`/kiosk/${siblingId}`)

    // Should show Leon's name in header
    await expect(page.locator('h1')).toContainText('Leon')
  })

  test('should have completion buttons for each task', async ({ page }) => {
    await page.goto(`/kiosk/${childId}`)

    // Each task should have a completion button
    const completeButtons = page.locator('[data-testid="complete-button"]')
    const taskItems = page.locator('[data-testid="task-item"]')

    const taskCount = await taskItems.count()
    await expect(completeButtons).toHaveCount(taskCount)

    // Buttons should be large enough for touch (56px)
    const firstButton = completeButtons.first()
    const box = await firstButton.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(56)
    expect(box!.height).toBeGreaterThanOrEqual(56)
  })

  test('should remove task from list when completed', async ({ page }) => {
    await page.goto(`/kiosk/${childId}`)

    // Count initial tasks
    const initialTaskItems = page.locator('[data-testid="task-item"]')
    const initialCount = await initialTaskItems.count()
    expect(initialCount).toBeGreaterThan(0)

    // Click the first complete button
    await page.click('[data-testid="complete-button"]')

    // Should still be on the same page
    await expect(page).toHaveURL(new RegExp(`/kiosk/${childId}`))

    // Should have one less task
    await expect(page.locator('[data-testid="task-item"]')).toHaveCount(initialCount - 1)
  })
})

test.describe('Kiosk Mode - Single Child', () => {
  let pb: PocketBase
  let groupId: string
  let childId: string

  test.beforeAll(async () => {
    pb = new PocketBase(POCKETBASE_URL)
    await pb
      .collection('_superusers')
      .authWithPassword('admin@test.local', 'testtest123')

    // Create a group with only one child
    const group = await pb.collection('groups').create({
      name: 'Single Child Family',
    })
    groupId = group.id

    const child = await pb.collection('children').create({
      name: 'Mia',
      group: groupId,
      avatar: '👶',
    })
    childId = child.id
  })

  test.afterAll(async () => {
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

  test('should hide child switcher when only one child exists', async ({ page }) => {
    await page.goto(`/kiosk/${childId}`)

    // Child switcher should NOT be visible
    const switcher = page.locator('[data-testid="child-switcher"]')
    await expect(switcher).not.toBeVisible()

    // Should still show the child's name
    await expect(page.locator('h1')).toContainText('Mia')
  })
})
