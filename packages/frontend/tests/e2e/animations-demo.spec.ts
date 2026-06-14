import { test, expect, type Page } from '@playwright/test'
import PocketBase from 'pocketbase'

/**
 * Not a regression test — a deliberately slow walkthrough that records a
 * watchable video of the task-completion animation. Skipped unless DEMO=1 so it
 * never slows CI. Run with:
 *   DEMO=1 npx playwright test animations-demo --project=chromium
 */
const demo = process.env.DEMO ? test : test.skip

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://localhost:8090'
const EMAIL = `e2e-demo-${Date.now()}@example.com`
const PASSWORD = 'testtest123'

const seed = async () => {
  const pb = new PocketBase(POCKETBASE_URL)
  await pb.collection('_superusers').authWithPassword('admin@test.local', 'testtest123')

  const group = await pb.collection('groups').create({
    name: 'Demo Family',
    morningEnd: '00:00',
    eveningStart: '23:59',
    timezone: 'Europe/Berlin',
  })
  const user = await pb.collection('users').create({
    email: EMAIL,
    password: PASSWORD,
    passwordConfirm: PASSWORD,
  })
  await pb.collection('user_groups').create({ user: user.id, group: group.id })
  const child = await pb.collection('children').create({
    name: 'Mia',
    color: '#FF6B6B',
    group: group.id,
  })
  for (const title of [
    'Zähne putzen',
    'Bett machen',
    'Anziehen',
    'Frühstück',
    'Schulranzen packen',
    'Schuhe anziehen',
  ]) {
    await pb.collection('tasks').create({
      title,
      child: child.id,
      completed: false,
      timeOfDay: 'afternoon',
      points: 5,
    })
  }
  return { groupId: group.id, childId: child.id }
}

const login = async (page: Page) => {
  await page.request.post('http://localhost:4321/api/auth/login', {
    form: { email: EMAIL, password: PASSWORD },
    headers: { Origin: 'http://localhost:4321' },
  })
}

demo('walkthrough: checking off tasks animates smoothly', async ({ page }) => {
  const { groupId, childId } = await seed()
  await page.setViewportSize({ width: 1024, height: 768 })
  await login(page)

  await page.goto(`/group/${groupId}/tasks?child=${childId}`)
  await expect(page.locator('[data-testid="task-item"]').first()).toBeVisible()
  await page.waitForTimeout(1500) // show the full list

  // Check off several tasks, pausing so the slide-down / slide-up is visible.
  for (let i = 0; i < 4; i++) {
    await page.locator('[data-testid="complete-button"]').first().click()
    await expect(page.locator('[data-testid="confirm-ok"]')).toBeVisible()
    await page.waitForTimeout(600) // show the dialog
    await page.locator('[data-testid="confirm-ok"]').click()
    await page.waitForTimeout(1800) // show the transition + settled layout
  }

  await page.waitForTimeout(1200)
})
