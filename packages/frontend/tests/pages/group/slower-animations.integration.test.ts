import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { beforeEach, describe, expect, it } from 'vitest'
import TasksPage from '../../../src/pages/group/[groupId]/tasks/index.astro'
import { authUser, createPb, type PbShim } from '../../helpers'

// The task check-off slide (a view-transition morph into the "Heute erledigt"
// list) was too fast/jarring. We slow all view transitions down via a global
// stylesheet rule so the morph is easy to follow.
describe('Slower view-transition animations', () => {
  let pb: PbShim
  let adminPb: PbShim
  let container: AstroContainer
  let groupId: string
  let childId: string

  beforeEach(async () => {
    adminPb = createPb()
    await adminPb.collection('_superusers').authWithPassword('admin@test.local', 'testtest123')

    pb = createPb()
    const user = await adminPb.collection('users').create({
      email: `slow-anim-${Date.now()}@test.local`,
      password: 'testtest123',
      passwordConfirm: 'testtest123',
      name: 'Test User',
    })
    await pb.collection('users').authWithPassword(user.email, 'testtest123')

    const group = await adminPb.collection('groups').create({
      name: 'Anim Family',
      morningEnd: '00:00',
      eveningStart: '23:59',
    })
    groupId = group.id

    await adminPb.collection('user_groups').create({ user: user.id, group: groupId })

    const child = await adminPb.collection('children').create({
      name: 'Max',
      color: '#FF6B6B',
      group: groupId,
    })
    childId = child.id

    container = await AstroContainer.create()
  })

  it('emits a global rule slowing view-transition groups', async () => {
    const html = await container.renderToString(TasksPage, {
      params: { groupId },
      locals: { db: pb.db, user: authUser(pb) },
    })

    expect(html).toContain('view-transition-group')
    expect(html).toContain('animation-duration: 0.6s')
  })
})
