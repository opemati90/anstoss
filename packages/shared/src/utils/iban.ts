/**
 * IBAN validation (ISO 13616) — used on both the API and the mobile client so a
 * club's manual bank-transfer details are a real, checksummed IBAN, not just
 * something IBAN-shaped. Validates: basic shape, per-country length where known,
 * and the MOD-97 checksum (the digits that catch typos).
 */

// Official IBAN length registry (ISO 13616 / SWIFT). A country code that isn't
// in this table is not a real IBAN country, so it's rejected outright — this is
// what stops a valid-MOD-97 but fake code like "ZZ…" from being accepted.
const IBAN_LENGTHS: Record<string, number> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22,
  BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18, DO: 22,
  EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23,
  GL: 18, GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26,
  IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20,
  LV: 21, LY: 25, MC: 27, MD: 24, ME: 22, MK: 19, MR: 27, MT: 31, MU: 30,
  NL: 18, NO: 15, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22,
  SA: 24, SC: 31, SD: 18, SE: 24, SI: 19, SK: 24, SM: 27, ST: 25, SV: 28,
  TL: 23, TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20,
}

/** Strip spaces and upper-case — the canonical storage/compare form. */
export function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase()
}

/** True when `raw` is a structurally valid, MOD-97-checksummed IBAN. */
export function isValidIban(raw: string): boolean {
  const iban = normalizeIban(raw)
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/.test(iban)) return false

  // Reject any country code that isn't a real IBAN country, then enforce that
  // country's exact length.
  const expectedLength = IBAN_LENGTHS[iban.slice(0, 2)]
  if (!expectedLength || iban.length !== expectedLength) return false

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
