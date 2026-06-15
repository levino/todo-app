import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach } from 'vitest'
import TasksPage from '../../../src/pages/group/[groupId]/tasks/index.astro'
import { getCurrentPhase, getLocalDateString } from '@/lib/tasks'
import { authUser, createPb, type PbShim } from '../../helpers'



/**
 * Regression tests for the per-task Astro view transitions.
 *
 * The smooth "check off a task and the list closes the gap" effect relies on
 * every task element getting its OWN Astro view transition (`transition:name`),
 * so the browser can morph each surviving task to its new slot and animate the
 * completed one out — instead of the whole list hard-cutting.
 *
 * Astro compiles a `transition:*` directive into a per-element
 * `data-astro-transition-scope` attribute. Note: Astro's Container API does NOT
 * emit the generated <style> that maps the scope to the actual
 * `view-transition-name`, so we can only assert here that each task PARTICIPATES
 * in a transition and gets its OWN scope (one per task, never a single shared
 * block). Verifying the concrete name value (`task-<id>`) requires a real
 * browser and lives in the E2E layer.
 */
describe('Task list view transitions', () => {
  let adminPb: PbShim
  let userPb: PbShim
  let container: AstroContainer
  let groupId: string
  let childId: string
  let currentPhase: string
  let todayStr: string

  beforeEach(async () => {
    adminPb = createPb()
    await adminPb.collection('_superusers').authWithPassword('admin@test.local', 'testtest123')

    const email = `vt-${Date.now()}@test.local`
    const user = await adminPb.collection('users').create({
      email,
      password: 'testtest123',
      passwordConfirm: 'testtest123',
    })

    userPb = createPb()
    await userPb.collection('users').authWithPassword(email, 'testtest123')

    const group = await adminPb.collection('groups').create({
      name: 'VT Family',
      morningEnd: '00:00',
      eveningStart: '23:59',
    })
    groupId = group.id
    currentPhase = getCurrentPhase('00:00', '23:59', 'Europe/Berlin')
    todayStr = getLocalDateString('Europe/Berlin')

    await adminPb.collection('user_groups').create({ user: user.id, group: groupId })

    const child = await adminPb.collection('children').create({
      name: 'Mia',
      color: '#FF6B6B',
      group: groupId,
    })
    childId = child.id

    container = await AstroContainer.create()
  })

  const render = (child?: string) =>
    container.renderToString(TasksPage, {
      params: { groupId },
      request: child
        ? new Request(`http://localhost/group/${groupId}/tasks?child=${child}`)
        : undefined,
      locals: { db: userPb.db, user: authUser(userPb) },
    })

  const scopesFor = (html: string, testid: string): string[] => {
    const re = new RegExp(
      `<li data-testid="${testid}"[^>]*?data-astro-transition-scope="([^"]*)"`,
      'g',
    )
    return [...html.matchAll(re)].map((m) => m[1])
  }

  it('gives every active task its own Astro view transition scope', async () => {
    for (const title of ['Zähne putzen', 'Aufräumen', 'Tisch decken']) {
      await adminPb.collection('tasks').create({
        title,
        child: childId,
        completed: false,
        timeOfDay: currentPhase,
        dueDate: todayStr,
      })
    }

    const html = await render(childId)
    const scopes = scopesFor(html, 'task-item')

    // One transition per task...
    expect(scopes).toHaveLength(3)
    // ...and each task is named individually (no single shared block), which is
    // what lets the surviving tasks morph/slide independently.
    expect(new Set(scopes).size).toBe(3)
  })

  it('also gives completed ("Heute erledigt") tasks their own transition scope', async () => {
    await adminPb.collection('tasks').create({
      title: 'Schon erledigt',
      child: childId,
      completed: true,
      completedAt: new Date().toISOString(),
      timeOfDay: currentPhase,
      dueDate: todayStr,
    })

    const html = await render(childId)

    // So that completing a task morphs it from the active list into the done
    // list (and undo morphs it back) instead of popping.
    expect(scopesFor(html, 'completed-task-item')).toHaveLength(1)
  })

  it('does not regress to a static slide / no transition on task items', async () => {
    await adminPb.collection('tasks').create({
      title: 'Zähne putzen',
      child: childId,
      completed: false,
      timeOfDay: currentPhase,
      dueDate: todayStr,
    })

    const html = await render(childId)

    expect(html).not.toContain('transition:animate="slide"')
    // The directive must actually reach the rendered task item.
    expect(html).toMatch(/<li data-testid="task-item"[^>]*data-astro-transition-scope=/)
  })
})
