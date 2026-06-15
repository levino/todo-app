/**
 * Vitest Setup File
 *
 * Sets environment variables required for integration tests.
 * Tests run against an in-memory @family-todo/db SQLite database (reset per
 * test via resetDb()), replacing the previous real-PocketBase backend.
 */

// Set required environment variables before modules are loaded
process.env.OAUTH_ISSUER = process.env.OAUTH_ISSUER || 'http://localhost:3001'
process.env.NODE_ENV = 'test'
