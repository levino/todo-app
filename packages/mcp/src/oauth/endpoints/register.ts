/**
 * OAuth 2.0 Dynamic Client Registration (RFC 7591)
 *
 * Allows clients to register themselves and receive credentials.
 */

import { Router } from 'express'
import { z } from 'zod'
import { createClient } from '../db.js'

const router = Router()

/**
 * Request schema for client registration
 */
const RegisterRequestSchema = z.object({
  client_name: z.string().optional(),
  redirect_uris: z.array(z.string().url()).min(1),
  grant_types: z.array(z.string()).optional().default(['authorization_code']),
  token_endpoint_auth_method: z.enum(['client_secret_basic', 'client_secret_post']).optional().default('client_secret_basic'),
})

/**
 * POST /oauth/register
 *
 * Register a new OAuth client.
 * Returns client credentials (client_id and client_secret).
 */
router.post('/', (req, res) => {
  // Validate request body
  const parsed = RegisterRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({
      error: 'invalid_client_metadata',
      error_description: parsed.error.errors.map((e) => e.message).join(', '),
    })
    return
  }

  const { client_name, redirect_uris, grant_types, token_endpoint_auth_method } = parsed.data

  // Only authorization_code grant is supported
  if (!grant_types.includes('authorization_code')) {
    res.status(400).json({
      error: 'invalid_client_metadata',
      error_description: 'Only authorization_code grant type is supported',
    })
    return
  }

  // Create the client
  const client = createClient(client_name || null, redirect_uris)

  // Return registration response (RFC 7591)
  res.status(201).json({
    client_id: client.client_id,
    client_secret: client.client_secret,
    client_id_issued_at: client.created_at,
    client_name: client.client_name,
    redirect_uris: client.redirect_uris,
    grant_types: ['authorization_code'],
    token_endpoint_auth_method,
  })
})

export default router
