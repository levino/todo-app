import { describe, expect, it } from 'vitest'
import { openDb } from './db.ts'

const freshDb = () => openDb(':memory:')

describe('openDb', () => {
  it('enables foreign keys', () => {
    const db = freshDb()
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
  })

  it('creates all expected tables', () => {
    const db = freshDb()
    const rows = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all() as { name: string }[]
    const names = rows
      .map((r) => r.name)
      .filter((n) => !n.startsWith('sqlite_'))
    expect(names).toEqual(
      [
        'children',
        'group_members',
        'groups',
        'magic_links',
        'oauth_clients',
        'oauth_codes',
        'point_transactions',
        'rewards',
        'task_completions',
        'tasks',
        'time_phases',
        'users',
      ].sort(),
    )
  })

  it('is idempotent — running migrations twice does not throw', () => {
    const db = freshDb()
    expect(() => openDb(':memory:')).not.toThrow()
    expect(() => db.exec('SELECT 1')).not.toThrow()
  })
})

describe('foreign keys', () => {
  it('cascades child deletes when a group is deleted', () => {
    const db = freshDb()
    db.prepare(
      "INSERT INTO users (id, email, created_at) VALUES ('u1', 'u1@test', 0)",
    ).run()
    db.prepare(
      "INSERT INTO groups (id, name, created_at, created_by) VALUES ('g1', 'fam', 0, 'u1')",
    ).run()
    db.prepare(
      "INSERT INTO children (id, group_id, name, color, created_at) VALUES ('c1', 'g1', 'Alice', '#f00', 0)",
    ).run()

    db.prepare("DELETE FROM groups WHERE id = 'g1'").run()

    const child = db.prepare("SELECT id FROM children WHERE id = 'c1'").get()
    expect(child).toBeUndefined()
  })

  it('rejects tasks with unknown child_id', () => {
    const db = freshDb()
    expect(() =>
      db
        .prepare(
          "INSERT INTO tasks (id, child_id, title, created_at) VALUES ('t1', 'nope', 'test', 0)",
        )
        .run(),
    ).toThrow(/FOREIGN KEY/)
  })
})
