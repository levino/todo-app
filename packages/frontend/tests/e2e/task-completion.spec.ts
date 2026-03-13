import { test, expect } from '@playwright/test'
import PocketBase from 'pocketbase'

const POCKETBASE_URL =
  process.env.POCKETBASE_URL || 'http://localhost:8090'

const getCurrentPhase = (morningEnd: string, eveningStart: string) => {
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const [mH, mM] = morningEnd.split(':').map(Number)
  const [eH, eM] = eveningStart.split(':').map(Number)
  if (currentMinutes < mH * 60 + mM) return 'morning'
  if (currentMinutes < eH * 60 + eM) return 'afternoon'
  return 'evening'
}

const setupTestData = async () => {
  const pb = new PocketBase(POCKETBASE_URL)
  await pb
    .collection('_superusers')
    .authWithPassword('admin@test.local', 'testtest123')

  const group = await pb.collection('groups').create({
    name: 'E2E Test Family',
    morningEnd: '09:00',
    eveningStart: '18:00',
  })

  const child1 = await pb.collection('children').create({
    name: 'Anna',
    color: '#FF6B6B',
    group: group.id,
  })

  const child2 = await pb.collection('children').create({
    name: 'Ben',
    color: '#4DABF7',
    group: group.id,
  })

  const phase = getCurrentPhase('09:00', '18:00')
  const today = new Date().toISOString()

  const task1 = await pb.collection('tasks').create({
    title: 'Zähne putzen',
    child: child1.id,
    completed: false,
    timeOfDay: phase,
    dueDate: today,
    priority: 1,
  })

  const task2 = await pb.collection('tasks').create({
    title: 'Zimmer aufräumen',
    child: child2.id,
    completed: false,
    timeOfDay: phase,
    dueDate: today,
    priority: 1,
  })

  return { pb, group, child1, child2, task1, task2 }
}

const cleanupTestData = async (
  pb: PocketBase,
  ids: { tasks: string[]; children: string[]; groups: string[] },
) => {
  for (const id of ids.tasks) {
    try {
      await pb.collection('tasks').delete(id)
    } catch {}
  }
  for (const id of ids.children) {
    try {
      await pb.collection('children').delete(id)
    } catch {}
  }
  for (const id of ids.groups) {
    try {
      await pb.collection('groups').delete(id)
    } catch {}
  }
}

test.describe('Task completion confirmation dialog', () => {
  let pb: PocketBase
  let group: { id: string }
  let child1: { id: string }
  let child2: { id: string }
  let task1: { id: string }
  let task2: { id: string }

  test.beforeAll(async () => {
    const data = await setupTestData()
    pb = data.pb
    group = data.group
    child1 = data.child1
    child2 = data.child2
    task1 = data.task1
    task2 = data.task2
  })

  test.afterAll(async () => {
    await cleanupTestData(pb, {
      tasks: [task1.id, task2.id],
      children: [child1.id, child2.id],
      groups: [group.id],
    })
  })

  test('shows confirmation dialog when clicking complete button on child page', async ({
    page,
  }) => {
    await page.goto(`/group/${group.id}/tasks/${child1.id}`)

    const completeButton = page.locator('[data-testid="complete-button"]').first()
    await expect(completeButton).toBeVisible()

    await completeButton.click()

    const dialog = page.locator('[data-testid="confirm-dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Zähne putzen')
  })

  test('canceling confirmation dialog does NOT complete the task', async ({
    page,
  }) => {
    await page.goto(`/group/${group.id}/tasks/${child1.id}`)

    const completeButton = page.locator('[data-testid="complete-button"]').first()
    await completeButton.click()

    const cancelButton = page.locator('[data-testid="confirm-cancel"]')
    await expect(cancelButton).toBeVisible()
    await cancelButton.click()

    const dialog = page.locator('[data-testid="confirm-dialog"]')
    await expect(dialog).not.toBeVisible()

    // Task should still be visible (not completed)
    const taskItem = page.locator('[data-testid="task-item"]').first()
    await expect(taskItem).toBeVisible()
    await expect(taskItem).toContainText('Zähne putzen')
  })

  test('confirming dialog completes the task', async ({ page }) => {
    await page.goto(`/group/${group.id}/tasks/${child1.id}`)

    const tasksBefore = await page.locator('[data-testid="task-item"]').count()
    expect(tasksBefore).toBeGreaterThan(0)

    const completeButton = page.locator('[data-testid="complete-button"]').first()
    await completeButton.click()

    const confirmButton = page.locator('[data-testid="confirm-ok"]')
    await expect(confirmButton).toBeVisible()
    await confirmButton.click()

    // After confirmation, page reloads and task should be gone
    await page.waitForURL(`/group/${group.id}/tasks/${child1.id}`)

    // Recreate the task for remaining tests
    const phase = getCurrentPhase('09:00', '18:00')
    task1 = await pb.collection('tasks').create({
      title: 'Zähne putzen',
      child: child1.id,
      completed: false,
      timeOfDay: phase,
      dueDate: new Date().toISOString(),
      priority: 1,
    })
  })

  test('shows confirmation dialog on overview page', async ({ page }) => {
    await page.goto(`/group/${group.id}/tasks/overview`)

    const completeButton = page.locator('[data-testid="complete-button"]').first()
    await expect(completeButton).toBeVisible()

    await completeButton.click()

    const dialog = page.locator('[data-testid="confirm-dialog"]')
    await expect(dialog).toBeVisible()
  })

  test('canceling on overview page does NOT complete the task', async ({
    page,
  }) => {
    await page.goto(`/group/${group.id}/tasks/overview`)

    const completeButton = page.locator('[data-testid="complete-button"]').first()
    await completeButton.click()

    const cancelButton = page.locator('[data-testid="confirm-cancel"]')
    await cancelButton.click()

    const dialog = page.locator('[data-testid="confirm-dialog"]')
    await expect(dialog).not.toBeVisible()

    // Tasks should still be there
    const taskItems = page.locator('[data-testid="task-item"]')
    await expect(taskItems.first()).toBeVisible()
  })
})
