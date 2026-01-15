/**
 * Vitest Setup File
 *
 * Sets environment variables required for integration tests.
 * Tests run against a real PocketBase instance (per project rules).
 */

// Set required environment variables before modules are loaded
process.env.POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'
process.env.POCKETBASE_ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL || 'admin@test.local'
process.env.POCKETBASE_ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD || 'testtest123'
process.env.NODE_ENV = 'test'
