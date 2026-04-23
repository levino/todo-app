import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach } from 'vitest'
import PocketBase from 'pocketbase'
import request from 'supertest'
import { app } from '@family-todo/mcp/src/server.js'
import TasksPage from '../../../src/pages/group/[groupId]/tasks/index.astro'
import { resetPocketBase } from '@/lib/pocketbase'
import { getCurrentPhase } from '@/lib/tasks'
import { authUser } from '../../helpers'

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

const mcpCall = (token: string, toolName: string, args: Record<string, unknown>) =>
  request(app)
    .post('/mcp')
    .query({ token })
    .send({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: toolName, arguments: args },
      id: 1,
    })
    .then((res) => res.body)

const extractId = (text: string) =>
  text.match(/ID: ([a-z0-9]+)/)?.[1] ?? ''

describe('MCP → Frontend Integration', () => {
  let authToken: string
  let userPb: PocketBase
  let adminPb: PocketBase
  let container: AstroContainer

  beforeEach(async () => {
    resetPocketBase()

    adminPb = new PocketBase(POCKETBASE_URL)
    await adminPb.collection('_superusers').authWithPassword('admin@test.local', 'testtest123')

    const email = `test-${Date.now()}@example.com`
    await adminPb.collection('users').create({
      email,
      password: 'testtest123',
      passwordConfirm: 'testtest123',
    })

    userPb = new PocketBase(POCKETBASE_URL)
    await userPb.collection('users').authWithPassword(email, 'testtest123')
    authToken = userPb.authStore.token

    container = await AstroContainer.create()
  })

  const renderChildPage = (groupId: string, childId: string) =>
    container.renderToString(TasksPage, {
      params: { groupId },
      locals: { pb: userPb, user: authUser(userPb) },
      request: new Request(`http://localhost/group/${groupId}/tasks?child=${childId}`),
    })

  it('should display tasks created via MCP in the frontend', async () => {
    const groupResult = await mcpCall(authToken, 'create_group', { name: 'MCP Test Family' })
    const groupId = extractId(groupResult.result.content[0].text)

    const childResult = await mcpCall(authToken, 'create_child', {
      groupId,
      name: 'Emma',
      color: '#FF6B6B',
    })
    const childId = extractId(childResult.result.content[0].text)

    const currentPhase = getCurrentPhase('09:00', '18:00', 'Europe/Berlin')

    await mcpCall(authToken, 'create_task', {
      childId,
      title: 'Zähne putzen',
      priority: 1,
      timeOfDay: currentPhase,
    })
    await mcpCall(authToken, 'create_task', {
      childId,
      title: 'Tasche packen',
      priority: 2,
      timeOfDay: currentPhase,
    })

    const html = await renderChildPage(groupId, childId)

    expect(html).toContain('Emma')
    expect(html).toContain('#FF6B6B')
    expect(html).toContain('Zähne putzen')
    expect(html).toContain('Tasche packen')
    expect(html).toContain('data-testid="task-item"')
    expect(html).toContain('data-testid="phase-indicator"')
  })

  it('should only show tasks for current phase when created via MCP', async () => {
    const groupResult = await mcpCall(authToken, 'create_group', { name: 'Phase Test Family' })
    const groupId = extractId(groupResult.result.content[0].text)

    const childResult = await mcpCall(authToken, 'create_child', {
      groupId,
      name: 'Liam',
      color: '#4DABF7',
    })
    const childId = extractId(childResult.result.content[0].text)

    await mcpCall(authToken, 'create_task', {
      childId,
      title: 'Morgenaufgabe',
      priority: 1,
      timeOfDay: 'morning',
    })
    await mcpCall(authToken, 'create_task', {
      childId,
      title: 'Nachmittagsaufgabe',
      priority: 1,
      timeOfDay: 'afternoon',
    })
    await mcpCall(authToken, 'create_task', {
      childId,
      title: 'Abendaufgabe',
      priority: 1,
      timeOfDay: 'evening',
    })

    const html = await renderChildPage(groupId, childId)

    const phase = getCurrentPhase('09:00', '18:00', 'Europe/Berlin')
    if (phase === 'morning') {
      expect(html).toContain('Morgenaufgabe')
      expect(html).not.toContain('Nachmittagsaufgabe')
      expect(html).not.toContain('Abendaufgabe')
    } else if (phase === 'afternoon') {
      expect(html).not.toContain('Morgenaufgabe')
      expect(html).toContain('Nachmittagsaufgabe')
      expect(html).not.toContain('Abendaufgabe')
    } else {
      expect(html).not.toContain('Morgenaufgabe')
      expect(html).not.toContain('Nachmittagsaufgabe')
      expect(html).toContain('Abendaufgabe')
    }
  })

  it('should respect custom phase times configured via MCP', async () => {
    const groupResult = await mcpCall(authToken, 'create_group', { name: 'Custom Phase Family' })
    const groupId = extractId(groupResult.result.content[0].text)

    await mcpCall(authToken, 'configure_phase_times', {
      groupId,
      morningEnd: '23:59',
      eveningStart: '23:59',
    })

    const childResult = await mcpCall(authToken, 'create_child', {
      groupId,
      name: 'Mia',
      color: '#B197FC',
    })
    const childId = extractId(childResult.result.content[0].text)

    await mcpCall(authToken, 'create_task', {
      childId,
      title: 'Immer Morgen',
      priority: 1,
      timeOfDay: 'morning',
    })
    await mcpCall(authToken, 'create_task', {
      childId,
      title: 'Nie sichtbar',
      priority: 1,
      timeOfDay: 'afternoon',
    })

    const html = await renderChildPage(groupId, childId)

    expect(html).toContain('Immer Morgen')
    expect(html).not.toContain('Nie sichtbar')
    expect(html).toContain('Morgens')
  })

  it('should show celebration when all tasks are in other phases', async () => {
    const groupResult = await mcpCall(authToken, 'create_group', { name: 'Celebration Family' })
    const groupId = extractId(groupResult.result.content[0].text)

    const childResult = await mcpCall(authToken, 'create_child', {
      groupId,
      name: 'Noah',
      color: '#69DB7C',
    })
    const childId = extractId(childResult.result.content[0].text)

    const curPhase = getCurrentPhase('09:00', '18:00', 'Europe/Berlin')
    const otherPhase = curPhase === 'morning' ? 'evening' : 'morning'

    await mcpCall(authToken, 'create_task', {
      childId,
      title: 'Andere Phase',
      priority: 1,
      timeOfDay: otherPhase,
    })

    const html = await renderChildPage(groupId, childId)

    expect(html).toContain('data-testid="celebration"')
    expect(html).toContain('Super gemacht!')
    expect(html).not.toContain('Andere Phase')
  })

  it('should show overdue recurring task created via MCP', async () => {
    const groupResult = await mcpCall(authToken, 'create_group', { name: 'Overdue Family' })
    const groupId = extractId(groupResult.result.content[0].text)

    const childResult = await mcpCall(authToken, 'create_child', {
      groupId,
      name: 'Sophie',
      color: '#FFA94D',
    })
    const childId = extractId(childResult.result.content[0].text)

    const currentPhase = getCurrentPhase('09:00', '18:00', 'Europe/Berlin')

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    await mcpCall(authToken, 'create_task', {
      childId,
      title: 'Überfällige Aufgabe',
      priority: 1,
      timeOfDay: currentPhase,
      recurrenceType: 'interval',
      recurrenceInterval: 1,
      dueDate: yesterday.toISOString(),
    })

    const html = await renderChildPage(groupId, childId)

    expect(html).toContain('Überfällige Aufgabe')
    expect(html).toContain('data-overdue="true"')
    expect(html).toContain('Überfällig')
  })
})
