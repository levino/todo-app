import { randomBytes } from 'node:crypto'
import type { Db } from '../db.ts'
import { type User, upsertUserByEmail } from '../domain/users.ts'
import type { Mailer } from './email.ts'

const TOKEN_TTL_MS = 15 * 60 * 1000

const randomToken = (): string => randomBytes(24).toString('base64url')

export const issueMagicLink = (
  db: Db,
  input: { email: string; at?: number },
): string => {
  const token = randomToken()
  db.prepare(
    'INSERT INTO magic_links (token, email, created_at) VALUES (?, ?, ?)',
  ).run(token, input.email, input.at ?? Date.now())
  return token
}

export type RedeemResult =
  | { ok: true; user: User }
  | { ok: false; reason: 'not_found' | 'expired' | 'already_used' }

export const redeemMagicLink = (
  db: Db,
  token: string,
  at: number = Date.now(),
): RedeemResult => {
  const row = db
    .prepare(
      'SELECT email, created_at, used_at FROM magic_links WHERE token = ?',
    )
    .get(token) as
    | { email: string; created_at: number; used_at: number | null }
    | undefined

  if (!row) return { ok: false, reason: 'not_found' }
  if (row.used_at != null) return { ok: false, reason: 'already_used' }
  if (at - row.created_at > TOKEN_TTL_MS)
    return { ok: false, reason: 'expired' }

  db.prepare('UPDATE magic_links SET used_at = ? WHERE token = ?').run(
    at,
    token,
  )
  const user = upsertUserByEmail(db, { email: row.email })
  return { ok: true, user }
}

export const sendMagicLink = async (
  mailer: Mailer,
  input: { email: string; link: string },
): Promise<void> => {
  await mailer.send({
    to: input.email,
    subject: 'Dein Login fuer Family Todo',
    text: `Hi,

klick diesen Link um dich anzumelden:

${input.link}

Der Link ist 15 Minuten gueltig.`,
  })
}
