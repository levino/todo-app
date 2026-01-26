/**
 * Integration Test Setup for MCP
 *
 * Per test: migrate up → start PocketBase → run test → stop PocketBase → migrate down
 */

import { spawn, execSync, type ChildProcess } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, afterEach, inject } from 'vitest'

let pocketbaseProcess: ChildProcess | null = null
let tempDataDir: string | null = null
let currentPocketbaseUrl: string | null = null

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
  const binary = inject('pocketbaseBinary')
  const migrationsDir = inject('migrationsDir')
  const port = inject('testPort')
  const adminEmail = inject('adminEmail')
  const adminPassword = inject('adminPassword')

  // Create fresh data dir
  tempDataDir = mkdtempSync(join(tmpdir(), 'pb-mcp-test-'))
  currentPocketbaseUrl = `http://127.0.0.1:${port}`

  // 1. Migrate up (offline)
  execSync(`${binary} migrate up --dir ${tempDataDir} --migrationsDir ${migrationsDir}`, {
    stdio: 'pipe',
  })

  // 2. Create admin user (offline)
  execSync(`${binary} superuser upsert ${adminEmail} ${adminPassword} --dir ${tempDataDir}`, {
    stdio: 'pipe',
  })

  // 3. Start PocketBase
  pocketbaseProcess = spawn(binary, [
    'serve',
    '--http', `127.0.0.1:${port}`,
    '--dir', tempDataDir,
    '--migrationsDir', migrationsDir,
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  await waitForPocketBase(currentPocketbaseUrl)

  // Set environment variables for tests that still use them
  process.env.POCKETBASE_URL = currentPocketbaseUrl
  process.env.POCKETBASE_ADMIN_EMAIL = adminEmail
  process.env.POCKETBASE_ADMIN_PASSWORD = adminPassword
  process.env.NODE_ENV = 'test'
})

afterEach(async () => {
  const binary = inject('pocketbaseBinary')
  const migrationsDir = inject('migrationsDir')

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
      execSync(`${binary} migrate down 999 --dir ${tempDataDir} --migrationsDir ${migrationsDir}`, {
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

// Export for tests to use
export function getPocketbaseUrl(): string {
  if (!currentPocketbaseUrl) throw new Error('PocketBase not running')
  return currentPocketbaseUrl
}
