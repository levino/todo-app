/**
 * SQLite connection + migration runner for the Family Todo data layer.
 *
 * Uses better-sqlite3 (synchronous). Frontend and MCP run as separate
 * processes sharing one SQLite file on a single volume, hence WAL mode and a
 * busy_timeout. Style mirrors packages/mcp/src/oauth/db.ts.
 */

import Database from 'better-sqlite3'
import { mkdirSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type DB = Database.Database

let singleton: DB | null = null

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Locate the migrations directory. Works both from src/ (tests via vitest) and
 * from dist/ (compiled), since `migrations/` ships at the package root.
 */
function findMigrationsDir(): string {
  // src/connection.ts -> ../migrations ; dist/connection.js -> ../migrations
  const candidate = join(__dirname, '..', 'migrations')
  if (existsSync(candidate)) return candidate
  // Fallback for nested dist layouts.
  const candidate2 = join(__dirname, '..', '..', 'migrations')
  if (existsSync(candidate2)) return candidate2
  throw new Error(`Could not locate migrations directory (looked in ${candidate})`)
}

/**
 * Apply the standard pragmas to a connection. Called on every open.
 */
function applyPragmas(db: DB): void {
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  db.pragma('foreign_keys = ON')
}

/**
 * Run any pending numbered migrations from the migrations/ directory, in order.
 * Applied migrations are tracked in the schema_migrations table. Each migration
 * file is executed inside a transaction.
 */
export function runMigrations(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)

  const dir = findMigrationsDir()
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  const isApplied = db.prepare<[string], { name: string }>(
    'SELECT name FROM schema_migrations WHERE name = ?',
  )
  const markApplied = db.prepare(
    'INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)',
  )

  for (const file of files) {
    if (isApplied.get(file)) continue
    const sql = readFileSync(join(dir, file), 'utf8')
    const apply = db.transaction(() => {
      db.exec(sql)
      markApplied.run(file, new Date().toISOString())
    })
    apply()
  }
}

/**
 * Open a brand-new connection at `path`, apply pragmas, and run migrations.
 * Does NOT touch the singleton. Use for tests or for explicitly managed
 * connections. Pass ':memory:' for an in-memory database.
 */
export function createDb(path: string): DB {
  if (path !== ':memory:') {
    const dir = dirname(path)
    if (dir && dir !== '.' && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }
  const db = new Database(path)
  applyPragmas(db)
  runMigrations(db)
  return db
}

/**
 * Get the process-wide singleton connection, opening it on first use. The path
 * comes from the DB_PATH env var (default ./data/app.db).
 */
export function getDb(): DB {
  if (singleton) return singleton
  const path = process.env.DB_PATH || './data/app.db'
  singleton = createDb(path)
  return singleton
}

/**
 * Test helper: close and discard the singleton, then reopen a fresh in-memory
 * database as the new singleton. Returns the new connection.
 */
export function resetDb(): DB {
  if (singleton) {
    singleton.close()
    singleton = null
  }
  singleton = createDb(':memory:')
  return singleton
}

/**
 * Close the singleton connection (if any). Mainly for test teardown.
 */
export function closeDb(): void {
  if (singleton) {
    singleton.close()
    singleton = null
  }
}
