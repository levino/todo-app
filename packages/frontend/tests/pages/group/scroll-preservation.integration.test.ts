import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import TasksPage from '../../../src/pages/group/[groupId]/tasks/index.astro'
import { authUser, createPb, type PbShim } from '../../helpers'
import { createMcpCall } from '../../mcp-stub'



let mcpCall: ReturnType<typeof createMcpCall>

const extractId = (text: string) => text.match(/ID: ([a-z0-9]+)/)?.[1] ?? ''

describe('Scroll Position Preservation', () => {
  let authToken: string
  let userPb: PbShim
  let adminPb: PbShim
  let container: AstroContainer
  let groupId: string
  let childId: string

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-03-10T07:00:00Z'))

    adminPb = createPb()
    await adminPb
      .collection('_superusers')
      .authWithPassword('admin@test.local', 'testtest123')

    const email = `test-${Date.now()}@example.com`
    await adminPb.collection('users').create({
      email,
      password: 'testtest123',
      passwordConfirm: 'testtest123',
    })

    userPb = createPb()
    await userPb.collection('users').authWithPassword(email, 'testtest123')
    authToken = userPb.authStore.token
    mcpCall = createMcpCall(userPb.db, userPb.authStore.record!.id)

    container = await AstroContainer.create()

    const groupResult = await mcpCall(authToken, 'create_group', { name: 'Test Family' })
    groupId = extractId(groupResult.result.content[0].text)

    const childResult = await mcpCall(authToken, 'create_child', {
      groupId,
      name: 'TestKind',
      color: '#FF6B6B',
    })
    childId = extractId(childResult.result.content[0].text)

    await mcpCall(authToken, 'create_task', {
      childId,
      title: 'A Task',
      timeOfDay: 'morning',
      priority: 1,
      dueDate: '2026-03-10',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const renderPage = () =>
    container.renderToString(TasksPage, {
      params: { groupId },
      locals: { db: userPb.db, user: authUser(userPb) },
      request: new Request(`http://localhost/group/${groupId}/tasks?child=${childId}`),
    })

  it('includes scroll-preservation script that saves scroll position', async () => {
    const html = await renderPage()
    expect(html).toContain('data-scroll-preservation')
  })

  it('uses sessionStorage key for task-page scroll position', async () => {
    const html = await renderPage()
    expect(html).toContain('task-page-scroll-y')
  })
})
