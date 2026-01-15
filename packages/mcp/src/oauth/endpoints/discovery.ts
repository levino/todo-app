/**
 * OAuth 2.0 Discovery Endpoints (RFC 8414)
 *
 * Provides metadata about the OAuth authorization server.
 */

import { Router } from 'express'
import { getJWKS } from '../jwt.js'

const router = Router()

/**
 * Get OAuth configuration from environment.
 */
function getConfig() {
  const issuer = process.env.OAUTH_ISSUER || 'http://localhost:3001'
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4321'

  return {
    issuer,
    frontendUrl,
  }
}

/**
 * GET /.well-known/oauth-authorization-server
 *
 * Returns OAuth 2.0 Authorization Server Metadata (RFC 8414)
 */
router.get('/oauth-authorization-server', (_req, res) => {
  const { issuer, frontendUrl } = getConfig()

  res.json({
    issuer,
    authorization_endpoint: `${frontendUrl}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['mcp:tools'],
  })
})

/**
 * GET /.well-known/jwks.json
 *
 * Returns the JSON Web Key Set containing the public key for JWT verification.
 */
router.get('/jwks.json', (_req, res) => {
  const jwks = getJWKS()
  res.json(jwks)
})

/**
 * GET /.well-known/oauth-protected-resource
 *
 * Returns OAuth 2.0 Protected Resource Metadata (RFC 8707)
 * This tells clients where to find the authorization server.
 */
router.get('/oauth-protected-resource', (_req, res) => {
  const { issuer } = getConfig()

  res.json({
    resource: issuer,
    authorization_servers: [issuer],
    scopes_supported: ['mcp:tools'],
    bearer_methods_supported: ['header'],
  })
})

export default router
