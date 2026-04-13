import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { beforeEach, describe, expect, it } from 'vitest'
import { type Db, openDb } from '../db.ts'
import { createChild } from '../domain/children.ts'
import { createGroup } from '../domain/groups.ts'
import { createTask } from '../domain/tasks.ts'
import { createUser } from '../domain/users.ts'
import IndexPage from './index.astro'
import LoginPage from './login.astro'

let db: Db
let userId: string

beforeEach(() => {
  db = openDb(':memory:')
  const user = createUser(db, { email: 'parent@test' })
  userId = user.id
})

describe('login page', () => {
  it('renders the magic link form when not logged in', async () => {
    const container = await AstroContainer.create()
    const html = await container.renderToString(LoginPage, {
      locals: { db, user: null },
    })
    expect(html).toContain('Anmelden')
    expect(html).toContain('action="/auth/magic/request"')
    expect(html).toContain('name="email"')
  })
})

describe('index (kiosk) page', () => {
  it('renders an empty-state hint when the user has no groups', async () => {
    const container = await AstroContainer.create()
    const html = await container.renderToString(IndexPage, {
      locals: { db, user: { sub: userId, email: 'parent@test' } },
    })
    expect(html).toContain('Noch keine Gruppe')
  })

  it('renders a child with their active tasks', async () => {
    const group = createGroup(db, { name: 'Family', createdBy: userId })
    const child = createChild(db, {
      groupId: group.id,
      name: 'Mila',
      color: '#f0a',
    })
    createTask(db, {
      childId: child.id,
      title: 'Zähne putzen',
      points: 2,
      recurrenceType: 'none',
    })

    const container = await AstroContainer.create()
    const html = await container.renderToString(IndexPage, {
      locals: { db, user: { sub: userId, email: 'parent@test' } },
    })
    expect(html).toContain('Family')
    expect(html).toContain('Mila')
    expect(html).toContain('Zähne putzen')
    expect(html).toContain('+2')
  })
})
