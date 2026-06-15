import { randomBytes } from 'node:crypto'

/**
 * PocketBase-compatible id generator.
 *
 * PocketBase ids are 15-character strings drawn from [a-z0-9]. New rows created
 * by this data layer use the same shape so they are indistinguishable from rows
 * migrated out of PocketBase.
 */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
const ID_LENGTH = 15

export function generateId(): string {
  const bytes = randomBytes(ID_LENGTH)
  let out = ''
  for (let i = 0; i < ID_LENGTH; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length]
  }
  return out
}
