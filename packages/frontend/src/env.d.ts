/// <reference types="astro/client" />

import type { DB } from '@family-todo/db'
import type { AuthUser } from './lib/auth'

interface ImportMetaEnv {
  readonly PUBLIC_MCP_URL: string
  readonly MCP_INTERNAL_URL: string
  readonly DB_PATH: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare global {
  namespace App {
    interface Locals {
      /** The authenticated user, if any */
      user?: AuthUser
      /** Shared SQLite data-layer connection (@family-todo/db) */
      db: DB
      /** Current group ID from URL path (for /group/[groupId]/* routes) */
      groupId?: string
    }
  }
}

export {}
