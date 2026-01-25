/**
 * Test Helpers for Integration Tests
 *
 * Provides utilities for creating test users and authenticating as regular users
 * instead of superusers. This ensures tests catch permission issues.
 */

import PocketBase from 'pocketbase'

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

export interface TestContext {
  /** Admin PocketBase client - use only for setup/teardown */
  adminPb: PocketBase
  /** User PocketBase client - use for actual test operations */
  userPb: PocketBase
  /** The test user's ID */
  userId: string
  /** The test user's email */
  userEmail: string
}

/**
 * Create a test user and return both admin and user PocketBase clients.
 *
 * Use adminPb only for test setup (creating groups, children, etc.)
 * Use userPb for all actual test operations to verify permissions work correctly.
 */
export async function createTestUser(): Promise<TestContext> {
  const adminPb = new PocketBase(POCKETBASE_URL)
  await adminPb.collection('_superusers').authWithPassword('admin@test.local', 'testtest123')

  const email = `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  const user = await adminPb.collection('users').create({
    email,
    password: 'testtest123',
    passwordConfirm: 'testtest123',
  })

  const userPb = new PocketBase(POCKETBASE_URL)
  await userPb.collection('users').authWithPassword(email, 'testtest123')

  return {
    adminPb,
    userPb,
    userId: user.id,
    userEmail: email,
  }
}

/**
 * Create a test group and add the user to it.
 * Returns the group ID.
 */
export async function createTestGroup(
  adminPb: PocketBase,
  userId: string,
  name = 'Test Family'
): Promise<string> {
  const group = await adminPb.collection('groups').create({ name })
  await adminPb.collection('user_groups').create({
    user: userId,
    group: group.id,
  })
  return group.id
}

/**
 * Create a test child in a group.
 * Returns the child ID.
 */
export async function createTestChild(
  adminPb: PocketBase,
  groupId: string,
  name = 'Max',
  color = '#4DABF7'
): Promise<string> {
  const child = await adminPb.collection('children').create({
    name,
    group: groupId,
    color,
  })
  return child.id
}
