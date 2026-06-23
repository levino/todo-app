import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DB } from './connection.js'

// Regression test for issue #88, acceptance criterion 3:
// "Existing records are migrated to the canonical encoding."
//
// Canonical encoding is JS Date.getDay(): 0=Sunday .. 6=Saturday, so Sunday is
// only ever 0 (never 7). Legacy rows (and rows imported from the old PocketBase
// data) may still store 7 for Sunday, possibly with duplicates and unsorted.
// Migration 003 must rewrite those rows in-place: 7 -> 0, dedupe, sort.

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, '..', 'migrations')

// Build a database at the pre-003 schema (only 001 + 002 applied) so we can
// seed legacy rows, then apply the 003 normalization migration on top.
function makePre003Db(): DB {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(readFileSync(join(migrationsDir, '001_init.sql'), 'utf8'))
  db.exec(readFileSync(join(migrationsDir, '002_project_tasks.sql'), 'utf8'))
  return db
}

function applyNormalizationMigration(db: DB): void {
  db.exec(readFileSync(join(migrationsDir, '003_normalize_recurrence_days.sql'), 'utf8'))
}

// Insert a task row directly (bypassing validation) with a raw recurrenceDays
// JSON string, simulating legacy data.
function seedTask(db: DB, id: string, recurrenceDays: string | null): void {
  db.prepare(
    `INSERT INTO groups (id, name, created, updated) VALUES (?, 'G', '', '')`,
  ).run(`group-${id}`)
  db.prepare(
    `INSERT INTO children (id, name, color, group_id, created, updated)
     VALUES (?, 'Kid', '#FF6B6B', ?, '', '')`,
  ).run(`child-${id}`, `group-${id}`)
  db.prepare(
    `INSERT INTO tasks (id, title, child_id, recurrenceType, recurrenceDays, timeOfDay, created, updated)
     VALUES (?, 'T', ?, 'weekly', ?, 'morning', '', '')`,
  ).run(id, `child-${id}`, recurrenceDays)
}

function daysOf(db: DB, id: string): number[] | null {
  const row = db
    .prepare<[string], { recurrenceDays: string | null }>(
      'SELECT recurrenceDays FROM tasks WHERE id = ?',
    )
    .get(id)
  return row?.recurrenceDays ? (JSON.parse(row.recurrenceDays) as number[]) : null
}

let db: DB

beforeEach(() => {
  db = makePre003Db()
})

afterEach(() => {
  db.close()
})

describe('migration 003: normalize recurrenceDays', () => {
  it('rewrites Sunday-as-7 to canonical 0', () => {
    seedTask(db, 'sunday7', '[7]')
    applyNormalizationMigration(db)
    expect(daysOf(db, 'sunday7')).toEqual([0])
  })

  it('dedupes and sorts after normalizing (e.g. [0,7] -> [0])', () => {
    seedTask(db, 'dup', '[0,7]')
    applyNormalizationMigration(db)
    expect(daysOf(db, 'dup')).toEqual([0])
  })

  it('normalizes a mixed array, deduping and sorting ([7,1,1] -> [0,1])', () => {
    seedTask(db, 'mixed', '[7,1,1]')
    applyNormalizationMigration(db)
    expect(daysOf(db, 'mixed')).toEqual([0, 1])
  })

  it('leaves already-canonical rows untouched', () => {
    seedTask(db, 'canon', '[1,3,5]')
    applyNormalizationMigration(db)
    expect(daysOf(db, 'canon')).toEqual([1, 3, 5])
  })

  it('leaves rows without recurrenceDays (NULL) untouched', () => {
    seedTask(db, 'none', null)
    applyNormalizationMigration(db)
    expect(daysOf(db, 'none')).toBeNull()
  })
})
