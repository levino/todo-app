import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TasksPage from '../../../src/pages/group/[groupId]/tasks/index.astro'
import { authUser, createPb, type PbShim } from '../../helpers'

// Project tasks ("Projektaufgaben"): worked on over several days, with two
// completion actions in the UI — a yellow "Für heute geschafft" (defer to
// tomorrow) and the green "Ganz fertig" (final completion).
describe('Project tasks (Projektaufgaben) page', () => {
  let pb: PbShim
  let adminPb: PbShim
  let container: AstroContainer
  let groupId: string
  let childId: string

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    adminPb = createPb()
    await adminPb.collection('_superusers').authWithPassword('admin@test.local', 'testtest123')

    pb = createPb()
    const user = await adminPb.collection('users').create({
      email: `project-${Date.now()}@test.local`,
      password: 'testtest123',
      passwordConfirm: 'testtest123',
      name: 'Test User',
    })
    await pb.collection('users').authWithPassword(user.email, 'testtest123')

    const group = await adminPb.collection('groups').create({
      name: 'Project Family',
      morningEnd: '00:00',
      eveningStart: '23:59',
    })
    groupId = group.id

    await adminPb.collection('user_groups').create({ user: user.id, group: groupId })

    const child = await adminPb.collection('children').create({
      name: 'Anna',
      color: '#FF6B6B',
      group: groupId,
    })
    childId = child.id

    container = await AstroContainer.create()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const render = (child = childId) =>
    container.renderToString(TasksPage, {
      params: { groupId },
      locals: { db: pb.db, user: authUser(pb) },
      request: new Request(`http://localhost/group/${groupId}/tasks?child=${child}`),
    })

  it('renders both a defer ("für heute") and a complete button for a project task', async () => {
    await adminPb.collection('tasks').create({
      title: 'Stricken',
      child: childId,
      completed: false,
      timeOfDay: 'afternoon',
      dueDate: '2026-06-15',
      isProject: true,
    })

    const html = await render()

    expect(html).toContain('Stricken')
    expect(html).toContain('data-testid="defer-button"')
    expect(html).toContain('data-testid="complete-button"')
  })

  it('renders only a complete button for a normal (non-project) task', async () => {
    await adminPb.collection('tasks').create({
      title: 'Zähne putzen',
      child: childId,
      completed: false,
      timeOfDay: 'afternoon',
      dueDate: '2026-06-15',
      isProject: false,
    })

    const html = await render()

    expect(html).toContain('Zähne putzen')
    expect(html).toContain('data-testid="complete-button"')
    expect(html).not.toContain('data-testid="defer-button"')
  })

  it('moves a task deferred for today out of active and into "Heute erledigt"', async () => {
    await adminPb.collection('tasks').create({
      title: 'Handarbeit',
      child: childId,
      completed: false,
      timeOfDay: 'afternoon',
      dueDate: '2026-06-15',
      isProject: true,
      deferredUntil: '2026-06-16T00:00:00.000Z',
    })

    const html = await render()

    // Still rendered (in the done-today list), but not as an active task with
    // its action buttons.
    expect(html).toContain('Handarbeit')
    expect(html).toContain('data-testid="recently-completed"')
    expect(html).toContain('data-testid="completed-task-item"')
    // No active defer/complete buttons for it (it's done for today).
    expect(html).not.toContain('data-testid="defer-button"')
  })
})
