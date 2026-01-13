import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach } from 'vitest'
import PocketBase from 'pocketbase'
import StatsPage from './stats.astro'

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

describe('Stats Page', () => {
  let pb: PocketBase
  let container: AstroContainer

  beforeEach(async () => {
    // Setup PocketBase client
    pb = new PocketBase(POCKETBASE_URL)
    await pb.collection('_superusers').authWithPassword('admin@test.local', 'testtest123')

    // Create Astro container
    container = await AstroContainer.create()
  })

  it('should render the stats page showing zero tasks when empty', async () => {
    const result = await container.renderToString(StatsPage)

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
      avatar: '👶',
    })

    // Create 3 tasks
    for (let i = 0; i < 3; i++) {
      await pb.collection('kiosk_tasks').create({
        title: `Task ${i + 1}`,
        child: child.id,
        priority: i,
        completed: false,
      })
    }

    const result = await container.renderToString(StatsPage)

    expect(result).toContain('Total tasks: 3')
  })
})
