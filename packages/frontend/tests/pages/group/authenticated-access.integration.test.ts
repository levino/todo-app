import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach } from 'vitest'
import TasksIndexPage from '../../../src/pages/group/[groupId]/tasks/index.astro'
import { authUser, createPb, type PbShim } from '../../helpers'



/**
 * Regression test: Authenticated users should be able to access group pages
 * when they have groupId in the URL params, not just in locals
 */
describe('Authenticated Group Page Access', () => {
  let adminPb: PbShim
  let userPb: PbShim
  let container: AstroContainer
  let groupId: string
  let userId: string

  beforeEach(async () => {

    adminPb = createPb()
    await adminPb.collection('_superusers').authWithPassword('admin@test.local', 'testtest123')

    // Create test user
    const email = `test-${Date.now()}@example.com`
    const user = await adminPb.collection('users').create({
      email,
      password: 'testtest123',
      passwordConfirm: 'testtest123',
    })
    userId = user.id

    // Create user connection
    userPb = createPb()
    await userPb.collection('users').authWithPassword(email, 'testtest123')

    const group = await adminPb.collection('groups').create({ name: 'Test Family' })
    groupId = group.id

    // Add user to group
    await adminPb.collection('user_groups').create({
      user: userId,
      group: groupId,
    })

    container = await AstroContainer.create()
  })

  it('should access tasks page with groupId from URL params', async () => {
    const response = await container.renderToResponse(TasksIndexPage, {
      params: { groupId },
      locals: { db: userPb.db, user: authUser(userPb) },
    })

    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('Test Family')
  })
})
