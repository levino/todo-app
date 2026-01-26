/**
 * Global Setup for Integration Tests
 *
 * Starts PocketBase once before all tests, stops it after.
 * Uses a temp directory for test data to avoid conflicts with dev PocketBase.
 */

import { spawn, execSync, type ChildProcess } from 'child_process'
import { rm } from 'fs/promises'
import { mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const POCKETBASE_URL = 'http://127.0.0.1:8090'
const MIGRATIONS_DIR = join(__dirname, '../../api/pocketbase/pb_migrations')
const ADMIN_EMAIL = 'admin@test.local'
const ADMIN_PASSWORD = 'testtest123'

let pocketbaseProcess: ChildProcess | null = null
let tempDataDir: string | null = null

async function waitForPocketBase(maxAttempts = 50): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${POCKETBASE_URL}/api/health`)
      if (response.ok) return
    } catch {
      // Not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('PocketBase failed to start')
}

export async function setup() {
  // Create temp directory for test data
  tempDataDir = mkdtempSync(join(tmpdir(), 'pb-test-'))

  // Run migrations
  execSync(`pocketbase migrate up --dir ${tempDataDir} --migrationsDir ${MIGRATIONS_DIR}`, {
    stdio: 'pipe',
  })

  // Create admin user
  execSync(`pocketbase superuser upsert ${ADMIN_EMAIL} ${ADMIN_PASSWORD} --dir ${tempDataDir}`, {
    stdio: 'pipe',
  })

  // Start PocketBase server
  pocketbaseProcess = spawn('pocketbase', [
    'serve',
    '--http', '127.0.0.1:8090',
    '--dir', tempDataDir,
    '--migrationsDir', MIGRATIONS_DIR,
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  await waitForPocketBase()
}

export async function teardown() {
  if (pocketbaseProcess) {
    pocketbaseProcess.kill()
    pocketbaseProcess = null
  }

  // Clean up temp directory
  if (tempDataDir) {
    await rm(tempDataDir, { recursive: true, force: true })
    tempDataDir = null
  }
}
