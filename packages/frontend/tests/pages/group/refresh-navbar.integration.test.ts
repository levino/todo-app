import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach } from 'vitest'
import PocketBase from 'pocketbase'
import TasksPage from '../../../src/pages/group/[groupId]/tasks/index.astro'
import { resetPocketBase } from '@/lib/pocketbase'
import { authUser } from '../../helpers'

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

describe('Refresh button in navbar', () => {
  let adminPb: PocketBase
  let userPb: PocketBase
  let container: AstroContainer
  let groupId: string
  let childId: string
  let userId: string

  beforeEach(async () => {
    resetPocketBase()

    adminPb = new PocketBase(POCKETBASE_URL)
    await adminPb.collection('_superusers').authWithPassword('admin@test.local', 'testtest123')

    const email = `test-${Date.now()}@example.com`
    const user = await adminPb.collection('users').create({
      email,
      password: 'testtest123',
      passwordConfirm: 'testtest123',
    })
    userId = user.id

    userPb = new PocketBase(POCKETBASE_URL)
    await userPb.collection('users').authWithPassword(email, 'testtest123')

    const group = await adminPb.collection('groups').create({ name: 'Test Family' })
    groupId = group.id

    await adminPb.collection('user_groups').create({
      user: userId,
      group: groupId,
    })

    const child = await adminPb.collection('children').create({
      name: 'Max',
      color: '#FF6B6B',
      group: groupId,
    })
    childId = child.id

    container = await AstroContainer.create()
  })

  it('should render refresh button inside the navbar, not in page content, in overview mode', async () => {
    const html = await container.renderToString(TasksPage, {
      params: { groupId },
      locals: { pb: userPb, user: authUser(userPb) },
    })

    // The refresh button must exist
    expect(html).toContain('data-testid="refresh-button"')

    // The navbar starts with class="navbar" and the page content starts with class="min-h-screen"
    // The refresh button should appear BEFORE the min-h-screen content area (i.e., inside the navbar)
    const navbarPos = html.indexOf('class="navbar')
    const refreshPos = html.indexOf('data-testid="refresh-button"')
    const mainContentPos = html.indexOf('class="min-h-screen')

    expect(navbarPos).toBeGreaterThanOrEqual(0)
    expect(refreshPos).toBeGreaterThanOrEqual(0)
    expect(mainContentPos).toBeGreaterThanOrEqual(0)

    // Refresh button should be between navbar start and main content start
    expect(refreshPos).toBeGreaterThan(navbarPos)
    expect(refreshPos).toBeLessThan(mainContentPos)
  })

  it('should render refresh button inside the navbar in child view', async () => {
    const html = await container.renderToString(TasksPage, {
      params: { groupId },
      locals: { pb: userPb, user: authUser(userPb) },
      request: new Request(`http://localhost/group/${groupId}/tasks?child=${childId}`),
    })

    expect(html).toContain('data-testid="refresh-button"')

    const navbarPos = html.indexOf('class="navbar')
    const refreshPos = html.indexOf('data-testid="refresh-button"')
    const mainContentPos = html.indexOf('class="min-h-screen')

    expect(navbarPos).toBeGreaterThanOrEqual(0)
    expect(refreshPos).toBeGreaterThanOrEqual(0)
    expect(mainContentPos).toBeGreaterThanOrEqual(0)

    expect(refreshPos).toBeGreaterThan(navbarPos)
    expect(refreshPos).toBeLessThan(mainContentPos)
  })

  it('should only have one refresh button on the page', async () => {
    const html = await container.renderToString(TasksPage, {
      params: { groupId },
      locals: { pb: userPb, user: authUser(userPb) },
    })

    const matches = html.match(/data-testid="refresh-button"/g)
    expect(matches).toHaveLength(1)
  })
})
