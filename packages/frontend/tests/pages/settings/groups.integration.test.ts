/**
 * Settings Groups Page Integration Tests
 *
 * Tests that users can access the groups settings page after signup.
 */

import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach } from 'vitest'
import GroupsPage from '../../../src/pages/settings/groups.astro'
import { authUser, createPb, type PbShim } from '../../helpers'



describe('Settings Groups Page', () => {
  let adminPb: PbShim
  let userPb: PbShim
  let container: AstroContainer

  beforeEach(async () => {

    adminPb = createPb()
    await adminPb.collection('_superusers').authWithPassword('admin@test.local', 'testtest123')

    // Create test user
    const email = `settings-test-${Date.now()}@example.com`
    await adminPb.collection('users').create({
      email,
      password: 'testtest123',
      passwordConfirm: 'testtest123',
    })

    userPb = createPb()
    await userPb.collection('users').authWithPassword(email, 'testtest123')

    container = await AstroContainer.create()
  })

  describe('Authenticated User', () => {
    it('should render the groups settings page', async () => {
      const response = await container.renderToResponse(GroupsPage, {
        request: new Request('http://localhost:4321/settings/groups'),
        locals: { db: userPb.db, user: authUser(userPb) },
      })

      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('Gruppen')
    })

    it('should show create group option for user with no groups', async () => {
      const response = await container.renderToResponse(GroupsPage, {
        request: new Request('http://localhost:4321/settings/groups'),
        locals: { db: userPb.db, user: authUser(userPb) },
      })

      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('Gruppe erstellen')
    })
  })

  describe('Unauthenticated User', () => {
    it('should redirect to login', async () => {
      const unauthPb = createPb()

      const response = await container.renderToResponse(GroupsPage, {
        request: new Request('http://localhost:4321/settings/groups'),
        locals: { db: unauthPb.db, user: undefined },
      })

      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toContain('/login')
    })
  })
})
