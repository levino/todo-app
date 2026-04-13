import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type Db, openDb } from '../db.ts'
import { consoleMailer } from './email.ts'
import { issueMagicLink, redeemMagicLink, sendMagicLink } from './magic_link.ts'

let db: Db
beforeEach(() => {
  db = openDb(':memory:')
})

describe('magic link', () => {
  it('round-trips: issue then redeem upserts a user', () => {
    const token = issueMagicLink(db, { email: 'a@test' })
    const result = redeemMagicLink(db, token)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.user.email).toBe('a@test')
  })

  it('rejects an unknown token', () => {
    const result = redeemMagicLink(db, 'nope')
    expect(result).toEqual({ ok: false, reason: 'not_found' })
  })

  it('rejects after expiration', () => {
    const token = issueMagicLink(db, { email: 'a@test', at: 0 })
    const result = redeemMagicLink(db, token, 16 * 60 * 1000)
    expect(result).toEqual({ ok: false, reason: 'expired' })
  })

  it('rejects a second use', () => {
    const token = issueMagicLink(db, { email: 'a@test' })
    redeemMagicLink(db, token)
    const second = redeemMagicLink(db, token)
    expect(second).toEqual({ ok: false, reason: 'already_used' })
  })

  it('sendMagicLink calls the mailer with the link in the body', async () => {
    const send = vi.spyOn(consoleMailer, 'send').mockResolvedValue()
    await sendMagicLink(consoleMailer, {
      email: 'a@test',
      link: 'https://todos.levinkeller.de/auth/magic/verify?token=abc',
    })
    expect(send).toHaveBeenCalledWith({
      to: 'a@test',
      subject: 'Dein Login fuer Family Todo',
      text: expect.stringContaining(
        'https://todos.levinkeller.de/auth/magic/verify?token=abc',
      ),
    })
    send.mockRestore()
  })
})
