import { describe, expect, it, beforeAll, beforeEach } from 'vitest'
import type { Express } from 'express'
import request from 'supertest'
import { createApp, initOAuth } from '@family-todo/mcp/src/server'
import { signAccessToken } from '@family-todo/mcp/src/oauth/jwt'
import { createRandomUser } from '../../tests/pocketbase'

const POCKETBASE_URL = 'http://127.0.0.1:8090'
const OAUTH_ISSUER = 'http://localhost:3001'

/**
 * Task List Integration Tests via MCP
 *
 * Tests run as regular users through the MCP interface using OAuth JWT.
 */
describe('Task List', () => {
  let mcpApp: Express
  let userPb: Awaited<ReturnType<typeof createRandomUser>>
  let jwt: string
  let groupId: string
  let childId: string

  // Helper to call MCP tools with Bearer token
  async function callTool(name: string, args: Record<string, unknown>) {
    const response = await request(mcpApp)
      .post('/mcp')
      .set('Authorization', `Bearer ${jwt}`)
      .send({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name, arguments: args },
        id: 1,
      })

    expect(response.status).toBe(200)
    if (response.body.error) {
      throw new Error(response.body.error.message)
    }
    return response.body.result
  }

  // Helper to parse ID from MCP response text
  function parseId(text: string): string {
    const match = text.match(/ID: ([a-z0-9]+)/)
    if (!match) throw new Error(`Could not parse ID from: ${text}`)
    return match[1]
  }

  beforeAll(async () => {
    await initOAuth()
    mcpApp = createApp({
      pocketbaseUrl: POCKETBASE_URL,
      adminEmail: 'admin@test.local',
      adminPassword: 'testtest123',
      oauthIssuer: OAUTH_ISSUER,
    })
  })

  beforeEach(async () => {
    userPb = await createRandomUser()
    const userId = userPb.authStore.record!.id

    // Create JWT for this user (simulating OAuth flow)
    jwt = await signAccessToken(
      { sub: userId, client_id: 'test-client' },
      OAUTH_ISSUER,
      'family-todo-mcp',
      3600
    )

    // Create group via MCP
    const groupResult = await callTool('create_group', { name: 'Test Family' })
    groupId = parseId(groupResult.content[0].text)

    // Create child via MCP
    const childResult = await callTool('create_child', {
      groupId,
      name: 'Max',
      color: '#4DABF7',
    })
    childId = parseId(childResult.content[0].text)
  })

  it('should create and list tasks via MCP', async () => {
    // Create tasks via MCP
    await callTool('create_task', {
      childId,
      title: 'Zähne putzen',
      priority: 1,
    })
    await callTool('create_task', {
      childId,
      title: 'Zimmer aufräumen',
      priority: 2,
    })

    // List tasks via MCP
    const result = await callTool('list_tasks', { childId })
    const tasks = JSON.parse(result.content[0].text)

    expect(tasks).toHaveLength(2)
    expect(tasks.map((t: { title: string }) => t.title)).toContain('Zähne putzen')
    expect(tasks.map((t: { title: string }) => t.title)).toContain('Zimmer aufräumen')
  })

  it('should list children in group via MCP', async () => {
    // Create second child
    await callTool('create_child', {
      groupId,
      name: 'Lisa',
      color: '#F783AC',
    })

    // List children via MCP
    const result = await callTool('list_children', { groupId })
    const children = JSON.parse(result.content[0].text)

    expect(children).toHaveLength(2)
    expect(children.map((c: { name: string }) => c.name).sort()).toEqual(['Lisa', 'Max'])
  })

  it('should not list completed tasks by default', async () => {
    // Create tasks
    const taskResult = await callTool('create_task', {
      childId,
      title: 'Task to complete',
      priority: 1,
    })
    const taskId = parseId(taskResult.content[0].text)

    await callTool('create_task', {
      childId,
      title: 'Task to keep',
      priority: 2,
    })

    // Complete one task directly via PocketBase (MCP doesn't have complete_task)
    await userPb.collection('tasks').update(taskId, {
      completed: true,
      completedAt: new Date().toISOString(),
    })

    // List should only show incomplete
    const result = await callTool('list_tasks', { childId })
    const tasks = JSON.parse(result.content[0].text)

    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toBe('Task to keep')
  })

  it('should list completed tasks when requested', async () => {
    // Create and complete a task
    const taskResult = await callTool('create_task', {
      childId,
      title: 'Completed task',
      priority: 1,
    })
    const taskId = parseId(taskResult.content[0].text)

    await userPb.collection('tasks').update(taskId, {
      completed: true,
      completedAt: new Date().toISOString(),
    })

    // List with includeCompleted
    const result = await callTool('list_tasks', { childId, includeCompleted: true })
    const tasks = JSON.parse(result.content[0].text)

    expect(tasks).toHaveLength(1)
    expect(tasks[0].completed).toBe(true)
  })

  it('should delete a task via MCP', async () => {
    // Create task
    const taskResult = await callTool('create_task', {
      childId,
      title: 'Task to delete',
      priority: 1,
    })
    const taskId = parseId(taskResult.content[0].text)

    // Delete it
    await callTool('delete_task', { taskId })

    // List should be empty
    const result = await callTool('list_tasks', { childId })
    const tasks = JSON.parse(result.content[0].text)

    expect(tasks).toHaveLength(0)
  })
})
