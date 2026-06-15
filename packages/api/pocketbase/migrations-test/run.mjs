#!/usr/bin/env node
/**
 * Migration tests against a POPULATED database.
 *
 * Running migrations against an empty database is NOT a real test. These tests
 * boot the *exact* PocketBase version used in production, seed representative
 * production-like data on the schema as it exists BEFORE the migration under
 * test, then apply the remaining migrations and assert the data was upgraded
 * correctly.
 *
 * This must run in CI on every change. Never verify migrations by hand.
 *
 * Strategy (two phase, sharing one pb_data volume):
 *   Phase 1: start PocketBase with only the migrations BEFORE the "cut" file,
 *            then seed legacy/representative data via the REST API.
 *   Phase 2: start PocketBase again with ALL migrations (which applies the
 *            migration under test against the populated DB), then assert.
 *
 * To cover a new data migration, add a scenario to SCENARIOS below.
 *
 * No npm dependencies: uses Node's global fetch + the docker CLI.
 */

import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Keep in sync with packages/api/pocketbase/Dockerfile (POCKETBASE_VERSION).
const PB_IMAGE = 'ghcr.io/muchobien/pocketbase:0.39.0'
const PORT = 8390
const BASE = `http://127.0.0.1:${PORT}`
const ADMIN_EMAIL = 'admin@test.local'
const ADMIN_PASSWORD = 'testtest123'

const here = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(here, '..', 'pb_migrations')

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const docker = (...args) => sh('docker', args)
const dockerQuiet = (...args) => {
  try {
    return sh('docker', args)
  } catch {
    return ''
  }
}

async function waitHealthy() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`)
      if (res.ok) return
    } catch {}
    await sleep(1000)
  }
  throw new Error('PocketBase did not become healthy in time')
}

async function adminToken() {
  const res = await fetch(`${BASE}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  })
  if (!res.ok) throw new Error(`admin auth failed: ${res.status} ${await res.text()}`)
  return (await res.json()).token
}

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`)
  return text ? JSON.parse(text) : {}
}

function assert(cond, message) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${message}`)
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Each scenario tests one (data) migration against populated data.
 *  - cut:    the migration file under test. Phase 1 applies everything BEFORE
 *            this file; Phase 2 applies everything (including it and later).
 *  - seed:   populate the DB at the pre-migration schema.
 *  - assert: verify the post-migration data.
 */
const SCENARIOS = [
  {
    name: '1780000000_normalize_recurrence_days: legacy weekday encoding -> canonical',
    cut: '1780000000_normalize_recurrence_days.js',
    async seed(token) {
      const group = await api(token, 'POST', '/api/collections/groups/records', { name: 'MigFam' })
      const child = await api(token, 'POST', '/api/collections/children/records', {
        name: 'K',
        color: '#FF6B6B',
        group: group.id,
      })
      const cases = [
        { title: 'sunday-7', recurrenceDays: [7] },
        { title: 'sunday-0-7', recurrenceDays: [0, 7] },
        { title: 'dup', recurrenceDays: [1, 1, 2] },
        { title: 'canonical', recurrenceDays: [2, 3, 4, 5, 6] },
        { title: 'out-of-range', recurrenceDays: [1, 9] },
      ]
      for (const c of cases) {
        await api(token, 'POST', '/api/collections/tasks/records', {
          title: c.title,
          child: child.id,
          timeOfDay: 'morning',
          completed: false,
          recurrenceType: 'weekly',
          recurrenceDays: c.recurrenceDays,
        })
      }
    },
    async assert(token) {
      const { items } = await api(token, 'GET', '/api/collections/tasks/records?perPage=200')
      const byTitle = Object.fromEntries(items.map((r) => [r.title, r.recurrenceDays]))
      assert(items.length === 5, `expected 5 tasks, got ${items.length}`)
      assert(deepEqual(byTitle['sunday-7'], [0]), `sunday-7 -> ${JSON.stringify(byTitle['sunday-7'])}`)
      assert(deepEqual(byTitle['sunday-0-7'], [0]), `sunday-0-7 -> ${JSON.stringify(byTitle['sunday-0-7'])}`)
      assert(deepEqual(byTitle['dup'], [1, 2]), `dup -> ${JSON.stringify(byTitle['dup'])}`)
      assert(
        deepEqual(byTitle['canonical'], [2, 3, 4, 5, 6]),
        `canonical -> ${JSON.stringify(byTitle['canonical'])}`,
      )
      assert(deepEqual(byTitle['out-of-range'], [1]), `out-of-range -> ${JSON.stringify(byTitle['out-of-range'])}`)

      // The later schema migration (dailyOnly + view column) must also be present.
      assert(
        Object.hasOwn(items[0], 'dailyOnly'),
        'tasks.dailyOnly field missing after migrations',
      )
      const view = await api(token, 'GET', '/api/collections/tasks_page_view/records?perPage=1')
      if (view.items.length > 0) {
        assert(
          Object.hasOwn(view.items[0], 'task_daily_only'),
          'tasks_page_view.task_daily_only column missing after migrations',
        )
      }
    },
  },
]

function migrationFilesBefore(cut) {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.js'))
    .filter((f) => f < cut)
    .sort()
}

async function runScenario(scenario) {
  const stamp = Date.now()
  const container = `pbmigtest-${stamp}`
  const volume = `pbmigtest-vol-${stamp}`
  const subsetDir = mkdtempSync(join(tmpdir(), 'pbmigsubset-'))

  const cleanup = () => {
    dockerQuiet('rm', '-f', container)
    dockerQuiet('volume', 'rm', volume)
    try {
      rmSync(subsetDir, { recursive: true, force: true })
    } catch {}
  }

  try {
    // Build the "pre-migration" subset of migration files.
    for (const f of migrationFilesBefore(scenario.cut)) {
      cpSync(join(MIGRATIONS_DIR, f), join(subsetDir, f))
    }

    // ---- Phase 1: seed populated data on the pre-migration schema ----
    docker(
      'run', '-d', '--name', container,
      '-p', `${PORT}:8090`,
      '-e', `PB_ADMIN_EMAIL=${ADMIN_EMAIL}`,
      '-e', `PB_ADMIN_PASSWORD=${ADMIN_PASSWORD}`,
      '-v', `${subsetDir}:/pb_migrations`,
      '-v', `${volume}:/pb_data`,
      PB_IMAGE, '--migrationsDir=/pb_migrations',
    )
    await waitHealthy()
    await scenario.seed(await adminToken())
    docker('rm', '-f', container)

    // ---- Phase 2: apply ALL migrations (incl. the one under test) ----
    docker(
      'run', '-d', '--name', container,
      '-p', `${PORT}:8090`,
      '-e', `PB_ADMIN_EMAIL=${ADMIN_EMAIL}`,
      '-e', `PB_ADMIN_PASSWORD=${ADMIN_PASSWORD}`,
      '-v', `${MIGRATIONS_DIR}:/pb_migrations`,
      '-v', `${volume}:/pb_data`,
      PB_IMAGE, '--migrationsDir=/pb_migrations',
    )
    await waitHealthy()
    await scenario.assert(await adminToken())

    console.log(`  ✓ ${scenario.name}`)
  } finally {
    cleanup()
  }
}

async function main() {
  console.log(`Running migration tests on populated DB (${PB_IMAGE})`)
  let failed = 0
  for (const scenario of SCENARIOS) {
    try {
      await runScenario(scenario)
    } catch (err) {
      failed++
      console.error(`  ✗ ${scenario.name}\n    ${err.message}`)
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} migration test(s) failed.`)
    process.exit(1)
  }
  console.log('\nAll migration tests passed.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
