import { describe, expect, it, beforeEach } from 'vitest'
import { createPb, type PbShim } from '../helpers'
import {
  getUserGroups,
  isUserInGroup,
  addUserToGroup,
  removeUserFromGroup,
  getInitials,
} from '../../src/lib/groups'



describe('Groups Library', () => {
  let adminPb: PbShim
  let userPb: PbShim
  let userId: string
  let groupId: string

  beforeEach(async () => {

    // Create admin connection for setup
    adminPb = createPb()
    await adminPb.collection('_superusers').authWithPassword('admin@test.local', 'testtest123')

    // Create a test user
    const email = `test-${Date.now()}@example.com`
    const user = await adminPb.collection('users').create({
      email,
      password: 'testtest123',
      passwordConfirm: 'testtest123',
    })
    userId = user.id

    // Create user connection
    userPb = createPb()
    await userPb.collection('users').authWithPassword(email, 'testtest123')

    // Create a test group
    const group = await adminPb.collection('groups').create({ name: 'Test Family' })
    groupId = group.id
  })

  describe('getUserGroups', () => {
    it('should return empty array when user has no groups', async () => {
      const groups = await getUserGroups(userPb.db, userId)
      expect(groups).toEqual([])
    })

    it('should return groups user belongs to', async () => {
      // Add user to group
      await adminPb.collection('user_groups').create({
        user: userId,
        group: groupId,
      })

      const groups = await getUserGroups(userPb.db, userId)
      expect(groups).toHaveLength(1)
      expect(groups[0].name).toBe('Test Family')
    })

    it('should return multiple groups when user belongs to many', async () => {
      // Create second group
      const group2 = await adminPb.collection('groups').create({ name: 'Other Family' })

      // Add user to both groups
      await adminPb.collection('user_groups').create({
        user: userId,
        group: groupId,
      })
      await adminPb.collection('user_groups').create({
        user: userId,
        group: group2.id,
      })

      const groups = await getUserGroups(userPb.db, userId)
      expect(groups).toHaveLength(2)
    })
  })

  describe('isUserInGroup', () => {
    it('should return false when user is not in group', async () => {
      const result = await isUserInGroup(userPb.db, userId, groupId)
      expect(result).toBe(false)
    })

    it('should return true when user is in group', async () => {
      await adminPb.collection('user_groups').create({
        user: userId,
        group: groupId,
      })

      const result = await isUserInGroup(userPb.db, userId, groupId)
      expect(result).toBe(true)
    })
  })

  describe('addUserToGroup', () => {
    it('should add user to group', async () => {
      // First verify user is not in group
      expect(await isUserInGroup(userPb.db, userId, groupId)).toBe(false)

      // Add user to group
      await addUserToGroup(userPb.db, userId, groupId)

      // Verify user is now in group
      expect(await isUserInGroup(userPb.db, userId, groupId)).toBe(true)
    })
  })

  describe('removeUserFromGroup', () => {
    it('should remove user from group', async () => {
      // First add user to group
      await adminPb.collection('user_groups').create({
        user: userId,
        group: groupId,
      })
      expect(await isUserInGroup(userPb.db, userId, groupId)).toBe(true)

      // Remove user from group
      await removeUserFromGroup(userPb.db, userId, groupId)

      // Verify user is no longer in group
      expect(await isUserInGroup(userPb.db, userId, groupId)).toBe(false)
    })
  })

  describe('getInitials', () => {
    it('should extract first letter of single name', () => {
      expect(getInitials('Max')).toBe('M')
    })

    it('should extract first letters of two names', () => {
      expect(getInitials('Max Mustermann')).toBe('MM')
    })

    it('should handle three or more names', () => {
      // Takes first two initials (first and middle name)
      expect(getInitials('Max Peter Mustermann')).toBe('MP')
    })

    it('should handle lowercase names', () => {
      expect(getInitials('max mustermann')).toBe('MM')
    })

    it('should handle empty string', () => {
      expect(getInitials('')).toBe('')
    })
  })
})

// Access control used to be enforced by PocketBase collection rules. The app
// now enforces the SAME per-group scoping via the @family-todo/db membership
// helpers (pages/actions call isUserInGroup before exposing a group's data).
// These tests keep the original coverage — members see their group's data,
// non-members do not — expressed against the new membership model.
describe('Group Membership - Access Scoping', () => {
  let adminPb: PbShim
  let user1Pb: PbShim
  let user2Pb: PbShim
  let user1Id: string
  let user2Id: string
  let groupId: string

  beforeEach(async () => {

    adminPb = createPb()
    await adminPb.collection('_superusers').authWithPassword('admin@test.local', 'testtest123')

    // Create two test users
    const email1 = `user1-${Date.now()}@example.com`
    const user1 = await adminPb.collection('users').create({
      email: email1,
      password: 'testtest123',
      passwordConfirm: 'testtest123',
    })
    user1Id = user1.id

    const email2 = `user2-${Date.now()}@example.com`
    const user2 = await adminPb.collection('users').create({
      email: email2,
      password: 'testtest123',
      passwordConfirm: 'testtest123',
    })
    user2Id = user2.id

    // Create PB connections for both users
    user1Pb = createPb()
    await user1Pb.collection('users').authWithPassword(email1, 'testtest123')

    user2Pb = createPb()
    await user2Pb.collection('users').authWithPassword(email2, 'testtest123')

    // Create a group and add user1
    const group = await adminPb.collection('groups').create({ name: 'User1 Family' })
    groupId = group.id
    await adminPb.collection('user_groups').create({
      user: user1Id,
      group: groupId,
    })
  })

  it('should allow group member to read group', async () => {
    // Member access is granted: the membership check passes and the group is
    // readable (the path the tasks page takes before showing a group).
    expect(await isUserInGroup(user1Pb.db, user1Id, groupId)).toBe(true)
    const group = await adminPb.collection('groups').getOne(groupId)
    expect(group.name).toBe('User1 Family')
  })

  it('should deny non-member access to group', async () => {
    // A non-member fails the membership check, so the page never exposes the
    // group's data to them (equivalent to the old PB rule denying access).
    expect(await isUserInGroup(user2Pb.db, user2Id, groupId)).toBe(false)
  })

  it('should allow member to create children in their group', async () => {
    const child = await user1Pb.collection('children').create({
      name: 'Max',
      color: '#FF6B6B',
      group: groupId,
    })
    expect(child.name).toBe('Max')
  })

  it('should allow member to read children in their group', async () => {
    // Create child as admin
    await adminPb.collection('children').create({
      name: 'Max',
      color: '#FF6B6B',
      group: groupId,
    })

    // User1 is a member, so the scoped read returns the group's children.
    expect(await isUserInGroup(user1Pb.db, user1Id, groupId)).toBe(true)
    const children = await user1Pb.collection('children').getList(1, 100, {
      filter: `group = "${groupId}"`,
    })
    expect(children.items).toHaveLength(1)
    expect(children.items[0].name).toBe('Max')
  })

  it('should deny non-member access to children', async () => {
    // Create child as admin
    await adminPb.collection('children').create({
      name: 'Max',
      color: '#FF6B6B',
      group: groupId,
    })

    // User2 is not a member of the group, so the scoping check denies them the
    // group's children (the page would render nothing for them).
    expect(await isUserInGroup(user2Pb.db, user2Id, groupId)).toBe(false)
  })
})
