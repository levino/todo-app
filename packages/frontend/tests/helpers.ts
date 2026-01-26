/**
 * Test Helpers for Integration Tests
 *
 * Re-exports from pocketbase.ts and provides additional helpers.
 */

import PocketBase from 'pocketbase'
import { adminPb, createRandomUser } from './pocketbase'

export interface TestContext {
  /** Admin PocketBase client - use only for setup/teardown */
  adminPb: PocketBase
  /** User PocketBase client - use for actual test operations */
  userPb: PocketBase
  /** The test user's ID */
  userId: string
}

/**
 * Create a test user and return context with admin and user clients.
 */
export async function createTestUser(): Promise<TestContext> {
  const userPb = await createRandomUser()
  return {
    adminPb,
    userPb,
    userId: userPb.authStore.record!.id,
  }
}

/**
 * Create a test group and add the user to it.
 */
export async function createTestGroup(
  pb: PocketBase,
  userId: string,
  name = 'Test Family'
): Promise<string> {
  const group = await pb.collection('groups').create({ name })
  await pb.collection('user_groups').create({
    user: userId,
    group: group.id,
  })
  return group.id
}

/**
 * Create a test child in a group.
 */
export async function createTestChild(
  pb: PocketBase,
  groupId: string,
  name = 'Max',
  color = '#4DABF7'
): Promise<string> {
  const child = await pb.collection('children').create({
    name,
    group: groupId,
    color,
  })
  return child.id
}

// Re-export for convenience
export { adminPb, createRandomUser } from './pocketbase'
