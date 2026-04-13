import { randomBytes } from 'node:crypto'
import type { Db } from '../db.ts'
import { type User, upsertUserByEmail } from '../domain/users.ts'

export type GithubConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
}

type TokenResponse = { access_token: string; scope: string; token_type: string }
type GithubUser = {
  id: number
  login: string
  email: string | null
  name: string | null
}
type GithubEmail = { email: string; primary: boolean; verified: boolean }

export const randomState = (): string => randomBytes(16).toString('base64url')

export const buildAuthUrl = (
  config: GithubConfig,
  state: string,
  scopes: string[] = ['read:user', 'user:email'],
): string => {
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('scope', scopes.join(' '))
  url.searchParams.set('state', state)
  return url.toString()
}

export const exchangeCodeForToken = async (
  config: GithubConfig,
  code: string,
): Promise<string> => {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    }),
  })
  if (!res.ok) throw new Error(`GitHub token exchange failed: ${res.status}`)
  const body = (await res.json()) as TokenResponse
  return body.access_token
}

export const fetchGithubUser = async (
  accessToken: string,
): Promise<{
  githubId: string
  email: string
  name: string | null
}> => {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'levino-todo-app',
  }
  const userRes = await fetch('https://api.github.com/user', { headers })
  if (!userRes.ok) throw new Error(`GitHub /user failed: ${userRes.status}`)
  const user = (await userRes.json()) as GithubUser

  let email = user.email
  if (!email) {
    const emailRes = await fetch('https://api.github.com/user/emails', {
      headers,
    })
    if (!emailRes.ok)
      throw new Error(`GitHub /user/emails failed: ${emailRes.status}`)
    const emails = (await emailRes.json()) as GithubEmail[]
    const primary =
      emails.find((e) => e.primary && e.verified) ??
      emails.find((e) => e.verified)
    if (!primary) throw new Error('No verified email on GitHub account')
    email = primary.email
  }

  return { githubId: String(user.id), email, name: user.name }
}

export const upsertUserFromGithub = (
  db: Db,
  payload: { githubId: string; email: string; name: string | null },
): User => upsertUserByEmail(db, payload)
