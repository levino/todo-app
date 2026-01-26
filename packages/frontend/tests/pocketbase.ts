/**
 * PocketBase Test Utilities
 *
 * Exports:
 * - adminPb: authenticated admin client (singleton)
 * - createRandomUser: factory to create a test user
 */

import PocketBase from 'pocketbase'
import { nanoid } from 'nanoid'

const POCKETBASE_URL = 'http://127.0.0.1:8090'
const ADMIN_EMAIL = 'admin@test.local'
const ADMIN_PASSWORD = 'testtest123'

// Singleton admin client - authenticates on first import
export const adminPb = new PocketBase(POCKETBASE_URL)
await adminPb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD)

/**
 * Create a random test user and return an authenticated PocketBase client.
 */
export async function createRandomUser() {
  const email = `test-${nanoid()}@test.local`

  await adminPb.collection('users').create({
    email,
    password: ADMIN_PASSWORD,
    passwordConfirm: ADMIN_PASSWORD,
  })

  const userPb = new PocketBase(POCKETBASE_URL)
  await userPb.collection('users').authWithPassword(email, ADMIN_PASSWORD)

  return userPb
}
