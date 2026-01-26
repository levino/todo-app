import { describe, expect, it, beforeEach } from 'vitest'
import {
  getUserGroups,
  isUserInGroup,
  addUserToGroup,
  removeUserFromGroup,
  getInitials,
} from './groups'
import { adminPb, createRandomUser } from '../../tests/pocketbase'

describe('Groups Library', () => {
  let userPb: Awaited<ReturnType<typeof createRandomUser>>
  let userId: string
  let groupId: string

  beforeEach(async () => {
    userPb = await createRandomUser()
    userId = userPb.authStore.record!.id

    // Create a test group
    const group = await adminPb.collection('groups').create({ name: 'Test Family' })
    groupId = group.id
  })

  describe('getUserGroups', () => {
    it('should return empty array when user has no groups', async () => {
      const groups = await getUserGroups(userPb, userId)
      expect(groups).toEqual([])
    })

    it('should return groups user belongs to', async () => {
      await adminPb.collection('user_groups').create({
        user: userId,
        group: groupId,
      })

      const groups = await getUserGroups(userPb, userId)
      expect(groups).toHaveLength(1)
      expect(groups[0].name).toBe('Test Family')
    })

    it('should return multiple groups when user belongs to many', async () => {
      const group2 = await adminPb.collection('groups').create({ name: 'Other Family' })

      await adminPb.collection('user_groups').create({
        user: userId,
        group: groupId,
      })
      await adminPb.collection('user_groups').create({
        user: userId,
        group: group2.id,
      })

      const groups = await getUserGroups(userPb, userId)
      expect(groups).toHaveLength(2)
    })
  })

  describe('isUserInGroup', () => {
    it('should return false when user is not in group', async () => {
      const result = await isUserInGroup(userPb, userId, groupId)
      expect(result).toBe(false)
    })

    it('should return true when user is in group', async () => {
      await adminPb.collection('user_groups').create({
        user: userId,
        group: groupId,
      })

      const result = await isUserInGroup(userPb, userId, groupId)
      expect(result).toBe(true)
    })
  })

  describe('addUserToGroup', () => {
    it('should add user to group', async () => {
      expect(await isUserInGroup(userPb, userId, groupId)).toBe(false)
      await addUserToGroup(userPb, userId, groupId)
      expect(await isUserInGroup(userPb, userId, groupId)).toBe(true)
    })
  })

  describe('removeUserFromGroup', () => {
    it('should remove user from group', async () => {
      await adminPb.collection('user_groups').create({
        user: userId,
        group: groupId,
      })
      expect(await isUserInGroup(userPb, userId, groupId)).toBe(true)

      await removeUserFromGroup(userPb, userId, groupId)

      expect(await isUserInGroup(userPb, userId, groupId)).toBe(false)
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

describe('Group Membership - PocketBase Rules', () => {
  let user1Pb: Awaited<ReturnType<typeof createRandomUser>>
  let user2Pb: Awaited<ReturnType<typeof createRandomUser>>
  let user1Id: string
  let groupId: string

  beforeEach(async () => {
    user1Pb = await createRandomUser()
    user1Id = user1Pb.authStore.record!.id

    user2Pb = await createRandomUser()

    // Create a group and add user1
    const group = await adminPb.collection('groups').create({ name: 'User1 Family' })
    groupId = group.id
    await adminPb.collection('user_groups').create({
      user: user1Id,
      group: groupId,
    })
  })

  it('should allow group member to read group', async () => {
    const group = await user1Pb.collection('groups').getOne(groupId)
    expect(group.name).toBe('User1 Family')
  })

  it('should deny non-member access to group', async () => {
    await expect(user2Pb.collection('groups').getOne(groupId)).rejects.toThrow()
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
    await adminPb.collection('children').create({
      name: 'Max',
      color: '#FF6B6B',
      group: groupId,
    })

    const children = await user1Pb.collection('children').getList(1, 100, {
      filter: `group = "${groupId}"`,
    })
    expect(children.items).toHaveLength(1)
    expect(children.items[0].name).toBe('Max')
  })

  it('should deny non-member access to children', async () => {
    const child = await adminPb.collection('children').create({
      name: 'Max',
      color: '#FF6B6B',
      group: groupId,
    })

    await expect(user2Pb.collection('children').getOne(child.id)).rejects.toThrow()
  })
})
