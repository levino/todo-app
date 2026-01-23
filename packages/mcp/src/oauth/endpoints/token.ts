/**
 * OAuth 2.0 Token Endpoint
 *
 * Supports:
 * - grant_type=authorization_code: Exchange auth code for access + refresh token
 * - grant_type=refresh_token: Exchange refresh token for new access + refresh token
 */

import { Router } from 'express'
import { validateClient, consumeAuthCode, saveRefreshToken, consumeRefreshToken } from '../db.js'
import { signAccessToken, verifyCodeChallenge } from '../jwt.js'

const router = Router()

/**
 * Parse client credentials from request.
 * Supports both Basic auth header and body parameters.
 */
function getClientCredentials(req: {
  headers: { authorization?: string }
  body: { client_id?: string; client_secret?: string }
}): { clientId: string; clientSecret: string } | null {
  // Try Basic auth header first
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Basic ')) {
    const encoded = authHeader.slice(6)
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8')
    const [clientId, clientSecret] = decoded.split(':')
    if (clientId && clientSecret) {
      return { clientId, clientSecret }
    }
  }

  // Fall back to body parameters
  const { client_id, client_secret } = req.body
  if (client_id && client_secret) {
    return { clientId: client_id, clientSecret: client_secret }
  }

  return null
}

/**
 * POST /oauth/token
 *
 * Token endpoint supporting multiple grant types.
 */
router.post('/', async (req, res) => {
  const { grant_type } = req.body

  // Get client credentials (required for all grant types)
  const credentials = getClientCredentials(req)
  if (!credentials) {
    res.status(401).json({
      error: 'invalid_client',
      error_description: 'Client authentication failed',
    })
    return
  }

  // Validate client
  const client = validateClient(credentials.clientId, credentials.clientSecret)
  if (!client) {
    res.status(401).json({
      error: 'invalid_client',
      error_description: 'Client authentication failed',
    })
    return
  }

  // Route to appropriate handler based on grant type
  if (grant_type === 'authorization_code') {
    await handleAuthorizationCodeGrant(req, res, credentials.clientId)
  } else if (grant_type === 'refresh_token') {
    await handleRefreshTokenGrant(req, res, credentials.clientId)
  } else {
    res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: 'Supported grant types: authorization_code, refresh_token',
    })
  }
})

/**
 * Handle authorization_code grant type.
 * Exchanges authorization code for access token + refresh token.
 */
async function handleAuthorizationCodeGrant(
  req: { body: { code?: string; redirect_uri?: string; code_verifier?: string } },
  res: {
    status: (code: number) => { json: (body: unknown) => void }
    json: (body: unknown) => void
  },
  clientId: string
): Promise<void> {
  const { code, redirect_uri, code_verifier } = req.body

  // Validate required parameters
  if (!code) {
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'Missing required parameter: code',
    })
    return
  }

  if (!redirect_uri) {
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'Missing required parameter: redirect_uri',
    })
    return
  }

  if (!code_verifier) {
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'Missing required parameter: code_verifier (PKCE required)',
    })
    return
  }

  // Consume authorization code (atomically marks as used)
  const authCode = consumeAuthCode(code)
  if (!authCode) {
    res.status(400).json({
      error: 'invalid_grant',
      error_description: 'Invalid, expired, or already used authorization code',
    })
    return
  }

  // Verify the code belongs to this client
  if (authCode.client_id !== clientId) {
    res.status(400).json({
      error: 'invalid_grant',
      error_description: 'Authorization code was not issued to this client',
    })
    return
  }

  // Verify redirect_uri matches
  if (authCode.redirect_uri !== redirect_uri) {
    res.status(400).json({
      error: 'invalid_grant',
      error_description: 'redirect_uri does not match the authorization request',
    })
    return
  }

  // Verify PKCE code challenge
  const pkceValid = await verifyCodeChallenge(code_verifier, authCode.code_challenge)
  if (!pkceValid) {
    res.status(400).json({
      error: 'invalid_grant',
      error_description: 'PKCE verification failed',
    })
    return
  }

  // Generate tokens
  const issuer = process.env.OAUTH_ISSUER || 'http://localhost:3001'
  const audience = 'family-todo-mcp'
  const expiresIn = 3600 // 1 hour

  const accessToken = await signAccessToken(
    {
      sub: authCode.user_id,
      client_id: authCode.client_id,
      scope: 'mcp:tools',
    },
    issuer,
    audience,
    expiresIn
  )

  // Generate refresh token
  const refreshToken = saveRefreshToken(clientId, authCode.user_id)

  // Return token response (RFC 6749)
  res.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
  })
}

/**
 * Handle refresh_token grant type.
 * Exchanges refresh token for new access token + new refresh token (rotation).
 */
async function handleRefreshTokenGrant(
  req: { body: { refresh_token?: string } },
  res: {
    status: (code: number) => { json: (body: unknown) => void }
    json: (body: unknown) => void
  },
  clientId: string
): Promise<void> {
  const { refresh_token } = req.body

  // Validate required parameters
  if (!refresh_token) {
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'Missing required parameter: refresh_token',
    })
    return
  }

  // Consume refresh token (atomically revokes it)
  const tokenData = consumeRefreshToken(refresh_token)
  if (!tokenData) {
    res.status(400).json({
      error: 'invalid_grant',
      error_description: 'Invalid, expired, or revoked refresh token',
    })
    return
  }

  // Verify the token belongs to this client
  if (tokenData.client_id !== clientId) {
    res.status(400).json({
      error: 'invalid_grant',
      error_description: 'Refresh token was not issued to this client',
    })
    return
  }

  // Generate new tokens
  const issuer = process.env.OAUTH_ISSUER || 'http://localhost:3001'
  const audience = 'family-todo-mcp'
  const expiresIn = 3600 // 1 hour

  const accessToken = await signAccessToken(
    {
      sub: tokenData.user_id,
      client_id: tokenData.client_id,
      scope: 'mcp:tools',
    },
    issuer,
    audience,
    expiresIn
  )

  // Generate new refresh token (rotation)
  const newRefreshToken = saveRefreshToken(clientId, tokenData.user_id)

  // Return token response
  res.json({
    access_token: accessToken,
    refresh_token: newRefreshToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
  })
}

export default router
