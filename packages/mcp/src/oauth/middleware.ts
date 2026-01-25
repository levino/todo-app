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

// Debug logging - enable via DEBUG_MCP=true
const DEBUG = process.env.DEBUG_MCP === 'true'

function debugLog(category: string, message: string, data?: unknown) {
  if (!DEBUG) return
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] [DEBUG:${category}] ${message}`)
  if (data !== undefined) {
    console.log(JSON.stringify(data, null, 2))
  }
}

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://localhost:8090'

// Singleton admin PocketBase client
let adminPb: PocketBase | null = null
let lastAdminAuth: number = 0
const ADMIN_AUTH_TTL = 5 * 60 * 1000 // Re-auth every 5 minutes to be safe

/**
 * Get authenticated admin PocketBase client.
 * Re-authenticates if token is old or invalid.
 */
async function getAdminPb(): Promise<PocketBase> {
  const now = Date.now()
  const needsReauth = !adminPb || !adminPb.authStore.isValid || (now - lastAdminAuth) > ADMIN_AUTH_TTL

  if (needsReauth) {
    adminPb = new PocketBase(POCKETBASE_URL)
    const email = process.env.POCKETBASE_ADMIN_EMAIL || 'admin@test.local'
    const password = process.env.POCKETBASE_ADMIN_PASSWORD || 'testtest123'
    await adminPb.collection('_superusers').authWithPassword(email, password)
    lastAdminAuth = now
    console.log('[OAuth] Admin authenticated (fresh)')
  }

  return adminPb
}

/**
 * Force re-authentication of admin client.
 */
function clearAdminAuth(): void {
  adminPb = null
  lastAdminAuth = 0
}

/**
 * Impersonate a user via PocketBase admin API.
 * Returns a new PocketBase client authenticated as that user.
 */
async function impersonateUser(userId: string): Promise<PocketBase> {
  try {
    const admin = await getAdminPb()
    const userPb = await admin.collection('users').impersonate(userId, 3600)
    console.log(`[OAuth] Impersonated user: ${userPb.authStore.record?.id}, token valid: ${userPb.authStore.isValid}`)
    return userPb
  } catch (error) {
    // Admin token might be stale - clear and retry once
    console.log('[OAuth] Impersonation failed, refreshing admin auth...', error)
    clearAdminAuth()
    const admin = await getAdminPb()
    const userPb = await admin.collection('users').impersonate(userId, 3600)
    console.log(`[OAuth] Impersonated user (retry): ${userPb.authStore.record?.id}`)
    return userPb
  }
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
  debugLog('AUTH', 'JWT auth attempt', {
    authHeaderPresent: !!authHeader,
    authHeaderPrefix: authHeader?.substring(0, 20),
  })

  if (!authHeader?.startsWith('Bearer ')) {
    console.log(`[OAuth] Invalid auth header format`)
    debugLog('AUTH', 'Invalid auth header format', { authHeader })
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
  debugLog('AUTH', 'Verifying JWT', {
    tokenLength: token.length,
    tokenPrefix: token.substring(0, 50),
    issuer,
    audience,
  })

  // Verify JWT
  const claims = await verifyAccessToken(token, issuer, audience)
  if (!claims) {
    console.log(`[OAuth] JWT verification failed`)
    debugLog('AUTH', 'JWT verification FAILED', { tokenPrefix: token.substring(0, 100) })
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
  debugLog('AUTH', 'JWT verified successfully', { claims })

  try {
    // Impersonate the user
    const userPb = await impersonateUser(claims.sub)
    req.pb = userPb
    console.log(`[OAuth] Request authenticated for user ${claims.sub}`)
    debugLog('AUTH', 'User impersonated successfully', {
      userId: claims.sub,
      authStoreValid: userPb.authStore.isValid,
      authStoreRecordId: userPb.authStore.record?.id,
    })
    next()
  } catch (error) {
    console.error('Failed to impersonate user:', error)
    debugLog('AUTH', 'Impersonation FAILED', { error: String(error), userId: claims.sub })
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

  debugLog('AUTH', 'Flexible auth check', {
    hasBearerToken: authHeader?.startsWith('Bearer '),
    hasQueryToken: !!queryToken,
    path: req.path,
    method: req.method,
  })

  // Check for Bearer token first (OAuth JWT)
  if (authHeader?.startsWith('Bearer ')) {
    debugLog('AUTH', 'Using Bearer token (OAuth JWT)')
    return authenticateJWT(req, res, next)
  }

  // Fall back to query param token (PocketBase)
  if (queryToken) {
    debugLog('AUTH', 'Using query param token (PocketBase)')
    return authenticatePocketBase(req, res, next)
  }

  // No authentication provided
  debugLog('AUTH', 'No authentication provided')
  res.status(401).json({
    jsonrpc: '2.0',
    error: {
      code: -32600,
      message: 'Missing authentication. Use Bearer token header or token query parameter.',
    },
  })
}
