import type { AuthUser } from '../src/lib/auth'
import { getDb } from '@family-todo/db'
import { createPbShim, type PbShim } from './pb-shim'

export type { PbShim }

/**
 * Extract the authenticated user (in the `locals.user` shape the pages expect)
 * from a shim's auth store. Identical contract to the previous PocketBase
 * helper, which read `pb.authStore.record`.
 */
export const authUser = (pb: PbShim): AuthUser | undefined => {
  const record = pb.authStore.record
  if (!record) return undefined
  return { id: record.id, email: (record as { email?: string }).email ?? '' }
}

/**
 * Convenience: a PocketBase-compatible shim bound to the current test's
 * in-memory `@family-todo/db` singleton (the same connection `locals.db` uses).
 */
export const createPb = (): PbShim => createPbShim(getDb())
