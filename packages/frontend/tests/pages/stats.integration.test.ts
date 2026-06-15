import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { createPb, type PbShim } from '../helpers'
import { describe, expect, it, beforeEach } from 'vitest'
import StatsPage from '../../src/pages/stats.astro'



describe('Stats Page', () => {
  let pb: PbShim
  let container: AstroContainer

  beforeEach(async () => {
    // Setup PocketBase client
    pb = createPb()
    await pb.collection('_superusers').authWithPassword('admin@test.local', 'testtest123')

    // Create Astro container
    container = await AstroContainer.create()
  })

  it('should render the stats page showing zero tasks when empty', async () => {
    const result = await container.renderToString(StatsPage, {
      locals: { db: pb.db },
    })

    expect(result).toContain('data-testid="stats-page"')
    expect(result).toContain('data-testid="total-tasks"')
    expect(result).toContain('Total tasks: 0')
  })

  it('should show correct task count after creating tasks', async () => {
    // Create test data
    const group = await pb.collection('groups').create({ name: 'Test Group' })
    const child = await pb.collection('children').create({
      name: 'Test Child',
      group: group.id,
      color: '#FF6B6B',
    })

    // Create 3 tasks
    for (let i = 0; i < 3; i++) {
      await pb.collection('tasks').create({
        title: `Task ${i + 1}`,
        child: child.id,
        priority: i,
        completed: false,
        timeOfDay: 'afternoon',
      })
    }

    const result = await container.renderToString(StatsPage, {
      locals: { db: pb.db },
    })

    expect(result).toContain('Total tasks: 3')
  })
})
