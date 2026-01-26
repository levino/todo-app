import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach } from 'vitest'
import StatsPage from './stats.astro'
import { adminPb, createRandomUser } from '../../tests/pocketbase'

describe('Stats Page', () => {
  let container: AstroContainer
  let userPb: Awaited<ReturnType<typeof createRandomUser>>
  let userId: string
  let groupId: string
  let childId: string

  beforeEach(async () => {
    container = await AstroContainer.create()

    // Create fresh user with their own group - they'll only see their tasks
    userPb = await createRandomUser()
    userId = userPb.authStore.record!.id

    const group = await adminPb.collection('groups').create({ name: 'Test Group' })
    groupId = group.id

    await adminPb.collection('user_groups').create({
      user: userId,
      group: groupId,
    })

    const child = await adminPb.collection('children').create({
      name: 'Test Child',
      group: groupId,
      color: '#FF6B6B',
    })
    childId = child.id
  })

  it('should render the stats page showing zero tasks when empty', async () => {
    const result = await container.renderToString(StatsPage, {
      locals: { pb: userPb },
    })

    expect(result).toContain('data-testid="stats-page"')
    expect(result).toContain('data-testid="total-tasks"')
    expect(result).toContain('Total tasks: 0')
  })

  it('should show correct task count after creating tasks', async () => {
    for (let i = 0; i < 3; i++) {
      await userPb.collection('tasks').create({
        title: `Task ${i + 1}`,
        child: childId,
        priority: i,
        completed: false,
      })
    }

    const result = await container.renderToString(StatsPage, {
      locals: { pb: userPb },
    })

    expect(result).toContain('Total tasks: 3')
  })
})
