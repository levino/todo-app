/**
 * Settings Groups Page Integration Tests
 *
 * Tests that users can access the groups settings page after signup.
 */

import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach } from 'vitest'
import PocketBase from 'pocketbase'
import GroupsPage from './groups.astro'
import { resetPocketBase } from '@/lib/pocketbase'

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

describe('Settings Groups Page', () => {
  let adminPb: PocketBase
  let userPb: PocketBase
  let container: AstroContainer

  beforeEach(async () => {
    resetPocketBase()

    adminPb = new PocketBase(POCKETBASE_URL)
    await adminPb.collection('_superusers').authWithPassword('admin@test.local', 'testtest123')

    // Create test user
    const email = `settings-test-${Date.now()}@example.com`
    await adminPb.collection('users').create({
      email,
      password: 'testtest123',
      passwordConfirm: 'testtest123',
    })

    userPb = new PocketBase(POCKETBASE_URL)
    await userPb.collection('users').authWithPassword(email, 'testtest123')

    container = await AstroContainer.create()
  })

  describe('Authenticated User', () => {
    it('should render the groups settings page', async () => {
      const response = await container.renderToResponse(GroupsPage, {
        request: new Request('http://localhost:4321/settings/groups'),
        locals: { pb: userPb, user: userPb.authStore.record },
      })

      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('Gruppen')
    })

    it('should show create group option for user with no groups', async () => {
      const response = await container.renderToResponse(GroupsPage, {
        request: new Request('http://localhost:4321/settings/groups'),
        locals: { pb: userPb, user: userPb.authStore.record },
      })

      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('Gruppe erstellen')
    })
  })

  describe('Unauthenticated User', () => {
    it('should redirect to login', async () => {
      const unauthPb = new PocketBase(POCKETBASE_URL)

      const response = await container.renderToResponse(GroupsPage, {
        request: new Request('http://localhost:4321/settings/groups'),
        locals: { pb: unauthPb, user: undefined },
      })

      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toContain('/login')
    })
  })
})
