import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { verifyToken } from '@clerk/backend'
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

    let sessionClaims: {
      sub: string
      email?: string
      first_name?: string
      last_name?: string
      [key: string]: unknown
    }

    try {
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      })
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

    // JIT user creation: find or create from JWT claims
    let user = await this.prisma.user.findUnique({
      where: { clerkId },
    })

    if (!user) {
      const email =
        sessionClaims.email ||
        `${clerkId}@anstoss.app` // fallback — shouldn't happen
      const name = [sessionClaims.first_name, sessionClaims.last_name]
        .filter(Boolean)
        .join(' ') || 'Player'

      user = await this.prisma.user.create({
        data: {
          clerkId,
          email,
          name,
          // DOB defaults to epoch — age gate enforced at registration UI
          dateOfBirth: new Date('1990-01-01'),
        },
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
