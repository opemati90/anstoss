/**
 * Minimal HS256 JWT sign/verify using only `node:crypto`.
 *
 * Avoids adding a native/runtime dependency (jsonwebtoken / @nestjs/jwt).
 * Tokens are `base64url(header).base64url(payload).base64url(signature)` with
 * the signature being HMAC-SHA256 over `header.payload` keyed by
 * AUTH_JWT_SECRET. Verification is constant-time and checks `exp`.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

const ALG = 'HS256'
const HEADER = { alg: ALG, typ: 'JWT' } as const

export interface SessionClaims {
  /** User id. */
  sub: string
  /** Issued-at (seconds since epoch). */
  iat: number
  /** Expiry (seconds since epoch). */
  exp: number
  /** Time the user last proved control of their sign-in factor. */
  auth_time: number
}

/** Default session lifetime — 30 days. */
export const DEFAULT_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60

export class JwtVerificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JwtVerificationError'
  }
}

function base64urlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function base64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4))
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad
  return Buffer.from(b64, 'base64')
}

function requireSecret(secret?: string): string {
  const resolved = (secret ?? process.env.AUTH_JWT_SECRET ?? '').trim()
  if (!resolved) {
    throw new JwtVerificationError('AUTH_JWT_SECRET is not configured')
  }
  return resolved
}

function sign(signingInput: string, secret: string): string {
  return base64urlEncode(createHmac('sha256', secret).update(signingInput).digest())
}

/**
 * Sign a session JWT for `userId`. `ttlSeconds` defaults to 30 days.
 */
export function signSessionToken(
  userId: string,
  options: {
    ttlSeconds?: number
    secret?: string
    now?: number
    authenticatedAt?: number
  } = {},
): string {
  const secret = requireSecret(options.secret)
  const iat = Math.floor((options.now ?? Date.now()) / 1000)
  const exp = iat + (options.ttlSeconds ?? DEFAULT_SESSION_TTL_SECONDS)
  const claims: SessionClaims = {
    sub: userId,
    iat,
    exp,
    auth_time: options.authenticatedAt ?? iat,
  }

  const encodedHeader = base64urlEncode(JSON.stringify(HEADER))
  const encodedPayload = base64urlEncode(JSON.stringify(claims))
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const signature = sign(signingInput, secret)
  return `${signingInput}.${signature}`
}

/**
 * Verify an HS256 session JWT. Throws {@link JwtVerificationError} on a bad
 * shape, algorithm mismatch, tampered signature, or expiry.
 */
export function verifySessionToken(
  token: string,
  options: { secret?: string; now?: number } = {},
): SessionClaims {
  const secret = requireSecret(options.secret)
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new JwtVerificationError('Malformed token')
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts
  const signingInput = `${encodedHeader}.${encodedPayload}`

  const expected = sign(signingInput, secret)
  const expectedBuf = Buffer.from(expected)
  const actualBuf = Buffer.from(encodedSignature)
  if (
    expectedBuf.length !== actualBuf.length ||
    !timingSafeEqual(expectedBuf, actualBuf)
  ) {
    throw new JwtVerificationError('Invalid signature')
  }

  let header: { alg?: string; typ?: string }
  let claims: SessionClaims
  try {
    header = JSON.parse(base64urlDecode(encodedHeader).toString('utf8'))
    claims = JSON.parse(base64urlDecode(encodedPayload).toString('utf8'))
  } catch {
    throw new JwtVerificationError('Malformed token payload')
  }

  if (header.alg !== ALG) {
    throw new JwtVerificationError('Unexpected token algorithm')
  }
  if (!claims || typeof claims.sub !== 'string' || typeof claims.exp !== 'number') {
    throw new JwtVerificationError('Missing required claims')
  }

  // Tokens issued before auth_time was introduced remain valid. Their original
  // iat is the best available proof time and, crucially, is preserved on refresh.
  if (typeof claims.auth_time !== 'number') claims.auth_time = claims.iat

  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000)
  if (claims.exp <= nowSeconds) {
    throw new JwtVerificationError('Token expired')
  }

  return claims
}
