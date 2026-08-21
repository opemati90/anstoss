import { randomInt } from 'node:crypto'

export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
// 10 symbols from a 31-character alphabet yields ~49.5 bits of entropy. At
// the public read limit this is computationally infeasible to enumerate while
// remaining typeable from a printed card or a coach's screen.
export const JOIN_CODE_LENGTH = 10

export function generateJoinCode(): string {
  let out = ''
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    out += JOIN_CODE_ALPHABET[randomInt(0, JOIN_CODE_ALPHABET.length)]
  }
  return out
}
