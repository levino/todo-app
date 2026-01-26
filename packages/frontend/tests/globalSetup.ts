/**
 * Global Setup for Integration Tests
 *
 * Starts PocketBase once before all tests, stops it after.
 */

import { spawn, execSync, type ChildProcess } from 'child_process'
import { rm } from 'fs/promises'
import { join } from 'path'

const POCKETBASE_URL = 'http://127.0.0.1:8090'
const DATA_DIR = join(__dirname, '../../api/pocketbase/pb_data')
const MIGRATIONS_DIR = join(__dirname, '../../api/pocketbase/pb_migrations')
const ADMIN_EMAIL = 'admin@test.local'
const ADMIN_PASSWORD = 'testtest123'

let pocketbaseProcess: ChildProcess | null = null

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
  // Clean slate - delete old data
  await rm(DATA_DIR, { recursive: true, force: true })

  // Run migrations
  execSync(`pocketbase migrate up --dir ${DATA_DIR} --migrationsDir ${MIGRATIONS_DIR}`, {
    stdio: 'pipe',
  })

  // Create admin user
  execSync(`pocketbase superuser upsert ${ADMIN_EMAIL} ${ADMIN_PASSWORD} --dir ${DATA_DIR}`, {
    stdio: 'pipe',
  })

  // Start PocketBase server
  pocketbaseProcess = spawn('pocketbase', [
    'serve',
    '--http', '127.0.0.1:8090',
    '--dir', DATA_DIR,
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
}
