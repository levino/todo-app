/**
 * Group Management Helpers
 *
 * Backed by the shared SQLite data layer `@family-todo/db`. The exported
 * function names, argument order (db first, mirroring the old pb-first
 * convention) and RETURN SHAPES are kept identical to the previous PocketBase
 * implementation so callers/templates are unaffected.
 */

import {
  type DB,
  getUserGroups as dbGetUserGroups,
  isUserInGroup as dbIsUserInGroup,
  addUserToGroup as dbAddUserToGroup,
  removeUserFromGroup as dbRemoveUserFromGroup,
  getInitials as dbGetInitials,
  CHILD_COLORS as DB_CHILD_COLORS,
} from '@family-todo/db'

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
 * Get all groups a user belongs to. Same return shape as before: objects with
 * at least { id, name } (the underlying rows carry extra columns, which the
 * templates ignore — they only read .id and .name).
 */
export async function getUserGroups(db: DB, userId: string): Promise<Group[]> {
  return dbGetUserGroups(db, userId)
}

/**
 * Check if a user is a member of a specific group.
 */
export async function isUserInGroup(
  db: DB,
  userId: string,
  groupId: string,
): Promise<boolean> {
  return dbIsUserInGroup(db, userId, groupId)
}

/**
 * Add a user to a group.
 */
export async function addUserToGroup(
  db: DB,
  userId: string,
  groupId: string,
): Promise<void> {
  dbAddUserToGroup(db, userId, groupId)
}

/**
 * Remove a user from a group.
 */
export async function removeUserFromGroup(
  db: DB,
  userId: string,
  groupId: string,
): Promise<void> {
  dbRemoveUserFromGroup(db, userId, groupId)
}

/**
 * Get initials from a name (e.g., "Max Müller" → "MM").
 */
export const getInitials = dbGetInitials

/**
 * Predefined child-friendly colors.
 */
export const CHILD_COLORS = DB_CHILD_COLORS
