import { beforeEach, describe, expect, it } from 'vitest'
import { type Db, openDb } from './db.ts'
import { createChild } from './domain/children.ts'
import { createGroup } from './domain/groups.ts'
import { createUser } from './domain/users.ts'
import { executeTool, type User } from './tools.ts'

let db: Db
let user: User
let otherUser: User
let groupId: string
let otherGroupId: string

beforeEach(() => {
  db = openDb(':memory:')
  const me = createUser(db, { email: 'me@test' })
  user = { sub: me.id, email: me.email }
  const other = createUser(db, { email: 'other@test' })
  otherUser = { sub: other.id, email: other.email }

  const g = createGroup(db, { name: 'Mine', createdBy: me.id })
  groupId = g.id
  createChild(db, { groupId, name: 'Alice', color: '#f00' })

  const og = createGroup(db, { name: 'Theirs', createdBy: other.id })
  otherGroupId = og.id
})

describe('executeTool', () => {
  it('dispatches list_groups and returns JSON-encoded groups', () => {
    const result = JSON.parse(executeTool('list_groups', {}, { db }, user))
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Mine')
  })

  it('rejects unknown tools', () => {
    const result = JSON.parse(executeTool('no_such_tool', {}, { db }, user))
    expect(result).toEqual({ error: 'Unknown tool: no_such_tool' })
  })

  it('blocks access to a group the user is not a member of', () => {
    const result = JSON.parse(
      executeTool('list_children', { groupId: otherGroupId }, { db }, user),
    )
    expect(result.error).toMatch(/Not a member/)
  })

  it('allows access when the user is a group member', () => {
    const result = JSON.parse(
      executeTool('list_children', { groupId }, { db }, user),
    )
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Alice')
  })

  it('create_task flows through the authz chain', () => {
    const [firstChild] = JSON.parse(
      executeTool('list_children', { groupId }, { db }, user),
    ) as { id: string }[]
    const childId = firstChild?.id ?? ''
    const created = JSON.parse(
      executeTool(
        'create_task',
        { childId, title: 'Brush teeth', points: 2 },
        { db },
        user,
      ),
    )
    expect(created.title).toBe('Brush teeth')

    const tasks = JSON.parse(
      executeTool('list_tasks', { childId }, { db }, user),
    )
    expect(tasks).toHaveLength(1)

    const blocked = JSON.parse(
      executeTool('list_tasks', { childId }, { db }, otherUser),
    )
    expect(blocked.error).toMatch(/Not a member/)
  })

  it('validates input with zod', () => {
    const result = JSON.parse(
      executeTool('create_task', { title: '' }, { db }, user),
    )
    expect(result.error).toBeDefined()
  })

  it('redeem_reward refuses when balance is too low', () => {
    const [firstChild] = JSON.parse(
      executeTool('list_children', { groupId }, { db }, user),
    ) as { id: string }[]
    const childId = firstChild?.id ?? ''
    const reward = JSON.parse(
      executeTool(
        'create_reward',
        { groupId, name: 'Ice cream', pointsCost: 10 },
        { db },
        user,
      ),
    )
    const result = JSON.parse(
      executeTool(
        'redeem_reward',
        { childId, rewardId: reward.id },
        { db },
        user,
      ),
    )
    expect(result).toMatchObject({ ok: false, reason: 'insufficient_points' })
  })
})
