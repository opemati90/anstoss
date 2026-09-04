import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { timingSafeEqual } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { JwtVerificationError, verifySessionToken } from '../auth/otp/jwt.util'
import type { PlatformAdminRequestUser } from './platform-admin.types'
import {
  ADMIN_CONSOLE_AUDIENCE,
  resolveAdminConsoleCredentials,
} from './admin-auth.config'

/**
 * Platform-admin guard for the internal admin panel (apps/admin).
 *
 * Two acceptance paths:
 *   1. A dedicated admin-console JWT for a User whose platformRole is
 *      PLATFORM_ADMIN. Ordinary mobile/web session JWTs are never accepted.
 *   2. X-Admin-Key header matches ADMIN_API_KEY (break-glass/internal ops).
 *
 * Distinct from RolesGuard, which checks club Membership (OWNER/ADMIN). This
 * guard performs its own session JWT verification so the X-Admin-Key path is
 * not blocked by the general app auth guard.
 *
 * To grant access, create a PlatformAdminAccount through the admin console.
 * The ADMIN_CONSOLE_* credential remains the bootstrap/super-admin identity.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()

    // Break-glass key path for internal ops. Attach an explicit synthetic
    // actor so downstream audit logs never see an undefined user.
    const adminKey = process.env.ADMIN_API_KEY
    const headerKey = request.headers?.['x-admin-key']
    const normalizedHeaderKey = Array.isArray(headerKey)
      ? headerKey[0]
      : headerKey
    if (
      adminKey &&
      typeof normalizedHeaderKey === 'string' &&
      constantTimeEquals(normalizedHeaderKey, adminKey)
    ) {
      request.user = {
        id: null,
        email: null,
        name: 'Admin API key',
        authMethod: 'admin-key',
      } satisfies PlatformAdminRequestUser
      return true
    }

    const authHeader = request.headers?.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing admin credentials')
    }

    let userId: string
    let sessionVersion: string
    try {
      const claims = verifySessionToken(authHeader.substring(7))
      if (
        claims.aud !== ADMIN_CONSOLE_AUDIENCE ||
        typeof claims.admin_v !== 'string' ||
        !claims.admin_v
      ) {
        throw new UnauthorizedException('Dedicated admin session required')
      }
      sessionVersion = claims.admin_v
      userId = claims.sub
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) throw error
      if (error instanceof JwtVerificationError) {
        throw new UnauthorizedException('Invalid admin session')
      }
      throw new UnauthorizedException('Invalid admin session')
    }

    const fresh = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        platformRole: true,
        email: true,
        name: true,
        platformAdminAccount: {
          select: {
            sessionVersion: true,
            disabledAt: true,
          },
        },
      },
    })

    if (!fresh) {
      throw new UnauthorizedException('Admin account not found')
    }

    const account = fresh.platformAdminAccount
    if (account) {
      if (account.disabledAt) {
        throw new UnauthorizedException('Admin account is disabled')
      }
      if (sessionVersion !== String(account.sessionVersion)) {
        throw new UnauthorizedException('Admin session expired')
      }
    } else {
      const credentials = resolveAdminConsoleCredentials()
      if (!credentials || sessionVersion !== credentials.version) {
        throw new UnauthorizedException('Admin session expired')
      }
    }

    if (fresh?.platformRole === 'PLATFORM_ADMIN') {
      request.user = {
        id: fresh.id,
        email: fresh.email,
        name: fresh.name,
        authMethod: 'session',
      } satisfies PlatformAdminRequestUser
      return true
    }

    throw new ForbiddenException('Platform admin role required')
  }
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}
