import { createPublicKey, type JsonWebKey as NodeJsonWebKey } from 'node:crypto'
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { verifyToken, createClerkClient, type VerifyTokenOptions } from '@clerk/backend'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { ClerkTokenExpiredError } from '@anstoss/shared'

/**
 * Clerk JWT auth guard with JIT user creation.
 *
 * MANDATED: JIT user creation from JWT claims — no webhook dependency.
 *
 * Flow:
 *   1. Extract Bearer token from Authorization header
 *   2. Verify JWT with Clerk
 *   3. Look up User by clerkId
 *   4. If no User exists, create one from JWT claims (self-healing)
 *   5. Attach user to request for downstream handlers
 *   6. If JWT is expired/invalid → 401
 */

export interface AuthenticatedRequest extends Request {
  user: {
    id: string
    clerkId: string
    email: string
    name: string
  }
}

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const authHeader = request.headers?.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header')
    }

    const token = authHeader.substring(7)

    // Dev auth bypass: tokens starting with "dev_" skip Clerk verification
    // Only available when NODE_ENV=development — explicitly blocked in production
    if (token.startsWith('dev_')) {
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('Dev tokens are not allowed in production')
      }
      if (process.env.NODE_ENV !== 'development') {
        throw new UnauthorizedException('Dev tokens require NODE_ENV=development')
      }
    }
    if (
      process.env.NODE_ENV === 'development' &&
      token.startsWith('dev_')
    ) {
      const devEmail = token.replace('dev_', '') || 'dev@anstoss.app'
      let user = await this.prisma.user.findUnique({
        where: { email: devEmail },
      })
      if (!user) {
        user = await this.prisma.user.create({
          data: {
            clerkId: `dev_${devEmail}`,
            email: devEmail,
            name: devEmail.split('@')[0] || 'Dev User',
            // Dev auth: set a valid DOB so age gate passes in dev mode
            dateOfBirth: new Date('1990-01-01'),
          },
        })
      }
      request.user = {
        id: user.id,
        clerkId: user.clerkId,
        email: user.email,
        name: user.name,
      }
      return true
    }

    let sessionClaims: {
      sub: string
      email?: string
      first_name?: string
      last_name?: string
      [key: string]: unknown
    }

    try {
      const payload = await verifyClerkSessionToken(token)
      sessionClaims = payload as typeof sessionClaims
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      if (message.includes('expired')) {
        throw new ClerkTokenExpiredError(
          'Session expired, please log in again',
        )
      }
      throw new UnauthorizedException('Invalid authentication token')
    }

    const clerkId = sessionClaims.sub
    if (!clerkId) {
      throw new UnauthorizedException('Token missing subject claim')
    }

    // Extract email from JWT claims — Clerk puts it in different places
    // depending on session token template configuration
    let claimEmail =
      sessionClaims.email ||
      (sessionClaims.email_address as string | undefined) ||
      (sessionClaims.primary_email_address as string | undefined) ||
      undefined

    // If email not in JWT claims, fetch from Clerk API
    const clerkSecretKey = process.env.CLERK_SECRET_KEY?.trim()

    if (!claimEmail && clerkSecretKey) {
      try {
        const clerk = createClerkClient({ secretKey: clerkSecretKey })
        const clerkUser = await clerk.users.getUser(clerkId)
        const primaryEmailId = clerkUser.primaryEmailAddressId
        const primaryEmail = clerkUser.emailAddresses.find(
          (e) => e.id === primaryEmailId,
        )
        claimEmail = primaryEmail?.emailAddress || clerkUser.emailAddresses[0]?.emailAddress
      } catch {
        // Clerk API call failed — proceed with fallback
      }
    }

    const normalizedEmail = claimEmail?.trim().toLowerCase()

    // JIT user creation: find or create from JWT claims
    let user = await this.prisma.user.findUnique({
      where: { clerkId },
    })

    if (!user) {
      if (normalizedEmail) {
        const existingEmailUser = await this.prisma.user.findUnique({
          where: { email: normalizedEmail },
        })

        if (existingEmailUser) {
          if (isClaimableSeedUser(existingEmailUser)) {
            user = await this.prisma.user.update({
              where: { id: existingEmailUser.id },
              data: {
                clerkId,
                email: normalizedEmail,
              },
            })
          } else if (existingEmailUser.clerkId !== clerkId) {
            throw new UnauthorizedException(
              'Email already belongs to an existing account',
            )
          } else {
            user = existingEmailUser
          }
        }
      }
    }

    if (!user) {
      const email = normalizedEmail || `${clerkId}@anstoss.app`
      const name =
        [sessionClaims.first_name, sessionClaims.last_name]
          .filter(Boolean)
          .join(' ') || 'Player'

      try {
        user = await this.prisma.user.create({
          data: {
            clerkId,
            email,
            name,
            // DOB null — age gate guard will force DOB entry before club access
          },
        })
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error
        }

        user =
          (await this.prisma.user.findUnique({
            where: { clerkId },
          })) ||
          (normalizedEmail
            ? await this.prisma.user.findUnique({
                where: { email: normalizedEmail },
              })
            : null)

        if (!user) {
          throw error
        }

        if (normalizedEmail && user.email !== normalizedEmail && user.email.endsWith('@anstoss.app')) {
          user = await this.prisma.user.update({
            where: { id: user.id },
            data: { email: normalizedEmail },
          })
        }
      }
    } else if (claimEmail && user.email.endsWith('@anstoss.app')) {
      // Self-heal: if user was created with fallback email but JWT now has
      // real email, update it
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { email: claimEmail.trim().toLowerCase() },
      })
    }

    // Attach user to request for downstream handlers
    request.user = {
      id: user.id,
      clerkId: user.clerkId,
      email: user.email,
      name: user.name,
    }

    return true
  }
}

function isClaimableSeedUser(user: { clerkId: string; email: string }) {
  return (
    user.clerkId.startsWith('seed_') || user.email.endsWith('@demo.anstoss.app')
  )
}

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

async function verifyClerkSessionToken(token: string) {
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

function isUniqueConstraintError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2002'
  }

  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  )
}
