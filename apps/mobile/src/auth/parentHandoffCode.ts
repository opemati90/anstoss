export const HANDOFF_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const HANDOFF_CODE_LENGTH = 8

export function normalizeParentHandoffCode(raw: string): string {
  return raw
    .toUpperCase()
    .split('')
    .filter((ch) => HANDOFF_CODE_ALPHABET.includes(ch))
    .join('')
    .slice(0, HANDOFF_CODE_LENGTH)
}
