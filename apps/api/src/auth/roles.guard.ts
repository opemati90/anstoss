import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PrismaService } from '../prisma/prisma.service'
import { MembershipRole, ROLE_HIERARCHY } from '@anstoss/shared'

export const ROLES_KEY = 'roles'

/**
 * Decorator: specify the minimum role required for an endpoint.
 *
 * Usage:
 *   @RequireRole(MembershipRole.COACH)
 *   @Get('events')
 *   listEvents() { ... }
 *
 * Checks the user's Membership in the club (from route param or header)
 * and verifies their role meets or exceeds the required level.
 */
export const RequireRole = (role: MembershipRole) =>
  SetMetadata(ROLES_KEY, role)

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRole = this.reflector.getAllAndOverride<
      MembershipRole | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()])

    // No @RequireRole decorator — allow all authenticated users
    if (!requiredRole) {
      return true
    }

    const request = context.switchToHttp().getRequest()
    const userId: string | undefined = request.user?.id
    const clubId: string | undefined = request.params?.clubId

    if (!userId || !clubId) {
      throw new ForbiddenException(
        'Club context required for role-protected endpoints',
      )
    }

    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_clubId: { userId, clubId },
      },
      select: { role: true },
    })

    if (!membership) {
      throw new ForbiddenException('Not a member of this club')
    }

    const userLevel = ROLE_HIERARCHY[membership.role as MembershipRole]
    const requiredLevel = ROLE_HIERARCHY[requiredRole]

    if (userLevel === undefined || requiredLevel === undefined) {
      throw new ForbiddenException('Invalid role configuration')
    }

    if (userLevel < requiredLevel) {
      throw new ForbiddenException(
        `Requires ${requiredRole} role or higher`,
      )
    }

    // Attach membership to request for downstream use
    request.membership = membership

    return true
  }
}
