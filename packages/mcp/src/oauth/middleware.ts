/**
 * OAuth 2.0 JWT Authentication Middleware
 *
 * Verifies Bearer tokens and impersonates users via PocketBase admin.
 */

import type { Request, Response, NextFunction } from 'express'
import PocketBase from 'pocketbase'
import { verifyAccessToken } from './jwt.js'

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://localhost:8090'

// Singleton admin PocketBase client
let adminPb: PocketBase | null = null

/**
 * Get authenticated admin PocketBase client.
 * Creates once and reuses. Only re-authenticates if token is invalid.
 */
async function getAdminPb(): Promise<PocketBase> {
  if (!adminPb) {
    adminPb = new PocketBase(POCKETBASE_URL)
  }

  if (!adminPb.authStore.isValid) {
    const email = process.env.POCKETBASE_ADMIN_EMAIL || 'admin@test.local'
    const password = process.env.POCKETBASE_ADMIN_PASSWORD || 'testtest123'
    await adminPb.collection('_superusers').authWithPassword(email, password)
    console.log('[OAuth] Admin authenticated')
  }

  return adminPb
}

/**
 * Impersonate a user via PocketBase admin API.
 * Returns a new PocketBase client authenticated as that user.
 */
async function impersonateUser(userId: string): Promise<PocketBase> {
  const admin = await getAdminPb()

  // Use PocketBase impersonation API
  // Duration in seconds (3600 = 1 hour)
  const impersonateResult = await admin.collection('users').impersonate(userId, 3600)

  // Create new PocketBase instance with impersonated token
  const userPb = new PocketBase(POCKETBASE_URL)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = impersonateResult as any
  userPb.authStore.save(result.token, result.record)

  return userPb
}

/**
 * JWT authentication middleware.
 * Verifies Bearer token and attaches impersonated PocketBase client to request.
 */
export async function authenticateJWT(
  req: Request & { pb?: PocketBase },
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: 'Missing or invalid Authorization header. Use Bearer token.',
      },
    })
    return
  }

  const token = authHeader.slice(7)
  const issuer = process.env.OAUTH_ISSUER || 'http://localhost:3001'
  const audience = 'family-todo-mcp'

  // Verify JWT
  const claims = await verifyAccessToken(token, issuer, audience)
  if (!claims) {
    res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: 'Invalid or expired access token',
      },
    })
    return
  }

  try {
    // Impersonate the user
    const userPb = await impersonateUser(claims.sub)
    req.pb = userPb
    next()
  } catch (error) {
    console.error('Failed to impersonate user:', error)
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Failed to authenticate user',
      },
    })
  }
}

/**
 * Middleware that requires OAuth Bearer token authentication.
 * Legacy query parameter auth has been removed.
 */
export const authenticateFlexible = authenticateJWT
