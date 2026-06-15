import { type JwtKeys, loadKeysFromEnv } from './auth/jwt.ts'
import { type Db, getDb } from './db.ts'

export type AppContext = {
  db: Db
  keys: JwtKeys
  baseUrl: string
}

const GLOBAL_KEY = '__levino_todo_app_context__'
type GlobalWithContext = typeof globalThis & { [GLOBAL_KEY]?: AppContext }

export const getAppContext = async (): Promise<AppContext> => {
  const g = globalThis as GlobalWithContext
  if (g[GLOBAL_KEY]) return g[GLOBAL_KEY]
  const port = Number(process.env.PORT ?? 3000)
  const baseUrl = process.env.BASE_URL ?? `http://localhost:${port}`
  const db = getDb(process.env.DATABASE_PATH ?? './data/db.sqlite')
  const keys = await loadKeysFromEnv({
    JWT_PRIVATE_KEY: process.env.JWT_PRIVATE_KEY,
    JWT_PUBLIC_KEY: process.env.JWT_PUBLIC_KEY,
  })
  const ctx: AppContext = { db, keys, baseUrl }
  g[GLOBAL_KEY] = ctx
  return ctx
}
