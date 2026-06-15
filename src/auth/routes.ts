import { Hono } from 'hono'
import { deleteCookie } from 'hono/cookie'
import type { Db } from '../db.ts'
import type { JwtKeys } from './jwt.ts'

export type AuthConfig = {
  baseUrl: string
}

const AUTH_COOKIE = 'auth_token'

/**
 * Auth routes.
 *
 * Interactive login is no longer handled by the app: the public "login" is the
 * oauth2-proxy/ZITADEL flow in front of this process, and the browser session
 * (the app's RS256 JWT cookie) is minted by `src/middleware.ts` from the
 * `X-Forwarded-Email` header the proxy injects. See README → Auth.
 *
 * The only thing left here is logout: clear the local app cookie and hand the
 * browser to the proxy's sign-out endpoint so the ZITADEL session is dropped
 * too. `db` and `keys` are kept in the signature for call-site compatibility
 * but are unused.
 */
export const makeAuthRouter = (
  _db: Db,
  _keys: JwtKeys,
  _config: AuthConfig,
) => {
  const app = new Hono()

  app.all('/auth/logout', (c) => {
    deleteCookie(c, AUTH_COOKIE, { path: '/' })
    return c.redirect('/oauth2/sign_out')
  })

  return app
}
