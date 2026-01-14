/**
 * OAuth 2.0 Token Endpoint
 *
 * Exchanges authorization codes for access tokens.
 */

import { Router } from 'express'
import { validateClient, consumeAuthCode } from '../db.js'
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
 * Exchange authorization code for access token.
 * Supports:
 * - grant_type=authorization_code
 * - PKCE verification (code_verifier)
 * - Client auth via Basic header or body params
 */
router.post('/', async (req, res) => {
  const { grant_type, code, redirect_uri, code_verifier } = req.body

  // Validate grant type
  if (grant_type !== 'authorization_code') {
    res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: 'Only authorization_code grant type is supported',
    })
    return
  }

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

  // Get client credentials
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
  if (authCode.client_id !== credentials.clientId) {
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

  // Generate access token
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

  // Return token response (RFC 6749)
  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
  })
})

export default router
