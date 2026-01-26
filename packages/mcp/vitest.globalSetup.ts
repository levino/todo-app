/**
 * Global Setup for MCP Integration Tests
 *
 * Provides PocketBase binary path and migrations dir to tests.
 * Each test will start its own fresh PocketBase instance.
 */

import { join } from 'path'
import type { TestProject } from 'vitest/node'

const POCKETBASE_BINARY = process.env.POCKETBASE_BINARY || 'pocketbase'
const MIGRATIONS_DIR = join(__dirname, '../api/pocketbase/pb_migrations')
const TEST_PORT = 18091 // Different port from frontend tests

export default async function setup(project: TestProject): Promise<void> {
  project.provide('pocketbaseBinary', POCKETBASE_BINARY)
  project.provide('migrationsDir', MIGRATIONS_DIR)
  project.provide('testPort', TEST_PORT)
  project.provide('adminEmail', 'admin@test.local')
  project.provide('adminPassword', 'testtest123')

  console.log('[MCP GlobalSetup] Config provided to tests')
}

// Type declarations for inject()
declare module 'vitest' {
  export interface ProvidedContext {
    pocketbaseBinary: string
    migrationsDir: string
    testPort: number
    adminEmail: string
    adminPassword: string
  }
}
