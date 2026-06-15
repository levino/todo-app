import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach } from 'vitest'
import LoginPage from '../../src/pages/login.astro'
import SignupPage from '../../src/pages/signup.astro'
import LogoutPage from '../../src/pages/logout.astro'
import GroupsPage from '../../src/pages/settings/groups.astro'
import AdminPage from '../../src/pages/admin.astro'
import OAuthPage from '../../src/pages/oauth/authorize.astro'
import TasksPage from '../../src/pages/group/[groupId]/tasks/index.astro'
import { authUser, createPb, type PbShim } from '../helpers'



// Matches `data-testid="x" ... active:scale-95` within the same tag.
const pressedTestid = (id: string) =>
  new RegExp(`data-testid="${id}"[^>]*active:scale-95[^>]*motion-reduce:active:scale-100`)
const focusedTestid = (id: string) =>
  new RegExp(`data-testid="${id}"[^>]*focus-visible:ring-2`)

describe('Interaction animations & accessibility', () => {
  let container: AstroContainer

  beforeEach(async () => {
    container = await AstroContainer.create()
  })

  describe('Auth pages (public)', () => {
    it('login: submit button has press feedback, inputs have focus ring', async () => {
      const html = await container.renderToString(LoginPage, {
        request: new Request('http://localhost/login'),
      })
      expect(html).toMatch(pressedTestid('login-submit'))
      expect(html).toMatch(focusedTestid('login-email'))
      expect(html).toMatch(focusedTestid('login-password'))
    })

    it('signup: submit button has press feedback, inputs have focus ring', async () => {
      const html = await container.renderToString(SignupPage, {
        request: new Request('http://localhost/signup'),
      })
      expect(html).toMatch(pressedTestid('signup-submit'))
      expect(html).toMatch(focusedTestid('signup-email'))
    })
  })

  describe('Pages behind auth', () => {
    let adminPb: PbShim
    let userPb: PbShim

    beforeEach(async () => {
      adminPb = createPb()
      await adminPb.collection('_superusers').authWithPassword('admin@test.local', 'testtest123')

      const email = `ia-${Date.now()}@test.local`
      const user = await adminPb.collection('users').create({
        email,
        password: 'testtest123',
        passwordConfirm: 'testtest123',
      })
      userPb = createPb()
      await userPb.collection('users').authWithPassword(email, 'testtest123')

      const group = await adminPb.collection('groups').create({ name: 'IA Family' })
      await adminPb.collection('user_groups').create({ user: user.id, group: group.id })
    })

    it('logout: Abmelden button has press feedback', async () => {
      const html = await container.renderToString(LogoutPage, {
        locals: { db: userPb.db, user: authUser(userPb) },
      })
      expect(html).toMatch(pressedTestid('logout-submit'))
    })

    it('settings/groups: the clickable group card has card press feedback', async () => {
      const html = await container.renderToString(GroupsPage, {
        locals: { db: userPb.db, user: authUser(userPb) },
      })
      expect(html).toMatch(
        /data-testid="group-tasks-link"[^>]*active:scale-\[0\.99\][^>]*motion-reduce:active:scale-100/,
      )
    })

    it('admin: the copy-url button has press feedback', async () => {
      const html = await container.renderToString(AdminPage, {
        locals: { db: userPb.db, user: authUser(userPb) },
        request: new Request('http://localhost/admin'),
      })
      expect(html).toMatch(pressedTestid('copy-url-button'))
    })
  })

  describe('OAuth authorize page', () => {
    it('error branch: the home link has press feedback', async () => {
      // No OAuth params -> error branch renders a "Zur Startseite" link.
      // pb/user are unused on this branch, but Locals requires a pb instance.
      const pb = createPb()
      const html = await container.renderToString(OAuthPage, {
        locals: { db: pb.db, user: undefined },
        request: new Request('http://localhost/oauth/authorize'),
      })
      expect(html).toMatch(pressedTestid('oauth-home-link'))
    })
  })

  describe('Tasks page', () => {
    let adminPb: PbShim
    let userPb: PbShim
    let groupId: string
    let childId: string

    beforeEach(async () => {
      adminPb = createPb()
      await adminPb.collection('_superusers').authWithPassword('admin@test.local', 'testtest123')

      const email = `iat-${Date.now()}@test.local`
      const user = await adminPb.collection('users').create({
        email,
        password: 'testtest123',
        passwordConfirm: 'testtest123',
      })
      userPb = createPb()
      await userPb.collection('users').authWithPassword(email, 'testtest123')

      const group = await adminPb.collection('groups').create({
        name: 'IA Tasks',
        morningEnd: '00:00',
        eveningStart: '23:59',
      })
      groupId = group.id
      await adminPb.collection('user_groups').create({ user: user.id, group: groupId })
      const child = await adminPb.collection('children').create({
        name: 'Mia',
        color: '#FF6B6B',
        group: groupId,
      })
      childId = child.id
    })

    const renderChild = (extra = '') =>
      container.renderToString(TasksPage, {
        params: { groupId },
        request: new Request(`http://localhost/group/${groupId}/tasks?child=${childId}${extra}`),
        locals: { db: userPb.db, user: authUser(userPb) },
      })

    it('confirm dialog buttons have press feedback', async () => {
      await adminPb.collection('tasks').create({
        title: 'Zähne putzen',
        child: childId,
        completed: false,
        timeOfDay: 'afternoon',
      })
      const html = await renderChild()
      expect(html).toMatch(pressedTestid('confirm-ok'))
      expect(html).toMatch(pressedTestid('confirm-cancel'))
    })

    it('undo button has press feedback', async () => {
      await adminPb.collection('tasks').create({
        title: 'Erledigt',
        child: childId,
        completed: true,
        completedAt: new Date().toISOString(),
        timeOfDay: 'afternoon',
      })
      const html = await renderChild()
      expect(html).toMatch(pressedTestid('undo-button'))
    })

    it('celebration emoji only bounces when motion is allowed', async () => {
      // No active tasks -> celebration shown.
      const html = await renderChild()
      expect(html).toMatch(/data-testid="celebration-emoji"[^>]*motion-safe:animate-bounce/)
      // No unconditional bounce anywhere (a bare class is space-delimited;
      // the gated one reads `motion-safe:animate-bounce`, never ` animate-bounce`).
      expect(html).not.toContain(' animate-bounce')
    })

    it('points badge and celebration get their own view transition', async () => {
      await adminPb.collection('point_transactions').create({
        child: childId,
        points: 7,
        type: 'earned',
        description: 'test',
      })
      const htmlCeleb = await renderChild()
      // celebration (no active tasks) participates in a transition
      expect(htmlCeleb).toMatch(/data-testid="celebration"[^>]*data-astro-transition-scope/)
      // points badge participates in a transition
      expect(htmlCeleb).toMatch(/data-testid="points-balance"[^>]*data-astro-transition-scope/)
    })

    it('confirm dialogs slide up from the bottom on small screens', async () => {
      await adminPb.collection('tasks').create({
        title: 'Zähne putzen',
        child: childId,
        completed: false,
        timeOfDay: 'afternoon',
      })
      const html = await renderChild()
      expect(html).toMatch(/data-testid="confirm-dialog"[^>]*modal-bottom/)
      expect(html).toMatch(/data-testid="delete-confirm-dialog"[^>]*modal-bottom/)
    })
  })

  describe('Form submit loading', () => {
    it('login form opts into the submit-loading behavior and the script is present', async () => {
      const html = await container.renderToString(LoginPage, {
        request: new Request('http://localhost/login'),
      })
      expect(html).toContain('data-loading-submit')
      expect(html).toContain('data-submit-loading')
    })
  })
})
