/**
 * PocketBase-compatible test shim backed by the `@family-todo/db` SQLite layer.
 *
 * The integration tests were written against a live PocketBase server: they seed
 * data with `pb.collection('x').create({...})` and pass the per-user `pb`
 * instance as `locals.pb`. The app no longer uses PocketBase — pages read the
 * SQLite connection from `locals.db`. To preserve every test's assertions and
 * coverage verbatim, this shim re-implements the exact subset of the PocketBase
 * client SDK the tests use (`collection().create/getOne/update/delete/getList/
 * getFullList/authWithPassword`), translating to raw SQL against an in-memory
 * `@family-todo/db` connection. The shim writes to the SAME db the pages read,
 * so seeding through the shim is observed by the rendered pages identically to
 * how PocketBase data used to be.
 *
 * PocketBase relation field names (group/child/user/reward/task) are mapped to
 * the SQL `*_id` columns; booleans map to 0/1; the `tasks_page_view` is read
 * through the real SQL view.
 */

import type { DB } from '@family-todo/db'
import { generateId } from '@family-todo/db'
import { ensureTodosTable } from '../src/lib/todos'

interface AuthRecord {
  id: string
  email?: string
  [k: string]: unknown
}

/**
 * Loosely-typed record returned by the shim, matching how the tests consume
 * PocketBase's `RecordModel` (free property access like `task.title`,
 * `group.id`). Mirrors the dynamic shape the PocketBase SDK exposed.
 */
// biome-ignore lint/suspicious/noExplicitAny: dynamic record shape (PB parity)
export type PbRecord = { id: string } & Record<string, any>

// Map a collection name to its SQL table and the PB-field → column renames.
const FIELD_MAP: Record<string, Record<string, string>> = {
  children: { group: 'group_id' },
  user_groups: { user: 'user_id', group: 'group_id' },
  tasks: { child: 'child_id' },
  rewards: { group: 'group_id' },
  point_transactions: { child: 'child_id', reward: 'reward_id', task: 'task_id' },
}

const BOOL_FIELDS: Record<string, Set<string>> = {
  tasks: new Set(['completed', 'isChore', 'dailyOnly', 'isProject']),
  todos: new Set(['completed']),
}

const now = () => new Date().toISOString()

// Per-db flag emulating the PocketBase "tasks.timeOfDay is optional" schema
// state the migration test toggles. When optional, a task created without a
// timeOfDay is stored as '' (PB's empty default) rather than the SQL column
// default 'afternoon', so the migration assertions hold. Keyed by db so it
// resets automatically with each test's fresh in-memory database.
const timeOfDayOptional = new WeakMap<DB, boolean>()

const mapField = (collection: string, field: string): string =>
  FIELD_MAP[collection]?.[field] ?? field

// tasks_page_view boolean columns + text columns whose SQL NULL PocketBase
// surfaced as the empty string '' (the frontend's TasksPageViewRow shape).
const VIEW_BOOL = new Set([
  'task_completed',
  'task_is_chore',
  'task_daily_only',
  'task_is_project',
])
const VIEW_TEXT = new Set([
  'task_id',
  'task_title',
  'task_time_of_day',
  'task_due_date',
  'task_completed_at',
  'task_last_completed_at',
  'task_recurrence_type',
  'task_deferred_until',
])

/**
 * Decode a stored row into the PocketBase-shaped record the tests/pages expect:
 * 0/1 ints → booleans for the collection's boolean fields. The `tasks_page_view`
 * additionally mirrors PocketBase: NULL text columns become '' and a NULL points
 * balance becomes 0.
 */
function decodeRow(collection: string, row: Record<string, unknown> | undefined) {
  if (!row) return row

  if (collection === 'tasks_page_view') {
    const out: Record<string, unknown> = { ...row }
    for (const f of VIEW_BOOL) if (f in out) out[f] = !!out[f]
    for (const f of VIEW_TEXT) if (f in out && out[f] == null) out[f] = ''
    if ('child_points_balance' in out && out.child_points_balance == null) {
      out.child_points_balance = 0
    }
    return out
  }

  const bools = BOOL_FIELDS[collection]
  const out: Record<string, unknown> = { ...row }
  if (bools) {
    for (const f of bools) {
      if (f in out) out[f] = !!out[f]
    }
  }
  // PocketBase surfaced empty relation/optional-text columns as '' rather than
  // SQL NULL. The tasks tests assert these are '' after an undo, so mirror that
  // (populated values are real strings and unaffected).
  if (collection === 'tasks') {
    for (const f of ['completedBy', 'completedAt', 'lastCompletedAt', 'previousDueDate']) {
      if (out[f] == null) out[f] = ''
    }
  }
  return out
}

/** Encode a write value for a column (booleans → 0/1, undefined → null). */
function encodeValue(collection: string, field: string, value: unknown): unknown {
  if (BOOL_FIELDS[collection]?.has(field)) return value ? 1 : 0
  if (value === undefined) return null
  return value
}

/**
 * Parse the tiny subset of PB filter expressions the tests use:
 *   field = "value"  |  field = true/false  |  joined by " && "
 * Returns a SQL WHERE clause (with `?` placeholders) + params, using mapped
 * column names for the given collection.
 */
function parseFilter(
  collection: string,
  filter: string | undefined,
): { where: string; params: unknown[] } {
  if (!filter) return { where: '', params: [] }
  const clauses: string[] = []
  const params: unknown[] = []
  for (const part of filter.split('&&')) {
    const m = part.trim().match(/^(\w+)\s*=\s*(.+)$/)
    if (!m) continue
    const [, rawField, rawVal] = m
    const col = mapField(collection, rawField)
    const v = rawVal.trim()
    if (v === 'true' || v === 'false') {
      clauses.push(`${col} = ?`)
      params.push(v === 'true' ? 1 : 0)
    } else {
      const str = v.replace(/^["']|["']$/g, '')
      clauses.push(`${col} = ?`)
      params.push(str)
    }
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

class Collection<T extends { id: string } = PbRecord> {
  constructor(
    private db: DB,
    private name: string,
    private store: AuthStore,
  ) {
    if (this.name === 'todos') ensureTodosTable(this.db)
  }

  // ---- auth (no-op identity bookkeeping; tests only assert .record) --------
  async authWithPassword(emailOrIdentity: string, _password: string) {
    if (this.name === '_superusers') {
      this.store.record = { id: 'superuser', email: emailOrIdentity }
      return { record: this.store.record }
    }
    // Look up the (already-created) user by email.
    const row = this.db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(emailOrIdentity) as AuthRecord | undefined
    if (!row) throw new Error(`auth failed: no user ${emailOrIdentity}`)
    this.store.record = row
    return { record: row }
  }

  // ---- create --------------------------------------------------------------
  async create(data: Record<string, unknown>) {
    if (this.name === 'users') {
      const id = generateId()
      const ts = now()
      this.db
        .prepare('INSERT INTO users (id, email, name, created, updated) VALUES (?, ?, ?, ?, ?)')
        .run(id, data.email, (data.name as string) ?? null, ts, ts)
      return this.getOne(id)
    }

    const ts = now()
    const cols: string[] = ['id', 'created', 'updated']
    const vals: unknown[] = [generateId(), ts, ts]
    for (const [k, v] of Object.entries(data)) {
      if (k === 'password' || k === 'passwordConfirm') continue
      const col = mapField(this.name, k)
      cols.push(col)
      const encoded = encodeValue(this.name, col, v)
      vals.push(col === 'completedBy' ? this.normalizeCompletedBy(encoded) : encoded)
    }
    // Emulate the PB "optional timeOfDay" default ('') when the field is omitted.
    if (
      this.name === 'tasks' &&
      !cols.includes('timeOfDay') &&
      timeOfDayOptional.get(this.db)
    ) {
      cols.push('timeOfDay')
      vals.push('')
    }
    const placeholders = cols.map(() => '?').join(', ')
    this.db
      .prepare(`INSERT INTO ${this.name} (${cols.join(', ')}) VALUES (${placeholders})`)
      .run(...(vals as never[]))
    return this.getOne(vals[0] as string)
  }

  // ---- getOne --------------------------------------------------------------
  async getOne(id: string): Promise<T> {
    const row = this.db.prepare(`SELECT * FROM ${this.name} WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined
    if (!row) throw new Error(`not found: ${this.name}/${id}`)
    return decodeRow(this.name, row) as T
  }

  /**
   * `completedBy` is a real FK to users(id). PocketBase's relation accepted any
   * string (the app posts a child id); SQLite enforces the FK. Mirror the lib's
   * normalisation: keep a value only if it is an existing user, else store NULL.
   */
  private normalizeCompletedBy(value: unknown): unknown {
    if (this.name !== 'tasks') return value
    if (value == null || value === '') return null
    const u = this.db.prepare('SELECT id FROM users WHERE id = ?').get(value)
    return u ? value : null
  }

  // ---- update --------------------------------------------------------------
  async update(id: string, data: Record<string, unknown>) {
    const sets: string[] = []
    const vals: unknown[] = []
    for (const [k, v] of Object.entries(data)) {
      const col = mapField(this.name, k)
      sets.push(`${col} = ?`)
      const encoded = encodeValue(this.name, col, v)
      vals.push(col === 'completedBy' ? this.normalizeCompletedBy(encoded) : encoded)
    }
    sets.push('updated = ?')
    vals.push(now())
    vals.push(id)
    this.db.prepare(`UPDATE ${this.name} SET ${sets.join(', ')} WHERE id = ?`).run(...(vals as never[]))
    return this.getOne(id)
  }

  // ---- delete --------------------------------------------------------------
  async delete(id: string) {
    this.db.prepare(`DELETE FROM ${this.name} WHERE id = ?`).run(id)
    return true
  }

  // ---- getFullList ---------------------------------------------------------
  async getFullList(opts?: { filter?: string; sort?: string }) {
    const { where, params } = parseFilter(this.name, opts?.filter)
    const order = this.sortClause(opts?.sort)
    const rows = this.db
      .prepare(`SELECT * FROM ${this.name} ${where} ${order}`)
      .all(...(params as never[])) as Record<string, unknown>[]
    return rows.map((r) => decodeRow(this.name, r)) as Record<string, unknown>[]
  }

  // ---- getList -------------------------------------------------------------
  async getList(_page = 1, _perPage = 30, opts?: { filter?: string; sort?: string }) {
    const items = await this.getFullList(opts)
    return { items, totalItems: items.length, page: _page, perPage: _perPage }
  }

  private sortClause(sort?: string): string {
    if (!sort) return ''
    const desc = sort.startsWith('-')
    const field = mapField(this.name, desc ? sort.slice(1) : sort)
    return `ORDER BY ${field} ${desc ? 'DESC' : 'ASC'}`
  }
}

interface AuthStore {
  record: AuthRecord | null
  /** Present for shape-compatibility with tests reading `authStore.token`. */
  token: string
}

interface CollectionsApi {
  getOne(name: string): Promise<{ id: string; fields: { name: string; required: boolean }[] }>
  update(
    id: string,
    data: { fields: { name: string; required?: boolean }[] },
  ): Promise<void>
}

export interface PbShim {
  db: DB
  authStore: AuthStore
  collection(name: string): Collection
  /** Schema admin API subset used by the timeOfDay migration test. */
  collections: CollectionsApi
  /** Raw request escape hatch used by the migration test (no-op here). */
  send(path: string, init?: unknown): Promise<unknown>
}

/**
 * Create a PocketBase-compatible shim bound to the given SQLite connection.
 * Multiple shims (e.g. adminPb + userPb) can share one `db` so data created by
 * one is visible to the others and to the rendered pages via `locals.db`.
 */
export function createPbShim(db: DB): PbShim {
  const authStore: AuthStore = { record: null, token: 'test-token' }
  const collections: CollectionsApi = {
    async getOne(_name: string) {
      return {
        id: 'tasks',
        fields: [{ name: 'timeOfDay', required: !timeOfDayOptional.get(db) }],
      }
    },
    async update(_id: string, data: { fields: { name: string; required?: boolean }[] }) {
      const tod = data.fields.find((f) => f.name === 'timeOfDay')
      if (tod) timeOfDayOptional.set(db, tod.required === false)
    },
  }
  return {
    db,
    authStore,
    collections,
    async send() {
      // The migration test always provides a `.catch()` fallback that performs
      // the migration via the collection API, so a rejecting stub is correct
      // (there is no PocketBase batch/SQL endpoint to hit).
      throw new Error('pb-shim: send() not supported')
    },
    collection(name: string) {
      return new Collection(db, name, authStore)
    },
  }
}
