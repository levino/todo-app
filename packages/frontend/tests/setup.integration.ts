/**
 * Integration Test Setup
 *
 * Per test: migrate up → start PocketBase → run test → stop PocketBase → migrate down
 *
 * Exports ready-to-use PocketBase instances for tests.
 */

import { EventSource } from 'eventsource'
// @ts-expect-error Polyfill EventSource for PocketBase subscriptions in Node.js
globalThis.EventSource = EventSource

import { spawn, execSync, type ChildProcess } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import PocketBase from 'pocketbase'
import { beforeEach, afterEach } from 'vitest'
import { resetPocketBase } from '../src/lib/pocketbase'

// Test configuration
const config = {
  pocketbaseBinary: process.env.POCKETBASE_BINARY || 'pocketbase',
  migrationsDir: join(__dirname, '../../api/pocketbase/pb_migrations'),
  testPort: 18090,
  adminEmail: 'admin@test.local',
  adminPassword: 'testtest123',
}

// State
let pocketbaseProcess: ChildProcess | null = null
let tempDataDir: string | null = null
let currentPocketbaseUrl: string | null = null

// Exported for tests - set fresh in beforeEach
export let pocketbaseUrl: string
export let adminPb: PocketBase

async function waitForPocketBase(url: string, maxAttempts = 50): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${url}/api/health`)
      if (response.ok) return
    } catch {
      // Not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('PocketBase failed to start')
}

beforeEach(async () => {
  const { pocketbaseBinary, migrationsDir, testPort, adminEmail, adminPassword } = config

  // Create fresh data dir
  tempDataDir = mkdtempSync(join(tmpdir(), 'pb-test-'))
  currentPocketbaseUrl = `http://127.0.0.1:${testPort}`
  pocketbaseUrl = currentPocketbaseUrl

  // 1. Migrate up (offline)
  execSync(`${pocketbaseBinary} migrate up --dir ${tempDataDir} --migrationsDir ${migrationsDir}`, {
    stdio: 'pipe',
  })

  // 2. Create admin user (offline)
  execSync(`${pocketbaseBinary} superuser upsert ${adminEmail} ${adminPassword} --dir ${tempDataDir}`, {
    stdio: 'pipe',
  })

  // 3. Start PocketBase
  pocketbaseProcess = spawn(pocketbaseBinary, [
    'serve',
    '--http', `127.0.0.1:${testPort}`,
    '--dir', tempDataDir,
    '--migrationsDir', migrationsDir,
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  await waitForPocketBase(currentPocketbaseUrl)

  // 4. Create authenticated admin client
  adminPb = new PocketBase(currentPocketbaseUrl)
  await adminPb.collection('_superusers').authWithPassword(adminEmail, adminPassword)

  // Reset singleton so tests get fresh connection
  resetPocketBase()
})

afterEach(async () => {
  const { pocketbaseBinary, migrationsDir } = config

  // 4. Stop PocketBase
  if (pocketbaseProcess) {
    pocketbaseProcess.kill()
    pocketbaseProcess = null
  }

  // Wait a bit for process to fully stop
  await new Promise(resolve => setTimeout(resolve, 100))

  // 5. Migrate down (offline)
  if (tempDataDir) {
    try {
      execSync(`${pocketbaseBinary} migrate down 999 --dir ${tempDataDir} --migrationsDir ${migrationsDir}`, {
        stdio: 'pipe',
      })
    } catch {
      // Ignore errors during cleanup
    }

    // Cleanup temp dir
    rmSync(tempDataDir, { recursive: true, force: true })
    tempDataDir = null
  }

  currentPocketbaseUrl = null
})

// Legacy export for gradual migration
export function getPocketbaseUrl(): string {
  if (!currentPocketbaseUrl) throw new Error('PocketBase not running')
  return currentPocketbaseUrl
}

// Re-export config for tests that need it
export { config as testConfig }
