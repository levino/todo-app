/**
 * OAuth 2.0 Authorization Code Generation Endpoint (Internal API)
 *
 * Called by Astro frontend after user grants consent.
 * Generates an authorization code that can be exchanged for a token.
 */

import { Router } from 'express'
import { z } from 'zod'
import { getClient, saveAuthCode } from '../db.js'

const router = Router()

/**
 * Request schema for authorization code generation
 */
const AuthorizeRequestSchema = z.object({
  client_id: z.string(),
  redirect_uri: z.string().url(),
  code_challenge: z.string().min(43), // S256 challenges are 43 chars
  user_id: z.string(),
  state: z.string().optional(),
})

/**
 * POST /oauth/authorize
 *
 * Generate an authorization code after user consent.
 * This is an internal API called by the Astro frontend.
 *
 * The frontend handles:
 * - User authentication
 * - Consent UI
 * - Validating client_id exists
 *
 * This endpoint:
 * - Validates redirect_uri matches client's registered URIs
 * - Generates authorization code
 * - Returns the redirect URL with code
 */
router.post('/', (req, res) => {
  // Validate request body
  const parsed = AuthorizeRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({
      error: 'invalid_request',
      error_description: parsed.error.errors.map((e) => `${e.path}: ${e.message}`).join(', '),
    })
    return
  }

  const { client_id, redirect_uri, code_challenge, user_id, state } = parsed.data

  // Get client to validate redirect_uri
  const client = getClient(client_id)
  if (!client) {
    res.status(400).json({
      error: 'invalid_client',
      error_description: 'Client not found',
    })
    return
  }

  // Validate redirect_uri is registered for this client
  if (!client.redirect_uris.includes(redirect_uri)) {
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'redirect_uri is not registered for this client',
    })
    return
  }

  // Generate authorization code
  const code = saveAuthCode(client_id, user_id, redirect_uri, code_challenge)

  // Build redirect URL
  const redirectUrl = new URL(redirect_uri)
  redirectUrl.searchParams.set('code', code)
  if (state) {
    redirectUrl.searchParams.set('state', state)
  }

  res.json({
    redirect_url: redirectUrl.toString(),
    code,
  })
})

export default router
