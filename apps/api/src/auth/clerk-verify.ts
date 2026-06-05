import { createPublicKey, type JsonWebKey as NodeJsonWebKey } from 'node:crypto'
import { verifyToken, type VerifyTokenOptions } from '@clerk/backend'

/**
 * Shared Clerk session-token verifier used by BOTH the REST guard
 * (clerk.guard) and the Socket.io gateways (chat, live), so they accept the
 * same configurations. Resolution order:
 *   1. CLERK_JWT_KEY  — networkless verification (PEM public key)
 *   2. CLERK_SECRET_KEY
 *   3. fetch the JWKS from the token's issuer (and cache it)
 *
 * The gateways previously hardcoded `{ secretKey: process.env.CLERK_SECRET_KEY! }`,
 * so a valid JWT-key-only production config (no secret key in the socket path)
 * silently broke chat/live while REST kept working. Single source of truth
 * prevents that divergence.
 */
function getClerkVerifyOptions(): VerifyTokenOptions | null {
  const jwtKey = process.env.CLERK_JWT_KEY?.trim()
  if (jwtKey) {
    return { jwtKey }
  }

  const secretKey = process.env.CLERK_SECRET_KEY?.trim()
  if (secretKey) {
    return { secretKey }
  }

  return null
}

const clerkJwtKeyCache = new Map<string, string>()
type ClerkJwk = NodeJsonWebKey & { kid?: string }

export async function verifyClerkSessionToken(token: string) {
  const verifyOptions = getClerkVerifyOptions()
  if (verifyOptions) {
    return verifyToken(token, verifyOptions)
  }

  const jwtKey = await loadClerkJwtKeyFromTokenIssuer(token)
  return verifyToken(token, { jwtKey })
}

async function loadClerkJwtKeyFromTokenIssuer(token: string) {
  const [headerSegment, payloadSegment] = token.split('.')
  const header = decodeJwtSegment<{ kid?: string }>(headerSegment)
  const payload = decodeJwtSegment<{ iss?: string }>(payloadSegment)
  const kid = header.kid?.trim()
  const issuer = payload.iss?.trim()

  if (!kid || !issuer) {
    throw new Error('Clerk token is missing the issuer or key id')
  }

  const cacheKey = `${issuer}:${kid}`
  const cachedJwtKey = clerkJwtKeyCache.get(cacheKey)
  if (cachedJwtKey) {
    return cachedJwtKey
  }

  const jwksUrl = new URL(
    '/.well-known/jwks.json',
    issuer.startsWith('http') ? issuer : `https://${issuer}`,
  )
  const response = await fetch(jwksUrl)
  if (!response.ok) {
    throw new Error(`Unable to load Clerk JWKS (${response.status})`)
  }

  const jwks = (await response.json()) as { keys?: ClerkJwk[] }
  const signingKey = jwks.keys?.find((key) => key.kid === kid)
  if (!signingKey) {
    throw new Error('Matching Clerk signing key was not found')
  }

  const jwtKey = createPublicKey({
    key: signingKey,
    format: 'jwk',
  })
    .export({
      format: 'pem',
      type: 'spki',
    })
    .toString()

  clerkJwtKeyCache.set(cacheKey, jwtKey)
  return jwtKey
}

function decodeJwtSegment<T>(segment: string | undefined): T {
  if (!segment) {
    throw new Error('Malformed Clerk token')
  }

  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T
}
