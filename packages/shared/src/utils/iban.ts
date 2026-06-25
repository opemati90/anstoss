/**
 * IBAN validation (ISO 13616) — used on both the API and the mobile client so a
 * club's manual bank-transfer details are a real, checksummed IBAN, not just
 * something IBAN-shaped. Validates: basic shape, per-country length where known,
 * and the MOD-97 checksum (the digits that catch typos).
 */

// Length per country code for the IBANs Anstoss realistically sees (DACH + EU).
// Unknown country codes skip the length check but still run MOD-97.
const IBAN_LENGTHS: Record<string, number> = {
  AT: 20, BE: 16, CH: 21, CZ: 24, DE: 22, DK: 18, ES: 24, FI: 18, FR: 27,
  GB: 22, IE: 22, IT: 27, LI: 21, LU: 20, NL: 18, NO: 15, PL: 28, PT: 25,
  SE: 24, SK: 24, TR: 26,
}

/** Strip spaces and upper-case — the canonical storage/compare form. */
export function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase()
}

/** True when `raw` is a structurally valid, MOD-97-checksummed IBAN. */
export function isValidIban(raw: string): boolean {
  const iban = normalizeIban(raw)
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/.test(iban)) return false

  const expectedLength = IBAN_LENGTHS[iban.slice(0, 2)]
  if (expectedLength && iban.length !== expectedLength) return false

  // Move the first four chars to the end, map letters to numbers (A=10…Z=35),
  // then take the running value mod 97 — a valid IBAN yields 1.
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  let remainder = 0
  for (const ch of rearranged) {
    const value =
      ch >= '0' && ch <= '9' ? ch : (ch.charCodeAt(0) - 55).toString()
    for (const digit of value) {
      remainder = (remainder * 10 + (digit.charCodeAt(0) - 48)) % 97
    }
  }
  return remainder === 1
}
