import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Platform-admin guard for the internal admin panel (apps/admin).
 *
 * Two acceptance paths:
 *   1. User.platformRole === 'PLATFORM_ADMIN' (DB-driven, preferred)
 *   2. Email is in INTERNAL_ADMIN_EMAILS env list (legacy bootstrap so
 *      existing internal tooling keeps working during the transition)
 *   3. X-Admin-Key header matches ADMIN_API_KEY (server-to-server only)
 *
 * Distinct from RolesGuard, which checks club Membership (OWNER/ADMIN).
 * Mounts AFTER ClerkAuthGuard so request.user is populated.
 *
 * To grant access: either UPDATE User SET platformRole='PLATFORM_ADMIN'
 * WHERE id=... in the DB, OR add the email to INTERNAL_ADMIN_EMAILS. The
 * DB flag is preferred because it survives env rollouts.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const user = request.user as
      | { id?: string; email?: string | null }
      | undefined

    // Server-to-server key escape hatch (CI, scripts).
    const adminKey = process.env.ADMIN_API_KEY
    const headerKey = request.headers?.['x-admin-key']
    const normalizedHeaderKey = Array.isArray(headerKey)
      ? headerKey[0]
      : headerKey
    if (adminKey && normalizedHeaderKey === adminKey) {
      return true
    }

    if (!user?.id) {
      throw new ForbiddenException('Authentication required')
    }

    const fresh = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { platformRole: true, email: true },
    })

    if (fresh?.platformRole === 'PLATFORM_ADMIN') {
      return true
    }

    // Bootstrap allowlist — keep existing internal tooling working until
    // every operator has been moved to the DB flag. Drop in V2.
    const adminEmails = (process.env.INTERNAL_ADMIN_EMAILS || '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
    const userEmail = fresh?.email?.toLowerCase()
    if (userEmail && adminEmails.includes(userEmail)) {
      return true
    }

    throw new ForbiddenException('Platform admin role required')
  }
}
