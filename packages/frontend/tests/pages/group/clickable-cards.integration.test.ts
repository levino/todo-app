import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach } from 'vitest'
import PocketBase from 'pocketbase'
import TasksPage from '../../../src/pages/group/[groupId]/tasks/index.astro'
import { resetPocketBase } from '@/lib/pocketbase'
import { getCurrentPhase } from '@/lib/tasks'

const POCKETBASE_URL =
  process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

describe('Clickable Task Cards', () => {
  let pb: PocketBase
  let adminPb: PocketBase
  let container: AstroContainer
  let groupId: string
  let childId: string
  let currentPhase: string

  beforeEach(async () => {
    resetPocketBase()
    adminPb = new PocketBase(POCKETBASE_URL)
    await adminPb
      .collection('_superusers')
      .authWithPassword('admin@test.local', 'testtest123')

    pb = new PocketBase(POCKETBASE_URL)
    const user = await adminPb.collection('users').create({
      email: `clickable-${Date.now()}@test.local`,
      password: 'testtest123',
      passwordConfirm: 'testtest123',
      name: 'Click Test User',
    })
    await pb
      .collection('users')
      .authWithPassword(user.email, 'testtest123')

    const group = await adminPb.collection('groups').create({
      name: 'Click Test Group',
      morningEnd: '00:00',
      eveningStart: '23:59',
    })
    groupId = group.id
    currentPhase = getCurrentPhase('00:00', '23:59', 'Europe/Berlin')

    await adminPb.collection('user_groups').create({
      user: user.id,
      group: groupId,
    })

    const child = await adminPb.collection('children').create({
      name: 'TestChild',
      color: '#ff0000',
      group: groupId,
    })
    childId = child.id

    await adminPb.collection('tasks').create({
      title: 'Clickable Task 1',
      child: childId,
      timeOfDay: currentPhase,
      completed: false,
    })

    container = await AstroContainer.create()
  })

  describe('child detail view (selectedChild)', () => {
    it('should have cursor-pointer class on task items', async () => {
      const html = await container.renderToString(TasksPage, {
        params: { groupId },
        request: new Request(
          `http://localhost/group/${groupId}/tasks?child=${childId}`,
        ),
        locals: { pb, user: pb.authStore.record },
      })

      const taskItemMatches = html.match(
        /data-testid="task-item"[^>]*/g,
      )
      expect(taskItemMatches).not.toBeNull()
      expect(taskItemMatches!.length).toBeGreaterThan(0)
      for (const match of taskItemMatches!) {
        expect(match).toContain('cursor-pointer')
      }
    })

    it('should include script tag with click handler logic for task items', async () => {
      const html = await container.renderToString(TasksPage, {
        params: { groupId },
        request: new Request(
          `http://localhost/group/${groupId}/tasks?child=${childId}`,
        ),
        locals: { pb, user: pb.authStore.record },
      })

      // The page must contain a script tag (the confirmation dialog + click handler)
      expect(html).toContain('<script')
      // Task items must be present for the click handler to target
      expect(html).toContain('data-testid="task-item"')
      // The form with data-task-title must be present (used by click handler to find the form)
      expect(html).toContain('data-task-title=')
    })
  })

  describe('overview (no selectedChild)', () => {
    it('should wrap child avatar and name together in one link', async () => {
      const html = await container.renderToString(TasksPage, {
        params: { groupId },
        locals: { pb, user: pb.authStore.record },
      })

      // The child section header should have the <a> wrapping both the avatar and the name
      const childSectionHeaders = html.match(
        /<header[^>]*>[\s\S]*?<\/header>/g,
      )
      expect(childSectionHeaders).not.toBeNull()

      // Find the child section header (not the main page header)
      const childHeader = childSectionHeaders!.find((h) =>
        h.includes('TestChild'),
      )
      expect(childHeader).toBeDefined()

      // The <a> should wrap both the ColoredInitials div and the child name
      const linkMatch = childHeader!.match(/<a [^>]*>[\s\S]*?<\/a>/)
      expect(linkMatch).not.toBeNull()
      const linkContent = linkMatch![0]
      expect(linkContent).toContain('rounded-full') // ColoredInitials is inside the link
      expect(linkContent).toContain('TestChild') // Child name is inside the link
    })

    it('should have cursor-pointer class on overview task items', async () => {
      const html = await container.renderToString(TasksPage, {
        params: { groupId },
        locals: { pb, user: pb.authStore.record },
      })

      const taskItemMatches = html.match(
        /data-testid="task-item"[^>]*/g,
      )
      expect(taskItemMatches).not.toBeNull()
      for (const match of taskItemMatches!) {
        expect(match).toContain('cursor-pointer')
      }
    })
  })
})
