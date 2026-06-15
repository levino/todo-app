/**
 * Integration Test Setup
 *
 * The app's data store is the `@family-todo/db` SQLite layer. Before each test
 * we reset the process-wide singleton to a fresh in-memory database (schema +
 * view created by the package's migrations), giving every test a clean slate —
 * the same isolation the old PocketBase "clear all collections" setup provided.
 *
 * Tests seed data through the PocketBase-compatible shim (tests/pb-shim.ts),
 * which writes to this exact connection, so the rendered pages (which read
 * `locals.db` = this singleton) observe the seeded data identically.
 */

import { beforeEach } from 'vitest'
import { resetDb } from '@family-todo/db'

beforeEach(() => {
  // Fresh in-memory DB as the new singleton for this test.
  resetDb()
})
