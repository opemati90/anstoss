import { randomInt } from 'node:crypto'

export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const JOIN_CODE_LENGTH = 5

export function generateJoinCode(): string {
  let out = ''
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    out += JOIN_CODE_ALPHABET[randomInt(0, JOIN_CODE_ALPHABET.length)]
  }
  return out
}
