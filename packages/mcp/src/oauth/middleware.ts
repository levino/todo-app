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
import { isGrantActive } from './db.js'

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
  }

  return adminPb
}

/**
 * Impersonate a user via PocketBase admin API.
 * Returns a new PocketBase client authenticated as that user.
 */
async function impersonateUser(userId: string): Promise<PocketBase> {
  const admin = await getAdminPb()
  return admin.collection('users').impersonate(userId, 15768000)
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

  if (claims.client_id && !isGrantActive(claims.sub, claims.client_id)) {
    res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: 'Grant has been revoked. Re-authorize to continue.',
      },
    })
    return
  }

  try {
    const userPb = await impersonateUser(claims.sub)
    req.pb = userPb
    next()
  } catch {
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

  const pb = new PocketBase(POCKETBASE_URL)
  pb.authStore.save(token, null)

  try {
    await pb.collection('users').authRefresh()
    req.pb = pb
    next()
  } catch {
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
 */
export async function authenticateFlexible(
  req: Request & { pb?: PocketBase },
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization
  const queryToken = req.query.token as string | undefined

  if (authHeader?.startsWith('Bearer ')) {
    return authenticateJWT(req, res, next)
  }

  if (queryToken) {
    return authenticatePocketBase(req, res, next)
  }

  res.status(401).json({
    jsonrpc: '2.0',
    error: {
      code: -32600,
      message: 'Missing authentication. Use Bearer token header or token query parameter.',
    },
  })
}
