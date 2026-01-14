/// <reference types="astro/client" />

import type PocketBase from 'pocketbase'
import type { AuthUser } from './lib/auth'

interface ImportMetaEnv {
  readonly POCKETBASE_URL: string
  readonly SERVICE_URL_POCKETBASE: string
  readonly DISABLE_AUTH: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare namespace App {
  interface Locals {
    /** The authenticated user, if any */
    user?: AuthUser
    /** Per-request PocketBase instance with auth loaded */
    pb: PocketBase
    /** Current group ID from URL path (for /group/[groupId]/* routes) */
    groupId?: string
  }
}
