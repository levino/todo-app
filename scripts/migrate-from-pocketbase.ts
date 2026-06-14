/**
 * Data migration: live PocketBase ("Familien ToDos" / levino/todo-app) -> new SQLite db.
 *
 * The new SQLite database is the one defined by src/db.ts (`openDb`), which creates
 * / migrates the schema on open. We copy the live PocketBase collections into it,
 * preserving the original PocketBase ids as the TEXT primary keys so that all
 * relations stay intact. Users are linked to the new auth system by EMAIL only
 * (no password is carried over) — on first login `upsertUserByEmail` matches by
 * email, so the email must be preserved exactly.
 *
 * Usage:
 *   PB_DB=/tmp/pb-data.db DB_PATH=/tmp/app.db \
 *     node --experimental-strip-types scripts/migrate-from-pocketbase.ts [--dry-run]
 *
 * Or via npm:
 *   PB_DB=/tmp/pb-data.db DB_PATH=/tmp/app.db npm run migrate:pb
 *   PB_DB=/tmp/pb-data.db DB_PATH=/tmp/app.db npm run migrate:pb -- --dry-run
 *
 * Guardrails: this script only READS the (copied) PocketBase db. Never point PB_DB
 * at the live PocketBase volume. It is idempotent (INSERT OR REPLACE keyed by id),
 * runs inside a single transaction on the target, and fails if source vs. target
 * row counts do not match (after accounting for intentionally skipped rows).
 */

import Database from 'better-sqlite3'
import { openDb, type Db } from '../src/db.ts'

const PB_DB = process.env.PB_DB
const DB_PATH = process.env.DB_PATH
const DRY_RUN = process.argv.includes('--dry-run')

if (!PB_DB) {
  console.error('ERROR: PB_DB env var (path to the copied PocketBase data.db) is required')
  process.exit(1)
}
if (!DB_PATH) {
  console.error('ERROR: DB_PATH env var (path to the target @family-todo SQLite db) is required')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

/** PocketBase datetimes are TEXT like "2026-03-16 14:33:13.254Z" (or empty). */
const pbDateToEpochMs = (v: unknown): number | null => {
  if (v == null) return null
  const s = String(v).trim()
  if (s === '') return null
  // PocketBase uses a space between date and time; Date can parse the ISO form.
  const iso = s.includes('T') ? s : s.replace(' ', 'T')
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

/** Empty-string FK / value -> null. */
const orNull = (v: unknown): string | null => {
  if (v == null) return null
  const s = String(v)
  return s === '' ? null : s
}

/** PocketBase NUMERIC -> integer for the INTEGER target columns. */
const toInt = (v: unknown, fallback = 0): number => {
  if (v == null || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

/**
 * PocketBase stores recurrence days as a JSON array (e.g. "[1,2,3,4]") in either
 * `recurrenceDays` or the older `daysOfWeek`. Normalize to a JSON string of
 * numbers (the target stores recurrence_days as a JSON TEXT) or null.
 */
const normalizeRecurrenceDays = (...candidates: unknown[]): string | null => {
  for (const c of candidates) {
    if (c == null) continue
    const s = String(c).trim()
    if (s === '' || s === 'null' || s === '[]') continue
    try {
      const arr = JSON.parse(s)
      if (Array.isArray(arr) && arr.length > 0) {
        const nums = arr.map((x) => Number(x)).filter((x) => Number.isFinite(x))
        if (nums.length > 0) return JSON.stringify(nums)
      }
    } catch {
      // ignore malformed
    }
  }
  return null
}

/**
 * Map PocketBase recurrenceType to the target enum:
 *   'daily' | 'weekly' | 'once' | 'none'
 * Observed PB values: '' (default), 'interval', 'weekly', 'chore'.
 */
const mapRecurrenceType = (
  pbType: unknown,
): 'daily' | 'weekly' | 'once' | 'none' => {
  const s = String(pbType ?? '').trim().toLowerCase()
  switch (s) {
    case 'weekly':
      return 'weekly'
    case 'once':
      return 'once'
    case 'none':
      return 'none'
    case 'daily':
      return 'daily'
    // PB "interval" tasks recur regularly; closest target semantics is daily.
    case 'interval':
      return 'daily'
    // PB "chore" tasks are always available; target 'none' = always active.
    case 'chore':
      return 'none'
    default:
      // PB default (empty) corresponds to the target schema default 'daily'.
      return 'daily'
  }
}

// ---------------------------------------------------------------------------
// Source readers (read-only)
// ---------------------------------------------------------------------------

type CountMismatch = {
  table: string
  source: number
  target: number
  skipped: number
}

const tableExists = (db: Database.Database, name: string): boolean =>
  !!db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND name = ?",
    )
    .get(name)

const countRows = (db: Database.Database, table: string): number => {
  if (!tableExists(db, table)) return 0
  const r = db.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get() as {
    c: number
  }
  return r.c
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

const main = (): void => {
  console.log('PocketBase -> SQLite migration')
  console.log(`  source PB_DB : ${PB_DB}`)
  console.log(`  target DB    : ${DB_PATH}`)
  console.log(`  mode         : ${DRY_RUN ? 'DRY RUN (no writes)' : 'WRITE'}`)
  console.log('')

  // READ-ONLY source connection.
  const src = new Database(PB_DB, { readonly: true, fileMustExist: true })
  // Target opens via the db package's opener so the schema/migrations run first.
  const dst: Db = openDb(DB_PATH)
  dst.pragma('foreign_keys = OFF') // we insert in dependency order, but tolerate any ordering on re-run

  // Read every source collection up-front.
  const usersSrc = src
    .prepare('SELECT id, email, name, created FROM users')
    .all() as Array<{ id: string; email: string; name: string; created: string }>

  const groupsSrc = src.prepare('SELECT id, name FROM groups').all() as Array<{
    id: string
    name: string
  }>

  const userGroupsSrc = src
    .prepare('SELECT id, "group", "user" FROM user_groups')
    .all() as Array<{ id: string; group: string; user: string }>

  const childrenSrc = src
    .prepare('SELECT id, "group", name, color FROM children')
    .all() as Array<{ id: string; group: string; name: string; color: string }>

  const tasksSrc = src
    .prepare(
      `SELECT id, child, title, priority, points,
              recurrenceType, recurrenceDays, daysOfWeek,
              completed, completedAt, completedBy, lastCompletedAt
       FROM tasks`,
    )
    .all() as Array<Record<string, unknown>>

  const rewardsSrc = tableExists(src, 'rewards')
    ? (src
        .prepare(
          'SELECT id, "group", name, description, pointsCost FROM rewards',
        )
        .all() as Array<Record<string, unknown>>)
    : []

  const pointTxSrc = tableExists(src, 'point_transactions')
    ? (src
        .prepare(
          'SELECT id, child, points, type, description, task, reward FROM point_transactions',
        )
        .all() as Array<Record<string, unknown>>)
    : []

  // --- Derive timestamps that the target requires but PB does not store. -----
  // users: PB `created` is an ISO datetime.
  const userCreatedAt = new Map<string, number>()
  for (const u of usersSrc) {
    userCreatedAt.set(u.id, pbDateToEpochMs(u.created) ?? 0)
  }
  // group.created_at + created_by: derive from the earliest member user.
  // (PB groups have no creator / created column.)
  const groupCreatedBy = new Map<string, string>()
  const groupCreatedAt = new Map<string, number>()
  for (const ug of userGroupsSrc) {
    const ts = userCreatedAt.get(ug.user) ?? 0
    const prev = groupCreatedAt.get(ug.group)
    if (prev === undefined || ts < prev) {
      groupCreatedAt.set(ug.group, ts)
      groupCreatedBy.set(ug.group, ug.user)
    }
  }

  let skippedGroups = 0
  let skippedMembers = 0

  const summary: CountMismatch[] = []

  const run = dst.transaction(() => {
    // ---- users ----------------------------------------------------------
    const insUser = dst.prepare(
      `INSERT INTO users (id, email, name, github_id, created_at)
       VALUES (@id, @email, @name, NULL, @created_at)
       ON CONFLICT(id) DO UPDATE SET
         email = excluded.email,
         name = excluded.name,
         created_at = excluded.created_at`,
    )
    for (const u of usersSrc) {
      if (!DRY_RUN) {
        insUser.run({
          id: u.id,
          email: u.email,
          name: orNull(u.name),
          created_at: userCreatedAt.get(u.id) ?? 0,
        })
      }
    }

    // ---- groups ---------------------------------------------------------
    // groups.created_by is a NOT NULL FK to users; a group without any member
    // cannot get a valid creator, so it is skipped (reported, not silently lost).
    const insGroup = dst.prepare(
      `INSERT INTO groups (id, name, created_at, created_by)
       VALUES (@id, @name, @created_at, @created_by)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         created_at = excluded.created_at,
         created_by = excluded.created_by`,
    )
    const migratedGroupIds = new Set<string>()
    for (const g of groupsSrc) {
      const createdBy = groupCreatedBy.get(g.id)
      if (!createdBy) {
        skippedGroups++
        console.warn(
          `  [skip] group ${g.id} ("${g.name}") has no members -> no creator, cannot satisfy created_by FK`,
        )
        continue
      }
      migratedGroupIds.add(g.id)
      if (!DRY_RUN) {
        insGroup.run({
          id: g.id,
          name: g.name,
          created_at: groupCreatedAt.get(g.id) ?? 0,
          created_by: createdBy,
        })
      }
    }

    // ---- group_members (PB user_groups) --------------------------------
    // Composite PK (group_id, user_id); no surrogate id in target.
    const insMember = dst.prepare(
      `INSERT INTO group_members (group_id, user_id, role, joined_at)
       VALUES (@group_id, @user_id, 'admin', @joined_at)
       ON CONFLICT(group_id, user_id) DO UPDATE SET
         role = excluded.role,
         joined_at = excluded.joined_at`,
    )
    for (const ug of userGroupsSrc) {
      if (!migratedGroupIds.has(ug.group)) {
        skippedMembers++
        continue
      }
      if (!DRY_RUN) {
        insMember.run({
          group_id: ug.group,
          user_id: ug.user,
          joined_at: userCreatedAt.get(ug.user) ?? groupCreatedAt.get(ug.group) ?? 0,
        })
      }
    }

    // ---- children -------------------------------------------------------
    const insChild = dst.prepare(
      `INSERT INTO children (id, group_id, name, color, created_at)
       VALUES (@id, @group_id, @name, @color, @created_at)
       ON CONFLICT(id) DO UPDATE SET
         group_id = excluded.group_id,
         name = excluded.name,
         color = excluded.color,
         created_at = excluded.created_at`,
    )
    let skippedChildren = 0
    const migratedChildIds = new Set<string>()
    for (const c of childrenSrc) {
      if (!migratedGroupIds.has(c.group)) {
        skippedChildren++
        console.warn(
          `  [skip] child ${c.id} ("${c.name}") belongs to skipped group ${c.group}`,
        )
        continue
      }
      migratedChildIds.add(c.id)
      if (!DRY_RUN) {
        insChild.run({
          id: c.id,
          group_id: c.group,
          name: c.name,
          color: c.color,
          created_at: groupCreatedAt.get(c.group) ?? 0,
        })
      }
    }

    // ---- tasks ----------------------------------------------------------
    // Map PB relation `child` -> child_id. PB completion state is collapsed into
    // last_completed_at (target tracks completions separately via task_completions,
    // which are not part of the source collection set and are left empty).
    // time_phase_id is left NULL (PB time periods are not migrated).
    const insTask = dst.prepare(
      `INSERT INTO tasks (id, child_id, time_phase_id, title, priority, points,
                          recurrence_type, recurrence_days, created_at, last_completed_at)
       VALUES (@id, @child_id, NULL, @title, @priority, @points,
               @recurrence_type, @recurrence_days, @created_at, @last_completed_at)
       ON CONFLICT(id) DO UPDATE SET
         child_id = excluded.child_id,
         title = excluded.title,
         priority = excluded.priority,
         points = excluded.points,
         recurrence_type = excluded.recurrence_type,
         recurrence_days = excluded.recurrence_days,
         created_at = excluded.created_at,
         last_completed_at = excluded.last_completed_at`,
    )
    let skippedTasks = 0
    for (const t of tasksSrc) {
      const childId = orNull(t.child)
      if (!childId || !migratedChildIds.has(childId)) {
        skippedTasks++
        console.warn(
          `  [skip] task ${String(t.id)} ("${String(t.title)}") references missing/skipped child ${String(t.child)}`,
        )
        continue
      }
      // last completion: prefer lastCompletedAt, else completedAt when completed.
      const lastCompleted =
        pbDateToEpochMs(t.lastCompletedAt) ??
        (toInt(t.completed) === 1 ? pbDateToEpochMs(t.completedAt) : null)
      if (!DRY_RUN) {
        insTask.run({
          id: String(t.id),
          child_id: childId,
          title: String(t.title ?? ''),
          priority: toInt(t.priority),
          points: toInt(t.points),
          recurrence_type: mapRecurrenceType(t.recurrenceType),
          recurrence_days: normalizeRecurrenceDays(
            t.recurrenceDays,
            t.daysOfWeek,
          ),
          created_at: lastCompleted ?? 0,
          last_completed_at: lastCompleted,
        })
      }
    }

    // ---- rewards --------------------------------------------------------
    const insReward = dst.prepare(
      `INSERT INTO rewards (id, group_id, name, description, points_cost, created_at)
       VALUES (@id, @group_id, @name, @description, @points_cost, @created_at)
       ON CONFLICT(id) DO UPDATE SET
         group_id = excluded.group_id,
         name = excluded.name,
         description = excluded.description,
         points_cost = excluded.points_cost,
         created_at = excluded.created_at`,
    )
    let skippedRewards = 0
    for (const r of rewardsSrc) {
      const groupId = orNull(r.group)
      if (!groupId || !migratedGroupIds.has(groupId)) {
        skippedRewards++
        console.warn(
          `  [skip] reward ${String(r.id)} references missing/skipped group ${String(r.group)}`,
        )
        continue
      }
      if (!DRY_RUN) {
        insReward.run({
          id: String(r.id),
          group_id: groupId,
          name: String(r.name ?? ''),
          description: orNull(r.description),
          points_cost: toInt(r.pointsCost),
          created_at: groupCreatedAt.get(groupId) ?? 0,
        })
      }
    }

    // ---- point_transactions --------------------------------------------
    const insPtx = dst.prepare(
      `INSERT INTO point_transactions (id, child_id, points, type, description, task_id, reward_id, created_at)
       VALUES (@id, @child_id, @points, @type, @description, @task_id, @reward_id, @created_at)
       ON CONFLICT(id) DO UPDATE SET
         child_id = excluded.child_id,
         points = excluded.points,
         type = excluded.type,
         description = excluded.description,
         task_id = excluded.task_id,
         reward_id = excluded.reward_id,
         created_at = excluded.created_at`,
    )
    let skippedPtx = 0
    for (const p of pointTxSrc) {
      const childId = orNull(p.child)
      if (!childId || !migratedChildIds.has(childId)) {
        skippedPtx++
        console.warn(
          `  [skip] point_transaction ${String(p.id)} references missing/skipped child ${String(p.child)}`,
        )
        continue
      }
      if (!DRY_RUN) {
        insPtx.run({
          id: String(p.id),
          child_id: childId,
          points: toInt(p.points),
          type: String(p.type ?? 'manual'),
          description: orNull(p.description),
          task_id: orNull(p.task),
          reward_id: orNull(p.reward),
          created_at: 0,
        })
      }
    }

    // collect skipped tallies for the summary section
    summary.push(
      { table: 'users', source: usersSrc.length, target: 0, skipped: 0 },
      { table: 'groups', source: groupsSrc.length, target: 0, skipped: skippedGroups },
      { table: 'group_members (user_groups)', source: userGroupsSrc.length, target: 0, skipped: skippedMembers },
      { table: 'children', source: childrenSrc.length, target: 0, skipped: skippedChildren },
      { table: 'tasks', source: tasksSrc.length, target: 0, skipped: skippedTasks },
      { table: 'rewards', source: rewardsSrc.length, target: 0, skipped: skippedRewards },
      { table: 'point_transactions', source: pointTxSrc.length, target: 0, skipped: skippedPtx },
    )

    if (DRY_RUN) {
      // Roll back any (none, since guarded) writes done in dry-run.
      throw new DryRunRollback()
    }
  })

  try {
    run()
  } catch (e) {
    if (e instanceof DryRunRollback) {
      // expected — transaction rolled back
    } else {
      src.close()
      dst.close()
      throw e
    }
  }

  // ---- fill in target counts -------------------------------------------
  const targetTableFor: Record<string, string> = {
    users: 'users',
    groups: 'groups',
    'group_members (user_groups)': 'group_members',
    children: 'children',
    tasks: 'tasks',
    rewards: 'rewards',
    point_transactions: 'point_transactions',
  }
  for (const row of summary) {
    row.target = DRY_RUN
      ? row.source - row.skipped
      : countRows(dst as unknown as Database.Database, targetTableFor[row.table])
  }

  // ---- report -----------------------------------------------------------
  console.log('')
  console.log('Row count summary (source -> target):')
  const pad = (s: string, n: number) => s.padEnd(n)
  console.log(
    `  ${pad('table', 30)} ${pad('source', 8)} ${pad('skipped', 8)} ${pad('target', 8)} ok`,
  )
  let allOk = true
  for (const r of summary) {
    const expected = r.source - r.skipped
    const ok = r.target === expected
    if (!ok) allOk = false
    console.log(
      `  ${pad(r.table, 30)} ${pad(String(r.source), 8)} ${pad(String(r.skipped), 8)} ${pad(String(r.target), 8)} ${ok ? 'OK' : 'MISMATCH'}`,
    )
  }

  src.close()
  dst.close()

  console.log('')
  if (DRY_RUN) {
    console.log('DRY RUN complete — no data was written. (target counts shown are the expected post-migration values.)')
    return
  }

  if (!allOk) {
    console.error('FAILED: source vs target row counts do not match (see MISMATCH rows above).')
    process.exit(1)
  }
  console.log('SUCCESS: all row counts match (source - skipped == target).')
}

class DryRunRollback extends Error {}

main()
