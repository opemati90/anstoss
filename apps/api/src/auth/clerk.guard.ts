import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { ClerkTokenExpiredError } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import {
  JwtVerificationError,
  verifySessionToken,
} from './otp/jwt.util'

/**
 * Session JWT auth guard with JIT user creation.
 *
 * NOTE: still named `ClerkAuthGuard` so the ~all controllers that
 * `@UseGuards(ClerkAuthGuard)` keep working unchanged after the Clerk → custom
 * email-OTP migration. It now verifies OUR HS256 session JWT (AUTH_JWT_SECRET),
 * not a Clerk token. `JwtAuthGuard` is exported as an alias.
 *
 * Flow:
 *   1. Extract Bearer token from Authorization header
 *   2. `dev_` bypass (non-production only) — preserved verbatim for tests/e2e
 *   3. Verify the session JWT → `sub` = userId
 *   4. Load the (non-deleted) User; 401 if missing
 *   5. Attach `request.user` ({ id, clerkId, email, name }) for downstream
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

    // Dev auth bypass: tokens starting with "dev_" skip JWT verification.
    // Only available when NODE_ENV=development — explicitly blocked in production.
    if (token.startsWith('dev_')) {
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('Dev tokens are not allowed in production')
      }
      if (process.env.NODE_ENV !== 'development') {
        throw new UnauthorizedException('Dev tokens require NODE_ENV=development')
      }

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

    let userId: string
    try {
      const claims = verifySessionToken(token)
      userId = claims.sub
    } catch (error: unknown) {
      if (
        error instanceof JwtVerificationError &&
        error.message === 'Token expired'
      ) {
        throw new ClerkTokenExpiredError('Session expired, please log in again')
      }
      throw new UnauthorizedException('Invalid authentication token')
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    })

    if (!user) {
      throw new UnauthorizedException('Account not found')
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

/** Alias for the new auth model. `ClerkAuthGuard` is retained for call sites. */
export { ClerkAuthGuard as JwtAuthGuard }
