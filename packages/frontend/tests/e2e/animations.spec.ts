import { test, expect, type Page } from '@playwright/test'
import PocketBase from 'pocketbase'

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://localhost:8090'

const TEST_USER_EMAIL = `e2e-anim-${Date.now()}@example.com`
const TEST_USER_PASSWORD = 'testtest123'

type Ids = { groupId: string; childId: string; celebChildId: string; taskIds: string[] }

// Group spans the whole day (00:00–23:59) so the active phase is always
// "afternoon" regardless of the runner's timezone — keeps the spec robust.
const setup = async (): Promise<Ids & { pb: PocketBase }> => {
  const pb = new PocketBase(POCKETBASE_URL)
  await pb.collection('_superusers').authWithPassword('admin@test.local', 'testtest123')

  const group = await pb.collection('groups').create({
    name: 'E2E Anim Family',
    morningEnd: '00:00',
    eveningStart: '23:59',
    timezone: 'Europe/Berlin',
  })

  const user = await pb.collection('users').create({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
    passwordConfirm: TEST_USER_PASSWORD,
  })
  await pb.collection('user_groups').create({ user: user.id, group: group.id })

  const child = await pb.collection('children').create({
    name: 'Mia',
    color: '#FF6B6B',
    group: group.id,
  })

  // A points balance so the (view-transitioned) points badge renders.
  await pb.collection('point_transactions').create({
    child: child.id,
    points: 12,
    type: 'earned',
    description: 'seed',
  })

  const taskIds: string[] = []
  for (const title of ['Zähne putzen', 'Aufräumen', 'Tisch decken']) {
    const task = await pb.collection('tasks').create({
      title,
      child: child.id,
      completed: false,
      timeOfDay: 'afternoon',
      points: 5,
    })
    taskIds.push(task.id)
  }

  // A second child with no tasks -> their page shows the celebration state.
  const celebChild = await pb.collection('children').create({
    name: 'Leo',
    color: '#4DABF7',
    group: group.id,
  })

  return { pb, groupId: group.id, childId: child.id, celebChildId: celebChild.id, taskIds }
}

const login = async (page: Page) => {
  // Origin header satisfies Astro's CSRF origin check for form POSTs.
  await page.request.post('http://localhost:4321/api/auth/login', {
    form: { email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD },
    headers: { Origin: 'http://localhost:4321' },
  })
}

test.describe('Task completion animations', () => {
  let ids: Ids
  let pb: PocketBase

  test.beforeAll(async () => {
    const s = await setup()
    pb = s.pb
    ids = {
      groupId: s.groupId,
      childId: s.childId,
      celebChildId: s.celebChildId,
      taskIds: s.taskIds,
    }
  })

  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('each task carries a real view-transition-name in the browser', async ({ page }) => {
    await page.goto(`/group/${ids.groupId}/tasks?child=${ids.childId}`)

    const firstTask = page.locator('[data-testid="task-item"]').first()
    await expect(firstTask).toBeVisible()

    // This is exactly what the integration/Container layer cannot see: the
    // generated <style> that maps the scope to the actual view-transition-name.
    const vtName = await firstTask.evaluate((el) => getComputedStyle(el).viewTransitionName)
    expect(vtName).not.toBe('none')
    expect(vtName.startsWith('task-')).toBe(true)
  })

  test('checking off a task uses Astro view transitions, not a hard page reload', async ({
    page,
  }) => {
    await page.goto(`/group/${ids.groupId}/tasks?child=${ids.childId}`)
    await expect(page.locator('[data-testid="task-item"]').first()).toBeVisible()

    // Mark the live JS context. A native full-page reload destroys `window`
    // (sentinel gone) and never fires `astro:after-swap`. An Astro client-router
    // view-transition navigation keeps `window` alive and fires the event.
    await page.evaluate(() => {
      ;(window as unknown as { __alive: boolean }).__alive = true
      ;(window as unknown as { __swaps: number }).__swaps = 0
      document.addEventListener('astro:after-swap', () => {
        ;(window as unknown as { __swaps: number }).__swaps++
      })
    })

    const before = await page.locator('[data-testid="task-item"]').count()

    await page.locator('[data-testid="complete-button"]').first().click()
    await page.locator('[data-testid="confirm-ok"]').click()

    // Wait for the router swap. On the buggy (form.submit()) path this never
    // fires because the page hard-reloads instead.
    await page.waitForFunction(
      () => (window as unknown as { __swaps: number }).__swaps > 0,
      { timeout: 8000 },
    )

    expect(await page.evaluate(() => (window as unknown as { __alive?: boolean }).__alive)).toBe(true)
    await expect(page.locator('[data-testid="task-item"]')).toHaveCount(before - 1)
  })

  test('the points badge participates in a view transition', async ({ page }) => {
    await page.goto(`/group/${ids.groupId}/tasks?child=${ids.childId}`)
    const badge = page.locator('[data-testid="points-balance"]').first()
    await expect(badge).toBeVisible()
    const vtName = await badge.evaluate((el) => getComputedStyle(el).viewTransitionName)
    expect(vtName).not.toBe('none')
  })

  test('the celebration bounce respects prefers-reduced-motion', async ({ page }) => {
    const emoji = page.locator('[data-testid="celebration-emoji"]').first()
    const animationName = () => emoji.evaluate((el) => getComputedStyle(el).animationName)

    // With motion allowed, the emoji bounces (motion-safe:animate-bounce).
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto(`/group/${ids.groupId}/tasks?child=${ids.celebChildId}`)
    await expect(emoji).toBeVisible()
    expect(await animationName()).toBe('bounce')

    // With reduced motion requested, the bounce is suppressed.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.reload()
    await expect(emoji).toBeVisible()
    expect(await animationName()).toBe('none')
  })
})
