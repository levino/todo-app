import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import type { Express } from 'express'
import request from 'supertest'

import { adminPb, createRandomUser, POCKETBASE_URL } from '../../tests/pocketbase'
import { createTestGroup, createTestChild } from '../../tests/helpers'

// MCP Server - use factory function
import { createApp, initOAuth } from '@family-todo/mcp/src/server'
import { signAccessToken } from '@family-todo/mcp/src/oauth/jwt'

// Astro Page
import ChildTasksPage from '../pages/group/[groupId]/tasks/[childId].astro'

const OAUTH_ISSUER = 'http://localhost:3001'

/**
 * Full Integration Test: User → Group → Child → Task → Astro Page
 *
 * Tests the complete flow:
 * 1. Fresh PocketBase instance (binary started with migrations)
 * 2. Create user, group, child via PocketBase
 * 3. Create task via MCP Server (like Claude would)
 * 4. Verify task is visible in Astro page
 *
 * TODO: In separates Integration-Test-Package verschieben (packages/integration-tests o.ä.)
 * Dieser Test gehört nicht ins Frontend - er testet die Brücke zwischen MCP und Frontend.
 */
describe('Full Flow: MCP Task Creation → Astro Display', () => {
  let mcpApp: Express
  let userPb: Awaited<ReturnType<typeof createRandomUser>>
  let userId: string
  let groupId: string
  let childId: string
  let container: AstroContainer
  let jwt: string

  beforeAll(async () => {
    await initOAuth()
  })

  beforeEach(async () => {
    // Create MCP app with PocketBase URL
    mcpApp = createApp({
      pocketbaseUrl: POCKETBASE_URL,
      adminEmail: 'admin@test.local',
      adminPassword: 'testtest123',
      oauthIssuer: OAUTH_ISSUER,
    })

    userPb = await createRandomUser()
    userId = userPb.authStore.record!.id

    groupId = await createTestGroup(adminPb, userId)
    childId = await createTestChild(adminPb, groupId)
    container = await AstroContainer.create()

    // Create JWT for MCP authentication
    jwt = await signAccessToken(
      { sub: userId, client_id: 'test-client' },
      OAUTH_ISSUER,
      'family-todo-mcp',
      3600
    )
  })

  it('should show task created via MCP in Astro page', async () => {
    // Create task via MCP Server (using JWT Bearer token)
    const mcpResponse = await request(mcpApp)
      .post('/mcp')
      .set('Authorization', `Bearer ${jwt}`)
      .send({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'create_task',
          arguments: {
            childId,
            title: 'Zimmer aufräumen',
            priority: 1,
          },
        },
        id: 1,
      })

    expect(mcpResponse.status).toBe(200)
    expect(mcpResponse.body.error).toBeUndefined()
    expect(mcpResponse.body.result?.content?.[0]?.text).toContain('Created one-time task')

    // Render Astro page
    const html = await container.renderToString(ChildTasksPage, {
      params: { groupId, childId },
      locals: { pb: userPb, user: userPb.authStore.record },
    })

    expect(html).toContain('Zimmer aufräumen')
    expect(html).toContain('data-testid="task-item"')
  })

  it('should show celebration when no tasks exist', async () => {
    const html = await container.renderToString(ChildTasksPage, {
      params: { groupId, childId },
      locals: { pb: userPb, user: userPb.authStore.record },
    })

    expect(html).toContain('data-testid="celebration"')
    expect(html).toContain('Super gemacht!')
  })

  it('should create schedule via MCP', async () => {
    const response = await request(mcpApp)
      .post('/mcp')
      .set('Authorization', `Bearer ${jwt}`)
      .send({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'create_schedule',
          arguments: {
            childId,
            title: 'Zähne putzen',
            timePeriod: 'morning',
            daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
            priority: 1,
          },
        },
        id: 2,
      })

    expect(response.status).toBe(200)
    expect(response.body.error).toBeUndefined()

    const schedules = await userPb.collection('schedules').getFullList({
      filter: `child = "${childId}"`,
    })

    expect(schedules).toHaveLength(1)
    expect(schedules[0].title).toBe('Zähne putzen')
    expect(schedules[0].timePeriod).toBe('morning')
  })
})
