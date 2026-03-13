/**
 * OAuth 2.0 Grants Endpoint
 *
 * Lists and revokes user-client grants (MCP connections).
 */

import { Router } from 'express'
import { listGrants, revokeGrant } from '../db.js'

const router = Router()

/**
 * GET /oauth/grants?user_id=...
 *
 * List active grants for a user.
 */
router.get('/', (req, res) => {
  const userId = req.query.user_id as string | undefined

  if (!userId) {
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'Missing required parameter: user_id',
    })
    return
  }

  const grants = listGrants(userId)
  res.json(grants)
})

/**
 * DELETE /oauth/grants/:clientId?user_id=...
 *
 * Revoke a grant for a specific client.
 */
router.delete('/:clientId', (req, res) => {
  const { clientId } = req.params
  const userId = req.query.user_id as string | undefined

  if (!userId) {
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'Missing required parameter: user_id',
    })
    return
  }

  const revoked = revokeGrant(userId, clientId)

  if (!revoked) {
    res.status(404).json({
      error: 'not_found',
      error_description: 'No active grant found',
    })
    return
  }

  res.json({ success: true })
})

export default router
