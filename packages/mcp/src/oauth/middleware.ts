/**
 * OAuth 2.0 JWT Authentication Middleware
 *
 * Verifies Bearer token (OAuth JWT) and impersonates user via PocketBase admin.
 */

import type { Request, Response, NextFunction } from 'express'
import PocketBase from 'pocketbase'
import { verifyAccessToken } from './jwt.js'

/**
 * Configuration for auth middleware
 */
export interface AuthConfig {
  pocketbaseUrl: string
  adminEmail: string
  adminPassword: string
  oauthIssuer: string
}

/**
 * Create auth middleware with injected config
 */
export function createAuthMiddleware(config: AuthConfig) {
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
      adminPb = new PocketBase(config.pocketbaseUrl)
      await adminPb.collection('_superusers').authWithPassword(config.adminEmail, config.adminPassword)
      lastAdminAuth = now
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
      return await admin.collection('users').impersonate(userId, 3600)
    } catch {
      // Admin token might be stale - clear and retry once
      clearAdminAuth()
      const admin = await getAdminPb()
      return await admin.collection('users').impersonate(userId, 3600)
    }
  }

  /**
   * JWT authentication middleware.
   * Verifies Bearer token and attaches impersonated PocketBase client to request.
   */
  async function authenticateJWT(
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
    const audience = 'family-todo-mcp'

    // Verify JWT
    const claims = await verifyAccessToken(token, config.oauthIssuer, audience)
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

  return {
    authenticateJWT,
  }
}

// Default middleware using environment variables (for backwards compatibility)
const defaultConfig: AuthConfig = {
  pocketbaseUrl: process.env.POCKETBASE_URL || 'http://localhost:8090',
  adminEmail: process.env.POCKETBASE_ADMIN_EMAIL || 'admin@test.local',
  adminPassword: process.env.POCKETBASE_ADMIN_PASSWORD || 'testtest123',
  oauthIssuer: process.env.OAUTH_ISSUER || 'http://localhost:3001',
}

const defaultMiddleware = createAuthMiddleware(defaultConfig)

export const authenticateJWT = defaultMiddleware.authenticateJWT
