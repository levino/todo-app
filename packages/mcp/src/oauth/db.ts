/**
 * OAuth 2.0 Database Module
 *
 * Uses SQLite (better-sqlite3) for storing OAuth clients and authorization codes.
 * This is separate from PocketBase to keep OAuth concerns isolated.
 */

import Database from 'better-sqlite3'
import { randomUUID, randomBytes } from 'node:crypto'
import { mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import bcrypt from 'bcryptjs'

let db: Database.Database | null = null

export interface OAuthClient {
  client_id: string
  client_name: string | null
  redirect_uris: string[]
  created_at: number
}

export interface OAuthClientWithSecret extends OAuthClient {
  client_secret: string
}

interface OAuthClientRow {
  client_id: string
  client_secret_hash: string
  client_name: string | null
  redirect_uris: string
  created_at: number
}

export interface AuthorizationCode {
  code: string
  client_id: string
  user_id: string
  redirect_uri: string
  code_challenge: string
  expires_at: number
  used_at: number | null
  created_at: number
}

interface AuthorizationCodeRow {
  code: string
  client_id: string
  user_id: string
  redirect_uri: string
  code_challenge: string
  expires_at: number
  used_at: number | null
  created_at: number
}

/**
 * Initialize the OAuth database with required tables.
 * Creates the database file if it doesn't exist.
 */
export function initOAuthDb(dbPath: string = './data/oauth.db'): Database.Database {
  if (db) {
    return db
  }

  // Ensure the directory exists
  const dir = dirname(dbPath)
  if (dir && dir !== '.' && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  db = new Database(dbPath)

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL')

  // Create oauth_clients table
  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_clients (
      client_id TEXT PRIMARY KEY,
      client_secret_hash TEXT NOT NULL,
      client_name TEXT,
      redirect_uris TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `)

  // Create oauth_authorization_codes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
      code TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      code_challenge TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id)
    )
  `)

  // Index for cleanup of expired codes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_auth_codes_expires
    ON oauth_authorization_codes(expires_at)
  `)

  return db
}

/**
 * Get the database instance. Must call initOAuthDb first.
 */
export function getDb(): Database.Database {
  if (!db) {
    throw new Error('OAuth database not initialized. Call initOAuthDb first.')
  }
  return db
}

/**
 * Close the database connection.
 */
export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}

/**
 * Create a new OAuth client.
 * Returns the client with the plain-text secret (only time it's available).
 */
export function createClient(
  clientName: string | null,
  redirectUris: string[]
): OAuthClientWithSecret {
  const database = getDb()

  const clientId = randomUUID()
  const clientSecret = randomBytes(32).toString('base64url')
  const clientSecretHash = bcrypt.hashSync(clientSecret, 10)
  const now = Math.floor(Date.now() / 1000)

  const stmt = database.prepare(`
    INSERT INTO oauth_clients (client_id, client_secret_hash, client_name, redirect_uris, created_at)
    VALUES (?, ?, ?, ?, ?)
  `)

  stmt.run(clientId, clientSecretHash, clientName, JSON.stringify(redirectUris), now)

  return {
    client_id: clientId,
    client_secret: clientSecret,
    client_name: clientName,
    redirect_uris: redirectUris,
    created_at: now,
  }
}

/**
 * Get a client by ID (without secret).
 */
export function getClient(clientId: string): OAuthClient | null {
  const database = getDb()

  const stmt = database.prepare<[string], OAuthClientRow>(`
    SELECT client_id, client_name, redirect_uris, created_at
    FROM oauth_clients
    WHERE client_id = ?
  `)

  const row = stmt.get(clientId)
  if (!row) {
    return null
  }

  return {
    client_id: row.client_id,
    client_name: row.client_name,
    redirect_uris: JSON.parse(row.redirect_uris) as string[],
    created_at: row.created_at,
  }
}

/**
 * Validate client credentials.
 * Returns the client if valid, null otherwise.
 */
export function validateClient(clientId: string, clientSecret: string): OAuthClient | null {
  const database = getDb()

  const stmt = database.prepare<[string], OAuthClientRow>(`
    SELECT client_id, client_secret_hash, client_name, redirect_uris, created_at
    FROM oauth_clients
    WHERE client_id = ?
  `)

  const row = stmt.get(clientId)
  if (!row) {
    return null
  }

  const valid = bcrypt.compareSync(clientSecret, row.client_secret_hash)
  if (!valid) {
    return null
  }

  return {
    client_id: row.client_id,
    client_name: row.client_name,
    redirect_uris: JSON.parse(row.redirect_uris) as string[],
    created_at: row.created_at,
  }
}

/**
 * Delete a client and all associated authorization codes.
 */
export function deleteClient(clientId: string): boolean {
  const database = getDb()

  // Delete associated authorization codes first
  database.prepare(`DELETE FROM oauth_authorization_codes WHERE client_id = ?`).run(clientId)

  // Delete the client
  const result = database.prepare(`DELETE FROM oauth_clients WHERE client_id = ?`).run(clientId)

  return result.changes > 0
}

/**
 * Save an authorization code.
 * Codes expire after 10 minutes by default.
 */
export function saveAuthCode(
  clientId: string,
  userId: string,
  redirectUri: string,
  codeChallenge: string,
  expiresInSeconds: number = 600
): string {
  const database = getDb()

  const code = randomBytes(32).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + expiresInSeconds

  const stmt = database.prepare(`
    INSERT INTO oauth_authorization_codes
    (code, client_id, user_id, redirect_uri, code_challenge, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  stmt.run(code, clientId, userId, redirectUri, codeChallenge, expiresAt, now)

  return code
}

/**
 * Get and consume an authorization code.
 * Returns null if code doesn't exist, is expired, or was already used.
 * Marks the code as used atomically.
 */
export function consumeAuthCode(code: string): AuthorizationCode | null {
  const database = getDb()
  const now = Math.floor(Date.now() / 1000)

  // Use a transaction to atomically check and mark as used
  const transaction = database.transaction(() => {
    const stmt = database.prepare<[string], AuthorizationCodeRow>(`
      SELECT code, client_id, user_id, redirect_uri, code_challenge, expires_at, used_at, created_at
      FROM oauth_authorization_codes
      WHERE code = ?
    `)

    const row = stmt.get(code)
    if (!row) {
      return null
    }

    // Check if expired
    if (row.expires_at < now) {
      return null
    }

    // Check if already used
    if (row.used_at !== null) {
      return null
    }

    // Mark as used
    database.prepare(`UPDATE oauth_authorization_codes SET used_at = ? WHERE code = ?`).run(now, code)

    return row as AuthorizationCode
  })

  return transaction()
}

/**
 * Clean up expired authorization codes.
 * Should be called periodically.
 */
export function cleanupExpiredCodes(): number {
  const database = getDb()
  const now = Math.floor(Date.now() / 1000)

  const result = database.prepare(`
    DELETE FROM oauth_authorization_codes WHERE expires_at < ?
  `).run(now)

  return result.changes
}
