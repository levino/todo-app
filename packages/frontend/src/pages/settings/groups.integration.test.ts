/**
 * Settings Groups Page Integration Tests
 *
 * Tests that users can access the groups settings page after signup.
 */

import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach } from 'vitest'
import PocketBase from 'pocketbase'
import GroupsPage from './groups.astro'
import { createRandomUser, POCKETBASE_URL } from '../../../tests/pocketbase'

describe('Settings Groups Page', () => {
  let userPb: Awaited<ReturnType<typeof createRandomUser>>
  let container: AstroContainer

  beforeEach(async () => {
    userPb = await createRandomUser()

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
