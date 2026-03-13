import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach } from 'vitest'
import PocketBase from 'pocketbase'
import TasksIndexPage from '../../../src/pages/group/[groupId]/tasks/index.astro'
import { resetPocketBase } from '@/lib/pocketbase'

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

describe('Offline Support', () => {
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

  describe('Tasks Index Page (overview)', () => {
    it('should include OfflineIndicator script on tasks index page', async () => {
      const html = await container.renderToString(TasksIndexPage, {
        params: { groupId },
        locals: { pb: userPb, user: userPb.authStore.record },
      })

      expect(html).toContain('OfflineIndicator.astro')
    })

    it('should include offline banner markup on tasks index page', async () => {
      const html = await container.renderToString(TasksIndexPage, {
        params: { groupId },
        locals: { pb: userPb, user: userPb.authStore.record },
      })

      expect(html).toContain('data-testid="offline-banner"')
      expect(html).toContain('Offline')
    })
  })

  describe('Tasks Child Page (with child param)', () => {
    it('should include OfflineIndicator script on child tasks page', async () => {
      const request = new Request(`http://localhost/group/${groupId}/tasks?child=${childId}`)
      const html = await container.renderToString(TasksIndexPage, {
        params: { groupId },
        locals: { pb: userPb, user: userPb.authStore.record },
        request,
      })

      expect(html).toContain('OfflineIndicator.astro')
    })

    it('should include offline banner markup on child tasks page', async () => {
      const request = new Request(`http://localhost/group/${groupId}/tasks?child=${childId}`)
      const html = await container.renderToString(TasksIndexPage, {
        params: { groupId },
        locals: { pb: userPb, user: userPb.authStore.record },
        request,
      })

      expect(html).toContain('data-testid="offline-banner"')
      expect(html).toContain('Offline')
    })

    it('should have offline banner hidden by default', async () => {
      const request = new Request(`http://localhost/group/${groupId}/tasks?child=${childId}`)
      const html = await container.renderToString(TasksIndexPage, {
        params: { groupId },
        locals: { pb: userPb, user: userPb.authStore.record },
        request,
      })

      expect(html).toMatch(/data-testid="offline-banner"[^>]*class="[^"]*hidden[^"]*"/)
    })

    it('should show offline message text in banner', async () => {
      const request = new Request(`http://localhost/group/${groupId}/tasks?child=${childId}`)
      const html = await container.renderToString(TasksIndexPage, {
        params: { groupId },
        locals: { pb: userPb, user: userPb.authStore.record },
        request,
      })

      expect(html).toContain('Nur-Lese-Modus')
    })
  })
})
