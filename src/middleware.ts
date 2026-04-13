import { defineMiddleware } from 'astro:middleware'
import { getAppContext } from './app-context.ts'
import { getBearerToken, verifyToken } from './auth/jwt.ts'

export const onRequest = defineMiddleware(async (context, next) => {
  const { db, keys } = await getAppContext()
  context.locals.db = db

  const token = getBearerToken(context.request.headers)
  context.locals.user = token ? await verifyToken(keys, token) : null

  return next()
})
