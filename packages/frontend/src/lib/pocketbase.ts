/**
 * PocketBase Client
 *
 * Provides a configured PocketBase client instance for use throughout the app.
 */

import PocketBase from 'pocketbase'

/**
 * Get the PocketBase URL at runtime.
 * Throws if not set - there is no sensible default.
 */
export function getPocketBaseUrl(): string {
  const url =
    process.env.POCKETBASE_URL ||
    import.meta.env.POCKETBASE_URL ||
    import.meta.env.SERVICE_URL_POCKETBASE

  if (!url) {
    throw new Error(
      'POCKETBASE_URL environment variable is not set. ' +
        'Set it via POCKETBASE_URL, import.meta.env.POCKETBASE_URL, or SERVICE_URL_POCKETBASE.'
    )
  }

  return url
}

/**
 * Create a new PocketBase client instance
 */
export function createPocketBase(): PocketBase {
  return new PocketBase(getPocketBaseUrl())
}

/**
 * Singleton client for server-side usage
 */
let _pb: PocketBase | null = null

export function getPocketBase(): PocketBase {
  if (!_pb) {
    _pb = createPocketBase()
  }
  return _pb
}

/**
 * Reset the singleton (useful for testing)
 */
export function resetPocketBase(): void {
  _pb = null
}

/**
 * Get the public PocketBase URL for client-side usage.
 * This is the URL that browsers can access directly.
 */
export function getPublicPocketBaseUrl(): string {
  return (
    import.meta.env.PUBLIC_POCKETBASE_URL ||
    process.env.PUBLIC_POCKETBASE_URL ||
    'http://localhost:8090'
  )
}
