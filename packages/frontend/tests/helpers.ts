import type PocketBase from 'pocketbase'
import type { AuthUser } from '../src/lib/auth'

export const authUser = (pb: PocketBase): AuthUser | undefined => {
  const record = pb.authStore.record
  if (!record) return undefined
  return { id: record.id, email: (record as { email?: string }).email ?? '' }
}
