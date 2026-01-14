/**
 * OAuth 2.0 JWT Authentication Middleware
 *
 * Verifies Bearer tokens and impersonates users via PocketBase admin.
 */

import type { Request, Response, NextFunction } from 'express'
import PocketBase from 'pocketbase'
import { verifyAccessToken } from './jwt.js'

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://localhost:8090'

// Admin PocketBase client (initialized lazily)
let adminPb: PocketBase | null = null

/**
 * Get or create authenticated admin PocketBase client.
 */
async function getAdminPb(): Promise<PocketBase> {
  if (adminPb?.authStore.isValid) {
    return adminPb
  }

  const email = process.env.POCKETBASE_ADMIN_EMAIL || 'admin@test.local'
  const password = process.env.POCKETBASE_ADMIN_PASSWORD || 'testtest123'

  adminPb = new PocketBase(POCKETBASE_URL)
  await adminPb.collection('_superusers').authWithPassword(email, password)

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
  userPb.authStore.save(impersonateResult.token, impersonateResult.record)

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
 * Combined middleware that accepts either:
 * - Bearer JWT token (OAuth 2.0)
 * - Query parameter token (legacy PocketBase token)
 */
export async function authenticateFlexible(
  req: Request & { pb?: PocketBase },
  res: Response,
  next: NextFunction
): Promise<void> {
  // Try Bearer token first
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    return authenticateJWT(req, res, next)
  }

  // Fall back to query parameter (legacy)
  const queryToken = req.query.token as string | undefined
  if (queryToken) {
    const pb = new PocketBase(POCKETBASE_URL)
    try {
      pb.authStore.save(queryToken, { id: '', email: '' })
      await pb.collection('users').authRefresh()
      req.pb = pb
      next()
      return
    } catch {
      res.status(401).json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid authentication token',
        },
      })
      return
    }
  }

  // No authentication provided
  res.status(401).json({
    jsonrpc: '2.0',
    error: {
      code: -32600,
      message: 'Missing authentication. Use Bearer token or ?token= query parameter',
    },
  })
}
