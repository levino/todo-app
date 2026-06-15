/**
 * @family-todo/db — shared SQLite (raw SQL) data layer.
 *
 * Replaces PocketBase as the application data store for users, groups,
 * children, user_groups, tasks, rewards and point_transactions. Consumed by
 * both the Astro frontend and the MCP server.
 */

export * from './types.js'
export { generateId } from './ids.js'
export {
  type DB,
  getDb,
  createDb,
  resetDb,
  closeDb,
  runMigrations,
} from './connection.js'

export * from './users.js'
export * from './groups.js'
export * from './children.js'
export * from './tasks.js'
export * from './rewards.js'
export * from './points.js'
