import type { Context } from 'hono'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Db } from '../db.ts'
import { upsertUserByEmail } from '../domain/users.ts'
import type { Mailer } from './email.ts'
import {
  buildAuthUrl,
  exchangeCodeForToken,
  fetchGithubUser,
  type GithubConfig,
  randomState,
} from './github.ts'
import type { JwtKeys } from './jwt.ts'
import { signToken } from './jwt.ts'
import { issueMagicLink, redeemMagicLink, sendMagicLink } from './magic_link.ts'

export type AuthConfig = {
  baseUrl: string
  github: GithubConfig | null
}

const AUTH_COOKIE = 'auth_token'
const STATE_COOKIE = 'gh_oauth_state'

const htmlPage = (title: string, body: string) =>
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`

export const makeAuthRouter = (
  db: Db,
  keys: JwtKeys,
  mailer: Mailer,
  config: AuthConfig,
) => {
  const app = new Hono()

  const issueSession = async (c: Context, userId: string, email?: string) => {
    const token = await signToken(
      keys,
      { sub: userId, email },
      {
        issuer: config.baseUrl,
        expiresIn: '7d',
      },
    )
    setCookie(c, AUTH_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: config.baseUrl.startsWith('https://'),
      maxAge: 60 * 60 * 24 * 7,
    })
    return token
  }

  app.post('/auth/magic/request', async (c) => {
    const body = await c.req.parseBody()
    const email = String(body.email ?? '')
      .trim()
      .toLowerCase()
    if (!email || !email.includes('@')) {
      return c.text('Bitte gueltige Email angeben.', 400)
    }
    const token = issueMagicLink(db, { email })
    const link = `${config.baseUrl}/auth/magic/verify?token=${token}`
    await sendMagicLink(mailer, { email, link })
    return c.html(
      htmlPage(
        'Link gesendet',
        `<h1>Link gesendet</h1><p>Wir haben dir einen Anmelde-Link an <strong>${email}</strong> geschickt. Der Link ist 15 Minuten gueltig.</p>`,
      ),
    )
  })

  app.get('/auth/magic/verify', async (c) => {
    const token = c.req.query('token')
    if (!token) return c.text('Token fehlt', 400)
    const result = redeemMagicLink(db, token)
    if (!result.ok) return c.text(`Login fehlgeschlagen: ${result.reason}`, 400)
    await issueSession(c, result.user.id, result.user.email)
    return c.redirect('/')
  })

  app.post('/auth/logout', (c) => {
    deleteCookie(c, AUTH_COOKIE, { path: '/' })
    return c.redirect('/login')
  })

  app.get('/auth/github/start', (c) => {
    if (!config.github) return c.text('GitHub OAuth nicht konfiguriert', 503)
    const state = randomState()
    setCookie(c, STATE_COOKIE, state, {
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: config.baseUrl.startsWith('https://'),
      maxAge: 600,
    })
    return c.redirect(buildAuthUrl(config.github, state))
  })

  app.get('/auth/github/callback', async (c) => {
    if (!config.github) return c.text('GitHub OAuth nicht konfiguriert', 503)
    const code = c.req.query('code')
    const state = c.req.query('state')
    const expected = getCookie(c, STATE_COOKIE)
    if (!code || !state || state !== expected) {
      return c.text('State stimmt nicht', 400)
    }
    deleteCookie(c, STATE_COOKIE, { path: '/' })

    const accessToken = await exchangeCodeForToken(config.github, code)
    const profile = await fetchGithubUser(accessToken)
    const user = upsertUserByEmail(db, {
      email: profile.email,
      name: profile.name,
      githubId: profile.githubId,
    })
    await issueSession(c, user.id, user.email)
    return c.redirect('/')
  })

  return app
}
