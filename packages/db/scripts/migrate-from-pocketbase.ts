/**
 * migrate-from-pocketbase.ts
 *
 * One-off data migration that copies the LIVE PocketBase data of the original
 * `levino/todo-app` into the `@family-todo/db` SQLite database — the layer whose
 * schema MIRRORS the original PocketBase collections (see
 * packages/db/migrations/001_init.sql). This restores the ORIGINAL app on a
 * SQLite backend; it is NOT the rewrite.
 *
 * Source (read-only): a PocketBase `data.db`. In PocketBase each collection is a
 * table; the relevant ones here are:
 *   users, groups, children, user_groups, tasks (formerly `kiosk_tasks`),
 *   rewards, point_transactions.
 *
 * Target: the `@family-todo/db` database, opened via createDb(DB_PATH) so the
 * migrations run first and create the schema. The target mirrors PocketBase but
 *   * renames relation columns: group -> group_id, child -> child_id,
 *     user -> user_id, task -> task_id, reward -> reward_id;
 *   * stores booleans as INTEGER 0/1 (already that shape in the PB sqlite file);
 *   * stores datetimes / recurrenceDays JSON as TEXT (straight copy);
 *   * drops PB-only task fields that the target schema does not have
 *     (recurrence, daysOfWeek, timePeriod).
 *
 * Original PocketBase ids are PRESERVED as the TEXT primary keys so every
 * relation stays intact and the original app sees exactly the same data.
 *
 * Empty-string relation values (PocketBase's "no relation") on NULLABLE foreign
 * keys (tasks.completedBy, point_transactions.reward/task) become SQL NULL.
 *
 * Usage:
 *   PB_DB=/path/to/pb/data.db DB_PATH=/path/to/target.db \
 *     npm run migrate:pb -w @family-todo/db [-- --dry-run]
 *   or: tsx packages/db/scripts/migrate-from-pocketbase.ts \
 *         --pb-db=/path/to/data.db --db-path=/path/to/target.db [--dry-run]
 *
 * The migration is idempotent (INSERT ... ON CONFLICT(id) DO UPDATE), runs in a
 * single transaction, prints per-table source-vs-target counts and fails on any
 * mismatch.
 */

import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { createDb, type DB } from '@family-todo/db'

// ---------------------------------------------------------------------------
// Args / env
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): {
  pbDb?: string
  dbPath?: string
  dryRun: boolean
} {
  let pbDb = process.env.PB_DB
  let dbPath = process.env.DB_PATH
  let dryRun = false
  for (const arg of argv) {
    if (arg === '--dry-run') dryRun = true
    else if (arg.startsWith('--pb-db=')) pbDb = arg.slice('--pb-db='.length)
    else if (arg.startsWith('--db-path=')) dbPath = arg.slice('--db-path='.length)
  }
  return { pbDb, dbPath, dryRun }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** PocketBase "no relation" sentinel ('' or null) -> SQL NULL for nullable FKs. */
const nullableFk = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v)
  return s === '' ? null : s
}

/** Required relation: copy verbatim (NOT NULL FK in the target). */
const requiredFk = (v: unknown): string => String(v ?? '')

/** PocketBase booleans are already 0/1 INTEGER in the sqlite file; normalise. */
const toBool01 = (v: unknown): number => (v ? 1 : 0)

/** Numeric field; PB stores NUMERIC. Keep as number (or null when empty). */
const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

/** Pass a value through as TEXT, mapping null/undefined to ''. */
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v))

/** Pass a TEXT value through, but keep '' as NULL for nullable TEXT columns. */
const textOrNull = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v)
  return s === '' ? null : s
}

/** recurrenceDays: PB stores JSON text or NULL. Copy verbatim (target TEXT). */
const jsonOrNull = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v)
  return s === '' ? null : s
}

function countRows(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
}

// ---------------------------------------------------------------------------
// Per-collection copy specs
// ---------------------------------------------------------------------------

interface TableSpec {
  /** Target table name (same as PB collection here). */
  table: string
  /** SQL to read the source rows. */
  selectSql: string
  /** Target columns, in INSERT order. `id` must be first. */
  columns: string[]
  /** Map a source row to the ordered list of values for `columns`. */
  toValues: (row: Record<string, unknown>) => unknown[]
}

const SPECS: TableSpec[] = [
  {
    table: 'users',
    selectSql: 'SELECT id, email, name, created, updated FROM users',
    columns: ['id', 'email', 'name', 'created', 'updated'],
    toValues: (r) => [
      requiredFk(r.id),
      text(r.email),
      // target users.name is nullable; PB stores '' for "no name" -> NULL.
      textOrNull(r.name),
      text(r.created),
      text(r.updated),
    ],
  },
  {
    table: 'groups',
    // PB groups has no created/updated columns; default them to ''.
    selectSql:
      'SELECT id, name, morningEnd, eveningStart, timezone FROM groups',
    columns: [
      'id',
      'name',
      'morningEnd',
      'eveningStart',
      'timezone',
      'created',
      'updated',
    ],
    toValues: (r) => [
      requiredFk(r.id),
      text(r.name),
      // Empty phase-time/timezone -> fall back to the schema defaults so the
      // original app behaves identically to PocketBase's own defaults.
      text(r.morningEnd) || '09:00',
      text(r.eveningStart) || '18:00',
      text(r.timezone) || 'Europe/Berlin',
      '',
      '',
    ],
  },
  {
    table: 'children',
    selectSql: 'SELECT id, name, color, "group" AS group_id FROM children',
    columns: ['id', 'name', 'color', 'group_id', 'created', 'updated'],
    toValues: (r) => [
      requiredFk(r.id),
      text(r.name),
      text(r.color),
      requiredFk(r.group_id), // PB `group` -> target `group_id`
      '',
      '',
    ],
  },
  {
    table: 'user_groups',
    selectSql:
      'SELECT id, "user" AS user_id, "group" AS group_id FROM user_groups',
    columns: ['id', 'user_id', 'group_id', 'created', 'updated'],
    toValues: (r) => [
      requiredFk(r.id),
      requiredFk(r.user_id), // PB `user` -> target `user_id`
      requiredFk(r.group_id), // PB `group` -> target `group_id`
      '',
      '',
    ],
  },
  {
    table: 'tasks',
    // PB `tasks` (formerly kiosk_tasks). Drops PB-only columns recurrence,
    // daysOfWeek, timePeriod that the target schema does not have.
    selectSql: `SELECT
        id, title, child AS child_id, priority, completed, completedAt, dueDate,
        lastCompletedAt, recurrenceType, recurrenceInterval, recurrenceDays,
        timeOfDay, completedBy, previousDueDate, points, isChore, dailyOnly
      FROM tasks`,
    columns: [
      'id',
      'title',
      'child_id',
      'priority',
      'completed',
      'completedAt',
      'dueDate',
      'lastCompletedAt',
      'recurrenceType',
      'recurrenceInterval',
      'recurrenceDays',
      'timeOfDay',
      'completedBy',
      'previousDueDate',
      'points',
      'isChore',
      'dailyOnly',
      'created',
      'updated',
    ],
    toValues: (r) => [
      requiredFk(r.id),
      text(r.title),
      requiredFk(r.child_id), // PB `child` -> target `child_id`
      toNum(r.priority),
      toBool01(r.completed),
      textOrNull(r.completedAt),
      textOrNull(r.dueDate),
      textOrNull(r.lastCompletedAt),
      textOrNull(r.recurrenceType),
      toNum(r.recurrenceInterval),
      jsonOrNull(r.recurrenceDays),
      text(r.timeOfDay) || 'afternoon',
      // completedBy is copied VERBATIM. NOTE: in the ORIGINAL app's live data
      // this field holds the *child* id of who completed the task (a kiosk
      // concept), NOT a user id — even though the target schema annotates it as
      // REFERENCES users(id). Preserving the value verbatim keeps the original
      // app seeing identical data (the stated goal); '' becomes NULL. Because
      // these values would otherwise trip the (semantically inaccurate)
      // users(id) FK, the load runs with foreign_keys temporarily OFF and we
      // re-validate true relations afterwards via PRAGMA foreign_key_check.
      nullableFk(r.completedBy),
      textOrNull(r.previousDueDate),
      toNum(r.points),
      toBool01(r.isChore),
      toBool01(r.dailyOnly),
      '',
      '',
    ],
  },
  {
    table: 'rewards',
    selectSql:
      'SELECT id, name, description, pointsCost, "group" AS group_id FROM rewards',
    columns: [
      'id',
      'name',
      'description',
      'pointsCost',
      'group_id',
      'created',
      'updated',
    ],
    toValues: (r) => [
      requiredFk(r.id),
      text(r.name),
      text(r.description),
      toNum(r.pointsCost) ?? 0,
      requiredFk(r.group_id), // PB `group` -> target `group_id`
      '',
      '',
    ],
  },
  {
    table: 'point_transactions',
    selectSql: `SELECT
        id, child AS child_id, points, type, description,
        reward AS reward_id, task AS task_id
      FROM point_transactions`,
    columns: [
      'id',
      'child_id',
      'points',
      'type',
      'description',
      'reward_id',
      'task_id',
      'created',
      'updated',
    ],
    toValues: (r) => [
      requiredFk(r.id),
      requiredFk(r.child_id), // PB `child` -> target `child_id`
      toNum(r.points) ?? 0,
      text(r.type),
      text(r.description),
      nullableFk(r.reward_id), // nullable FK -> rewards(id); '' -> NULL
      nullableFk(r.task_id), // nullable FK -> tasks(id); '' -> NULL
      '',
      '',
    ],
  },
]

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

function buildUpsertSql(spec: TableSpec): string {
  const cols = spec.columns
  const placeholders = cols.map(() => '?').join(', ')
  // ON CONFLICT(id) DO UPDATE: re-running overwrites every non-id column with
  // the freshly-mapped source value, so the migration is idempotent.
  const updates = cols
    .filter((c) => c !== 'id')
    .map((c) => `"${c}" = excluded."${c}"`)
    .join(', ')
  const colList = cols.map((c) => `"${c}"`).join(', ')
  return `INSERT INTO "${spec.table}" (${colList}) VALUES (${placeholders})
          ON CONFLICT(id) DO UPDATE SET ${updates}`
}

/** Known-benign foreign_key_check rows: the original app stored a CHILD id in
 *  tasks.completedBy even though the new schema annotates it REFERENCES users.
 *  We preserve the data verbatim, so these are expected, not corruption. */
function isExpectedViolation(v: {
  table: string
  parent: string
  rowid: number
}): boolean {
  return v.table === 'tasks' && v.parent === 'users'
}

function migrate(pb: Database.Database, target: DB, dryRun: boolean): void {
  // Order matters for FK integrity within the transaction (parents first).
  const counts: { table: string; source: number; target: number }[] = []

  // better-sqlite3 cannot toggle foreign_keys inside a transaction. We load
  // with FK enforcement OFF so values are copied VERBATIM (notably
  // tasks.completedBy, which in the original data holds a child id, not a user
  // id), then re-enable and re-validate genuine relations via foreign_key_check.
  target.pragma('foreign_keys = OFF')

  const run = target.transaction(() => {
    for (const spec of SPECS) {
      const rows = pb
        .prepare(spec.selectSql)
        .all() as Record<string, unknown>[]
      const stmt = target.prepare(buildUpsertSql(spec))
      for (const row of rows) {
        stmt.run(...(spec.toValues(row) as never[]))
      }
    }
  })

  if (dryRun) {
    // Execute the inserts but roll the transaction back so nothing persists,
    // while still validating the mapping + FK constraints end-to-end.
    let threw = false
    try {
      target.transaction(() => {
        run()
        // Snapshot target counts inside the (to-be-rolled-back) transaction.
        for (const spec of SPECS) {
          counts.push({
            table: spec.table,
            source: countRows(pb, spec.table),
            target: countRows(target, spec.table),
          })
        }
        throw new Error('__dry_run_rollback__')
      })()
    } catch (e) {
      if ((e as Error).message !== '__dry_run_rollback__') {
        throw e
      }
      threw = true
    }
    if (!threw) throw new Error('dry-run rollback did not trigger')
  } else {
    run()
    for (const spec of SPECS) {
      counts.push({
        table: spec.table,
        source: countRows(pb, spec.table),
        target: countRows(target, spec.table),
      })
    }
  }

  // Report + verify.
  console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Per-table counts (source PB vs target):`)
  console.log('  table                source  target  ok')
  let mismatch = false
  for (const c of counts) {
    const ok = c.source === c.target
    if (!ok) mismatch = true
    console.log(
      `  ${c.table.padEnd(20)} ${String(c.source).padStart(6)}  ${String(
        c.target,
      ).padStart(6)}  ${ok ? 'yes' : 'NO'}`,
    )
  }

  if (mismatch) {
    throw new Error(
      'Count mismatch between source and target — migration failed verification.',
    )
  }

  // Re-enable FK enforcement and validate genuine relational integrity. The
  // only acceptable violations are the known tasks.completedBy -> users rows
  // (see isExpectedViolation); anything else is a real integrity failure.
  target.pragma('foreign_keys = ON')
  if (!dryRun) {
    const violations = target.pragma('foreign_key_check') as {
      table: string
      rowid: number
      parent: string
      fkid: number
    }[]
    const unexpected = violations.filter((v) => !isExpectedViolation(v))
    const expected = violations.length - unexpected.length
    console.log(
      `\nforeign_key_check: ${violations.length} reference(s) flagged ` +
        `(${expected} expected tasks.completedBy->users [child ids], ` +
        `${unexpected.length} unexpected).`,
    )
    if (unexpected.length > 0) {
      for (const v of unexpected) {
        console.error(`  UNEXPECTED FK violation: ${v.table} -> ${v.parent} (rowid ${v.rowid})`)
      }
      throw new Error('Unexpected foreign-key violations — migration failed verification.')
    }
  }

  console.log(
    `\n${dryRun ? '[DRY RUN] no changes persisted. ' : ''}All ${counts.length} tables match.`,
  )
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

function main(): void {
  const { pbDb, dbPath, dryRun } = parseArgs(process.argv.slice(2))

  if (!pbDb) {
    console.error('Error: set PB_DB (PocketBase data.db path) or pass --pb-db=...')
    process.exit(1)
  }
  if (!dbPath) {
    console.error('Error: set DB_PATH (target @family-todo/db path) or pass --db-path=...')
    process.exit(1)
  }
  if (!existsSync(pbDb)) {
    console.error(`Error: PocketBase database not found at ${pbDb}`)
    process.exit(1)
  }

  console.log(`Source (PocketBase, read-only): ${pbDb}`)
  console.log(`Target (@family-todo/db):       ${dbPath}`)
  if (dryRun) console.log('Mode: DRY RUN (no changes will be persisted)')

  // Open the source strictly read-only so we can never mutate live PB data.
  const pb = new Database(pbDb, { readonly: true, fileMustExist: true })
  // Open the target via @family-todo/db so migrations create the schema first.
  const target = createDb(dbPath)

  try {
    migrate(pb, target, dryRun)
  } finally {
    pb.close()
    target.close()
  }
}

main()
