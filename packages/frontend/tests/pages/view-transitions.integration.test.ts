import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach } from 'vitest'
import PocketBase from 'pocketbase'
import Layout from '../../src/layouts/Layout.astro'
import TasksPage from '../../src/pages/group/[groupId]/tasks/index.astro'
import { resetPocketBase } from '@/lib/pocketbase'

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

describe('View Transitions', () => {
  let container: AstroContainer

  beforeEach(async () => {
    container = await AstroContainer.create()
  })

  it('should include Astro view transitions meta tag in the rendered HTML', async () => {
    const result = await container.renderToString(Layout, {
      props: { title: 'Test Page' },
    })

    expect(result).toContain('name="astro-view-transitions-enabled"')
  })

  describe('Tasks page transitions', () => {
    let adminPb: PocketBase
    let userPb: PocketBase
    let groupId: string
    let child1Id: string

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

      userPb = new PocketBase(POCKETBASE_URL)
      await userPb.collection('users').authWithPassword(email, 'testtest123')

      const group = await adminPb.collection('groups').create({
        name: 'Test Family',
        morningEnd: '00:00',
        eveningStart: '23:59',
      })
      groupId = group.id

      await adminPb.collection('user_groups').create({
        user: user.id,
        group: groupId,
      })

      const child1 = await adminPb.collection('children').create({
        name: 'Max',
        color: '#FF6B6B',
        group: groupId,
      })
      child1Id = child1.id
    })

    it('should use fade transition, not slide', async () => {
      const html = await container.renderToString(TasksPage, {
        params: { groupId },
        locals: { pb: userPb, user: userPb.authStore.record },
      })

      expect(html).not.toContain('transition:animate="slide"')
      expect(html).toContain('data-astro-transition-scope')
    })

    it('should have transition:name on child columns for morph effect', async () => {
      const html = await container.renderToString(TasksPage, {
        params: { groupId },
        locals: { pb: userPb, user: userPb.authStore.record },
      })

      expect(html).toMatch(/data-testid="child-column"[^>]*data-astro-transition-scope/)
    })
  })
})
