/**
 * Group Management Helpers
 */

import type PocketBase from 'pocketbase'

export interface Group {
  id: string
  name: string
}

export interface UserGroup {
  id: string
  user: string
  group: string
  expand?: {
    group?: Group
  }
}

/**
 * Get all groups a user belongs to
 */
export async function getUserGroups(pb: PocketBase, userId: string): Promise<Group[]> {
  const result = await pb.collection('user_groups').getList<UserGroup>(1, 100, {
    filter: `user = "${userId}"`,
    expand: 'group',
  })

  return result.items
    .map((ug) => ug.expand?.group)
    .filter((g): g is Group => g !== undefined)
}

/**
 * Check if a user is a member of a specific group
 */
export async function isUserInGroup(
  pb: PocketBase,
  userId: string,
  groupId: string
): Promise<boolean> {
  try {
    const result = await pb.collection('user_groups').getList(1, 1, {
      filter: `user = "${userId}" && group = "${groupId}"`,
    })
    return result.totalItems > 0
  } catch {
    return false
  }
}

/**
 * Add a user to a group
 */
export async function addUserToGroup(
  pb: PocketBase,
  userId: string,
  groupId: string
): Promise<void> {
  await pb.collection('user_groups').create({
    user: userId,
    group: groupId,
  })
}

/**
 * Remove a user from a group
 */
export async function removeUserFromGroup(
  pb: PocketBase,
  userId: string,
  groupId: string
): Promise<void> {
  const result = await pb.collection('user_groups').getList(1, 1, {
    filter: `user = "${userId}" && group = "${groupId}"`,
  })

  if (result.items.length > 0) {
    await pb.collection('user_groups').delete(result.items[0].id)
  }
}

/**
 * Get initials from a name (e.g., "Max Müller" → "MM")
 */
export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase())
    .join('')
    .slice(0, 2) // Max 2 characters
}

/**
 * Predefined child-friendly colors
 */
export const CHILD_COLORS = [
  { name: 'Rot', value: '#FF6B6B' },
  { name: 'Orange', value: '#FFA94D' },
  { name: 'Gelb', value: '#FFE066' },
  { name: 'Grün', value: '#69DB7C' },
  { name: 'Blau', value: '#4DABF7' },
  { name: 'Lila', value: '#B197FC' },
  { name: 'Pink', value: '#F783AC' },
] as const
