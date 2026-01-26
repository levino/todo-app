import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach } from 'vitest'
import TasksIndexPage from './[groupId]/tasks/index.astro'
import { adminPb, createRandomUser } from '../../../tests/pocketbase'

/**
 * Regression test: Authenticated users should be able to access group pages
 * when they have groupId in the URL params, not just in locals
 */
describe('Authenticated Group Page Access', () => {
  let userPb: Awaited<ReturnType<typeof createRandomUser>>
  let container: AstroContainer
  let groupId: string
  let userId: string

  beforeEach(async () => {
    userPb = await createRandomUser()
    userId = userPb.authStore.record!.id

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
      locals: { pb: userPb, user: userPb.authStore.record },
    })

    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('Test Family')
  })
})
