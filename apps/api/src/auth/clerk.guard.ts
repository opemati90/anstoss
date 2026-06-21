import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { createClerkClient } from '@clerk/backend'
import { Prisma } from '@prisma/client'
import { verifyClerkSessionToken } from './clerk-verify'
import { PrismaService } from '../prisma/prisma.service'
import { ClerkTokenExpiredError } from '@anstoss/shared'
import {
  AUTH_IDENTITY_PROVIDER_CLERK,
  hashAuthSubject,
  lockAuthSubject,
} from './auth-identity-tombstone'

/**
 * Clerk JWT auth guard with JIT user creation.
 *
 * JIT user creation from JWT claims keeps auth independent from webhook timing.
 *
 * Flow:
 *   1. Extract Bearer token from Authorization header
 *   2. Verify JWT with Clerk
 *   3. Look up User by clerkId
 *   4. If no User exists, create one from JWT claims (self-healing)
 *   5. Attach user to request for downstream handlers
 *   6. If JWT is expired/invalid → 401
 */

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

    const user = await this.prisma.$transaction(async (tx) => {
      await lockAuthSubject(tx, clerkId)

      const tombstone = await tx.authIdentityTombstone.findUnique({
        where: {
          provider_subjectHash: {
            provider: AUTH_IDENTITY_PROVIDER_CLERK,
            subjectHash: hashAuthSubject(clerkId),
          },
        },
        select: { id: true },
      })

      if (tombstone) {
        throw new UnauthorizedException('Account has been deleted')
      }

      // JIT user creation: find or create from JWT claims.
      // Exclude soft-deleted rows: a deleted user must not be rehydrated.
      // The advisory lock above serializes this path with under-16 account
      // deletion, so tombstone creation and fresh JIT creation cannot cross.
      let resolvedUser = await tx.user.findFirst({
        where: { clerkId, deletedAt: null },
      })

      if (!resolvedUser) {
        if (normalizedEmail) {
          const existingEmailUser = await tx.user.findFirst({
            where: { email: normalizedEmail, deletedAt: null },
          })

          if (existingEmailUser) {
            if (isClaimableSeedUser(existingEmailUser)) {
              resolvedUser = await tx.user.update({
                where: { id: existingEmailUser.id },
                data: {
                  clerkId,
                  email: normalizedEmail,
                },
              })
            } else if (existingEmailUser.clerkId !== clerkId) {
              const staleBinding = clerkSecretKey
                ? await isStaleClerkBinding(
                    existingEmailUser.clerkId,
                    normalizedEmail,
                    clerkSecretKey,
                  )
                : false

              if (!staleBinding) {
                throw new UnauthorizedException(
                  'Email already belongs to an existing account',
                )
              }

              resolvedUser = await tx.user.update({
                where: { id: existingEmailUser.id },
                data: {
                  clerkId,
                  email: normalizedEmail,
                },
              })
            } else {
              resolvedUser = existingEmailUser
            }
          }
        }
      }

      if (!resolvedUser) {
        const email = normalizedEmail || `${clerkId}@anstoss.app`
        const name =
          [sessionClaims.first_name, sessionClaims.last_name]
            .filter(Boolean)
            .join(' ') || 'Player'

        try {
          resolvedUser = await tx.user.create({
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

          resolvedUser =
            (await tx.user.findFirst({
              where: { clerkId, deletedAt: null },
            })) ||
            (normalizedEmail
              ? await tx.user.findFirst({
                  where: { email: normalizedEmail, deletedAt: null },
                })
              : null)

          if (!resolvedUser) {
            throw error
          }

          if (
            normalizedEmail &&
            resolvedUser.email !== normalizedEmail &&
            resolvedUser.email?.endsWith('@anstoss.app')
          ) {
            resolvedUser = await tx.user.update({
              where: { id: resolvedUser.id },
              data: { email: normalizedEmail },
            })
          }
        }
      } else if (resolvedUser.email?.endsWith('@anstoss.app')) {
        // Self-heal: if user was created with fallback email, try to update
        // with real email from JWT claims or Clerk API.
        let healEmail = claimEmail?.trim().toLowerCase()

        if (!healEmail && clerkSecretKey) {
          try {
            const clerk = createClerkClient({ secretKey: clerkSecretKey })
            const clerkUser = await clerk.users.getUser(clerkId)
            const primaryEmailId = clerkUser.primaryEmailAddressId
            const primaryEmail = clerkUser.emailAddresses.find(
              (e) => e.id === primaryEmailId,
            )
            healEmail = (primaryEmail?.emailAddress || clerkUser.emailAddresses[0]?.emailAddress)?.trim().toLowerCase()
          } catch {
            // Clerk API call failed — keep fallback email
          }
        }

        if (healEmail) {
          resolvedUser = await tx.user.update({
            where: { id: resolvedUser.id },
            data: { email: healEmail },
          })
        }
      }

      if (!resolvedUser) {
        throw new UnauthorizedException('Unable to resolve account')
      }

      return resolvedUser
    })

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

function isClaimableSeedUser(user: { clerkId: string | null; email: string | null }) {
  return (
    (user.clerkId?.startsWith('seed_') ?? false) ||
    (user.email?.endsWith('@demo.anstoss.app') ?? false)
  )
}

async function isStaleClerkBinding(
  existingClerkId: string | null,
  normalizedEmail: string,
  clerkSecretKey: string,
) {
  if (!existingClerkId) {
    return true
  }
  try {
    const clerk = createClerkClient({ secretKey: clerkSecretKey })
    const clerkUser = await clerk.users.getUser(existingClerkId)
    const existingEmails =
      clerkUser.emailAddresses?.map((address) =>
        address.emailAddress.trim().toLowerCase(),
      ) ?? []

    return !existingEmails.includes(normalizedEmail)
  } catch (error) {
    if (isClerkNotFoundError(error)) {
      return true
    }

    return false
  }
}

function isClerkNotFoundError(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    ('status' in error || 'statusCode' in error)
  ) {
    const status =
      (error as { status?: unknown }).status ??
      (error as { statusCode?: unknown }).statusCode
    return status === 404
  }

  if (error instanceof Error) {
    return error.message.toLowerCase().includes('not found')
  }

  return false
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
