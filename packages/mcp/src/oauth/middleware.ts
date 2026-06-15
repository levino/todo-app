/**
 * OAuth 2.0 JWT Authentication Middleware
 *
 * Supports two authentication methods:
 * 1. Bearer token (OAuth JWT) - Verifies the MCP's own JWT and loads the app
 *    user identified by the `sub` claim from @family-todo/db.
 * 2. Query param token - the app user id (from @family-todo/db). Used by the
 *    frontend / tests as a direct authentication shortcut.
 *
 * In both cases the resolved app user id is attached to the request as `userId`
 * (alongside the shared `db` connection) and tool handlers scope queries to the
 * groups that user belongs to. There is no PocketBase impersonation anymore.
 */

import type { Request, Response, NextFunction } from 'express'
import { getDb, getUserById, type DB } from '@family-todo/db'
import { verifyAccessToken } from './jwt.js'
import { isGrantActive } from './db.js'

/**
 * Request augmented with the shared app DB connection and the authenticated
 * app user id. Tool handlers read these instead of a PocketBase client.
 */
export interface AuthedRequest extends Request {
  db?: DB
  userId?: string
}

/**
 * JWT authentication middleware.
 * Verifies the Bearer token, checks the grant is still active, then loads the
 * app user named by the `sub` claim and attaches { db, userId } to the request.
 */
export async function authenticateJWT(
  req: AuthedRequest,
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
    const db = getDb()
    const user = getUserById(db, claims.sub)
    if (!user) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid or expired access token',
        },
      })
      return
    }
    req.db = db
    req.userId = user.id
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
 * Query-param token authentication middleware.
 * The token is the app user id (from @family-todo/db). Validates that a user
 * with that id exists and creates the authenticated context.
 */
export async function authenticateQueryToken(
  req: AuthedRequest,
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

  try {
    const db = getDb()
    const user = getUserById(db, token)
    if (!user) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid or expired token',
        },
      })
      return
    }
    req.db = db
    req.userId = user.id
    next()
  } catch {
    res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: 'Invalid or expired token',
      },
    })
  }
}

/**
 * Flexible authentication middleware.
 * Supports both Bearer token (OAuth JWT) and query param token (app user id).
 */
export async function authenticateFlexible(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization
  const queryToken = req.query.token as string | undefined

  if (authHeader?.startsWith('Bearer ')) {
    return authenticateJWT(req, res, next)
  }

  if (queryToken) {
    return authenticateQueryToken(req, res, next)
  }

  res.status(401).json({
    jsonrpc: '2.0',
    error: {
      code: -32600,
      message: 'Missing authentication. Use Bearer token header or token query parameter.',
    },
  })
}
