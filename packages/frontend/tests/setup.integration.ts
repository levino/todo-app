/**
 * Integration Test Setup
 *
 * Resets the database before each test:
 * 1. Clears all records from all collections (respecting foreign key order)
 * 2. Resets the PocketBase singleton to ensure fresh connections
 */

import PocketBase from 'pocketbase'
import { beforeEach } from 'vitest'
import { resetPocketBase } from '../src/lib/pocketbase'

const POCKETBASE_URL =
  process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

/**
 * Clear all records from a collection
 */
async function clearCollection(pb: PocketBase, collectionName: string) {
  try {
    const records = await pb.collection(collectionName).getFullList()
    for (const record of records) {
      await pb.collection(collectionName).delete(record.id)
    }
  } catch {
    // Collection might not exist yet
  }
}

beforeEach(async () => {
  // Reset the PocketBase singleton to pick up correct URL
  resetPocketBase()

  const pb = new PocketBase(POCKETBASE_URL)
  await pb
    .collection('_superusers')
    .authWithPassword('admin@test.local', 'testtest123')

  // Clear all test data before each test (order matters for relations!)
  // Delete children of relations first, then parents
  await clearCollection(pb, 'kiosk_tasks') // depends on children
  await clearCollection(pb, 'children')    // depends on groups
  await clearCollection(pb, 'user_groups') // junction table
  await clearCollection(pb, 'groups')
  await clearCollection(pb, 'todos')
  await clearCollection(pb, 'users')       // clear test users
})
