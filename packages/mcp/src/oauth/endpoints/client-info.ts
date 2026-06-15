/**
 * OAuth Client Info Endpoint (Internal API)
 *
 * Used by Astro frontend to validate client_id during authorization.
 */

import { Router } from 'express'
import { getClient } from '../db.js'

const router = Router()

/**
 * GET /oauth/client/:clientId
 *
 * Get client information by ID.
 * This is an internal API for the frontend to validate client_id.
 * Does not return the client secret.
 */
router.get('/:clientId', (req, res) => {
  const { clientId } = req.params

  const client = getClient(clientId)
  if (!client) {
    res.status(404).json({
      error: 'invalid_client',
      error_description: 'Client not found',
    })
    return
  }

  res.json({
    client_id: client.client_id,
    client_name: client.client_name,
    redirect_uris: client.redirect_uris,
  })
})

export default router
