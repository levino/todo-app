import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach } from 'vitest'
import TasksPage from '../../../src/pages/group/[groupId]/tasks/index.astro'
import { authUser, createPb, type PbShim } from '../../helpers'



describe('Refresh Button', () => {
  let adminPb: PbShim
  let userPb: PbShim
  let container: AstroContainer
  let groupId: string
  let childId: string
  let userId: string

  beforeEach(async () => {

    adminPb = createPb()
    await adminPb.collection('_superusers').authWithPassword('admin@test.local', 'testtest123')

    const email = `test-${Date.now()}@example.com`
    const user = await adminPb.collection('users').create({
      email,
      password: 'testtest123',
      passwordConfirm: 'testtest123',
    })
    userId = user.id

    userPb = createPb()
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

  it('should render refresh button in overview mode', async () => {
    const html = await container.renderToString(TasksPage, {
      params: { groupId },
      locals: { db: userPb.db, user: authUser(userPb) },
    })

    expect(html).toContain('data-testid="refresh-button"')
  })

  it('should render refresh button in child view', async () => {
    const html = await container.renderToString(TasksPage, {
      params: { groupId },
      locals: { db: userPb.db, user: authUser(userPb) },
      request: new Request(`http://localhost/group/${groupId}/tasks?child=${childId}`),
    })

    expect(html).toContain('data-testid="refresh-button"')
  })
})
