/**
 * E2E Test Setup
 *
 * Provides utilities for running full integration tests with:
 * - PocketBase: Started as child process with fresh data dir per test
 * - MCP Server: Imported programmatically, tested via Supertest
 * - Astro: Container API for rendering pages
 */

import { spawn, execSync, type ChildProcess } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import PocketBase from 'pocketbase'

// Paths
const POCKETBASE_BINARY = process.env.POCKETBASE_BINARY || 'pocketbase'
const MIGRATIONS_DIR = join(__dirname, '../../../../api/pocketbase/pb_migrations')

// State
let pocketbaseProcess: ChildProcess | null = null
let tempDataDir: string | null = null
let currentPort: number | null = null

/**
 * Get the current PocketBase URL
 */
export function getPocketBaseUrl(): string {
  if (!currentPort) throw new Error('PocketBase not started')
  return `http://127.0.0.1:${currentPort}`
}

/**
 * Start a fresh PocketBase instance with migrations
 */
export async function startPocketBase(
  port: number,
  adminEmail = 'admin@test.local',
  adminPassword = 'testtest123'
): Promise<string> {
  // Create temp directory for this test's data
  tempDataDir = mkdtempSync(join(tmpdir(), 'pb-test-'))
  currentPort = port

  const url = `http://127.0.0.1:${port}`

  // 1. Run migrations up (offline)
  execSync(`${POCKETBASE_BINARY} migrate up --dir ${tempDataDir} --migrationsDir ${MIGRATIONS_DIR}`, {
    stdio: 'pipe',
  })

  // 2. Create admin user (offline via CLI)
  execSync(`${POCKETBASE_BINARY} superuser upsert ${adminEmail} ${adminPassword} --dir ${tempDataDir}`, {
    stdio: 'pipe',
  })

  // 3. Start PocketBase
  pocketbaseProcess = spawn(POCKETBASE_BINARY, [
    'serve',
    '--http', `127.0.0.1:${port}`,
    '--dir', tempDataDir,
    '--migrationsDir', MIGRATIONS_DIR,
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  // Log errors for debugging
  pocketbaseProcess.stderr?.on('data', (data) => {
    const msg = data.toString()
    if (!msg.includes('Server started')) {
      console.error('[PocketBase]', msg)
    }
  })

  // Wait for PocketBase to be ready
  await waitForPocketBase(url)

  return url
}

/**
 * Wait for PocketBase to be ready
 */
async function waitForPocketBase(url: string, maxAttempts = 30): Promise<void> {
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

/**
 * Stop PocketBase and cleanup temp directory
 */
export function stopPocketBase(): void {
  if (pocketbaseProcess) {
    pocketbaseProcess.kill()
    pocketbaseProcess = null
  }
  if (tempDataDir) {
    rmSync(tempDataDir, { recursive: true, force: true })
    tempDataDir = null
  }
  currentPort = null
}

/**
 * Create a test user and return authenticated PocketBase clients
 */
export async function createTestUser(
  url: string,
  adminEmail = 'admin@test.local',
  adminPassword = 'testtest123'
): Promise<{
  adminPb: PocketBase
  userPb: PocketBase
  userId: string
  userEmail: string
}> {
  const adminPb = new PocketBase(url)
  await adminPb.collection('_superusers').authWithPassword(adminEmail, adminPassword)

  const email = `test-${Date.now()}@example.com`
  const user = await adminPb.collection('users').create({
    email,
    password: adminPassword,
    passwordConfirm: adminPassword,
  })

  const userPb = new PocketBase(url)
  await userPb.collection('users').authWithPassword(email, adminPassword)

  return {
    adminPb,
    userPb,
    userId: user.id,
    userEmail: email,
  }
}

/**
 * Create test group with user membership
 */
export async function createTestGroup(
  adminPb: PocketBase,
  userId: string,
  name = 'Test Family'
): Promise<string> {
  const group = await adminPb.collection('groups').create({ name })
  await adminPb.collection('user_groups').create({
    user: userId,
    group: group.id,
  })
  return group.id
}

/**
 * Create test child in group
 */
export async function createTestChild(
  adminPb: PocketBase,
  groupId: string,
  name = 'Max',
  color = '#4DABF7'
): Promise<string> {
  const child = await adminPb.collection('children').create({
    name,
    group: groupId,
    color,
  })
  return child.id
}
