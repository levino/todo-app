/**
 * OAuth 2.0 JWT Authentication Middleware
 *
 * Supports two authentication methods:
 * 1. Bearer token (OAuth JWT) - Verifies JWT and impersonates user via PocketBase admin
 * 2. Query param token (PocketBase) - Direct PocketBase authentication token
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
  // The impersonate() method returns a fully authenticated PocketBase client
  const userPb = await admin.collection('users').impersonate(userId, 3600)

  console.log(`[OAuth] Impersonated user: ${userPb.authStore.record?.id}, token valid: ${userPb.authStore.isValid}`)

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
  console.log(`[OAuth] Auth header: ${authHeader ? authHeader.substring(0, 50) + '...' : 'MISSING'}`)

  if (!authHeader?.startsWith('Bearer ')) {
    console.log(`[OAuth] Invalid auth header format`)
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

  console.log(`[OAuth] Verifying JWT, issuer=${issuer}`)

  // Verify JWT
  const claims = await verifyAccessToken(token, issuer, audience)
  if (!claims) {
    console.log(`[OAuth] JWT verification failed`)
    res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: 'Invalid or expired access token',
      },
    })
    return
  }

  console.log(`[OAuth] JWT verified, sub=${claims.sub}`)

  try {
    // Impersonate the user
    const userPb = await impersonateUser(claims.sub)
    req.pb = userPb
    console.log(`[OAuth] Request authenticated for user ${claims.sub}`)
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
 * PocketBase token authentication middleware.
 * Validates a PocketBase token (from query param) and creates authenticated client.
 */
export async function authenticatePocketBase(
  req: Request & { pb?: PocketBase },
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.query.token as string | undefined

  if (!token) {
    res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: 'Missing token query parameter',
      },
    })
    return
  }

  // Create PocketBase client and save the token
  const pb = new PocketBase(POCKETBASE_URL)
  pb.authStore.save(token, null)

  // Validate the token by refreshing auth
  try {
    const authData = await pb.collection('users').authRefresh()
    // After refresh, authStore.record should be populated
    console.log(`[PB Auth] Token validated for user ${authData.record.id}`)
    req.pb = pb
    next()
  } catch (error) {
    console.log(`[PB Auth] Invalid token: ${error}`)
    res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: 'Invalid or expired PocketBase token',
      },
    })
  }
}

/**
 * Flexible authentication middleware.
 * Supports both Bearer token (OAuth JWT) and query param token (PocketBase).
 *
 * Priority:
 * 1. Bearer token in Authorization header → OAuth JWT flow
 * 2. Query param token → PocketBase direct auth
 */
export async function authenticateFlexible(
  req: Request & { pb?: PocketBase },
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization
  const queryToken = req.query.token as string | undefined

  // Check for Bearer token first (OAuth JWT)
  if (authHeader?.startsWith('Bearer ')) {
    return authenticateJWT(req, res, next)
  }

  // Fall back to query param token (PocketBase)
  if (queryToken) {
    return authenticatePocketBase(req, res, next)
  }

  // No authentication provided
  res.status(401).json({
    jsonrpc: '2.0',
    error: {
      code: -32600,
      message: 'Missing authentication. Use Bearer token header or token query parameter.',
    },
  })
}
