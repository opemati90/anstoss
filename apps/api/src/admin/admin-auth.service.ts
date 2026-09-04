import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { timingSafeEqual } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { signSessionToken } from '../auth/otp/jwt.util'
import {
  ADMIN_CONSOLE_AUDIENCE,
  ADMIN_CONSOLE_SESSION_TTL_SECONDS,
  createAdminConsolePasswordHash,
  isValidAdminConsoleLoginIdentifier,
  isValidAdminConsolePassword,
  normalizeAdminConsoleLoginIdentifier,
  resolveAdminConsoleCredentials,
  verifyAdminConsolePassword,
} from './admin-auth.config'
import type { PlatformAdminActor } from './platform-admin.types'

type PlatformAdminUser = {
  id: string
  email: string | null
  name: string
  clerkId: string | null
}

@Injectable()
export class AdminAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(rawUsername: unknown, rawPassword: unknown) {
    const username = normalizeAdminConsoleLoginIdentifier(rawUsername)
    const password = normalizePassword(rawPassword)
    const platformAdminAccount = this.prisma.platformAdminAccount
    const dbAccount = platformAdminAccount
      ? await platformAdminAccount.findUnique({
      where: { loginIdentifier: username },
      select: {
        userId: true,
        loginIdentifier: true,
        passwordHash: true,
        sessionVersion: true,
        disabledAt: true,
        mustRotatePassword: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            clerkId: true,
            platformRole: true,
            deletedAt: true,
          },
        },
      },
        })
      : null

    if (dbAccount) {
      if (dbAccount.disabledAt) {
        throw new UnauthorizedException('Admin account is disabled')
      }
      if (dbAccount.user.deletedAt) {
        throw new UnauthorizedException('Admin account not found')
      }
      if (dbAccount.user.platformRole !== 'PLATFORM_ADMIN') {
        throw new ForbiddenException('Platform admin role required')
      }
      if (!verifyScryptPassword(dbAccount.passwordHash, password)) {
        throw new UnauthorizedException('Invalid username or password')
      }
      await this.prisma.platformAdminAccount.update({
        where: { userId: dbAccount.userId },
        data: { lastLoginAt: new Date() },
      })
      return this.buildLoginResult(dbAccount.user, String(dbAccount.sessionVersion), {
        loginIdentifier: dbAccount.loginIdentifier,
        mustRotatePassword: dbAccount.mustRotatePassword,
      })
    }

    const credentials = resolveAdminConsoleCredentials()

    if (!credentials) {
      throw new ServiceUnavailableException('Admin console credentials are not configured')
    }

    const usernameMatches =
      constantTimeEquals(username, credentials.username) ||
      constantTimeEquals(username, credentials.email)
    const passwordMatches = verifyAdminConsolePassword(credentials, password)
    if (!usernameMatches || !passwordMatches) {
      throw new UnauthorizedException('Invalid username or password')
    }

    const user = await this.findOrCreatePlatformAdminUser(credentials)
    return this.buildLoginResult(user, credentials.version, {
      loginIdentifier: credentials.username,
      mustRotatePassword: false,
    })
  }

  async getSessionProfile(userId: string) {
    const account = await this.prisma.platformAdminAccount.findUnique({
      where: { userId },
      select: {
        loginIdentifier: true,
        mustRotatePassword: true,
        disabledAt: true,
        lastLoginAt: true,
        createdAt: true,
      },
    })

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        clerkId: true,
        platformRole: true,
      },
    })
    if (!user || user.platformRole !== 'PLATFORM_ADMIN') {
      throw new UnauthorizedException('Admin account not found')
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      clerkId: user.clerkId,
      platformRole: user.platformRole,
      loginIdentifier: account?.loginIdentifier ?? null,
      authSource: account ? 'account' : 'bootstrap',
      mustRotatePassword: account?.mustRotatePassword ?? false,
      disabled: Boolean(account?.disabledAt),
      lastLoginAt: account?.lastLoginAt ?? null,
      createdAt: account?.createdAt ?? null,
      canManagePlatformAdmins: this.isConfiguredSuperAdminEmail(user.email),
    }
  }

  async changePassword(
    actor: PlatformAdminActor,
    input: { currentPassword: string; newPassword: string },
  ) {
    if (!actor.id || actor.authMethod !== 'session') {
      throw new ForbiddenException('Password changes require a signed-in admin account')
    }
    const currentPassword = normalizePassword(input.currentPassword)
    const newPassword = normalizePassword(input.newPassword)
    if (!isValidAdminConsolePassword(newPassword)) {
      throw new BadRequestException('New password must be at least 12 characters')
    }

    const account = await this.prisma.platformAdminAccount.findUnique({
      where: { userId: actor.id },
      select: {
        id: true,
        userId: true,
        loginIdentifier: true,
        passwordHash: true,
        sessionVersion: true,
      },
    })

    if (account) {
      if (!verifyScryptPassword(account.passwordHash, currentPassword)) {
        throw new UnauthorizedException('Current password is incorrect')
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.platformAdminAccount.update({
          where: { userId: actor.id! },
          data: {
            passwordHash: createAdminConsolePasswordHash(newPassword),
            sessionVersion: { increment: 1 },
            mustRotatePassword: false,
          },
        })
        await tx.auditLog.create({
          data: {
            clubId: null,
            type: 'admin.auth.password_changed',
            actorType: 'admin',
            actorId: actor.id,
            actorLabel: actor.email ?? actor.name,
            summary: `Changed platform admin password for ${account.loginIdentifier}.`,
          },
        })
      })
      return { rotated: true }
    }

    const credentials = resolveAdminConsoleCredentials()
    if (!credentials) {
      throw new ServiceUnavailableException('Admin console credentials are not configured')
    }
    const currentMatches = verifyAdminConsolePassword(credentials, currentPassword)
    if (!currentMatches) {
      throw new UnauthorizedException('Current password is incorrect')
    }

    const user = await this.prisma.user.findFirst({
      where: { id: actor.id, deletedAt: null },
      select: { id: true, email: true, name: true, platformRole: true },
    })
    if (!user || user.platformRole !== 'PLATFORM_ADMIN') {
      throw new UnauthorizedException('Admin account not found')
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.platformAdminAccount.create({
        data: {
          userId: actor.id!,
          loginIdentifier: credentials.username,
          passwordHash: createAdminConsolePasswordHash(newPassword),
          sessionVersion: 1,
          mustRotatePassword: false,
        },
      })
      await tx.auditLog.create({
        data: {
          clubId: null,
          type: 'admin.auth.bootstrap_promoted',
          actorType: 'admin',
          actorId: actor.id,
          actorLabel: actor.email ?? actor.name,
          summary: `Promoted bootstrap admin login ${credentials.username} to a stored platform admin account.`,
        },
      })
    })

    return { rotated: true, bootstrapPromoted: true }
  }

  async listPlatformAdmins() {
    const rows = await this.prisma.platformAdminAccount.findMany({
      orderBy: [{ disabledAt: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        loginIdentifier: true,
        mustRotatePassword: true,
        disabledAt: true,
        lastLoginAt: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            deletedAt: true,
            platformRole: true,
          },
        },
      },
    })

    const admins = rows.map((row) => ({
      id: row.id,
      userId: row.user.id,
      loginIdentifier: row.loginIdentifier,
      email: row.user.email,
      name: row.user.name,
      disabled: Boolean(row.disabledAt),
      deleted: Boolean(row.user.deletedAt),
      mustRotatePassword: row.mustRotatePassword,
      lastLoginAt: row.lastLoginAt,
      createdAt: row.createdAt,
      platformRole: row.user.platformRole,
    }))

    const bootstrap = resolveAdminConsoleCredentials()
    if (
      bootstrap &&
      !admins.some(
        (admin) =>
          admin.loginIdentifier === bootstrap.username || admin.email === bootstrap.email,
      )
    ) {
      const bootstrapUser = await this.prisma.user.findFirst({
        where: { email: bootstrap.email, deletedAt: null, platformRole: 'PLATFORM_ADMIN' },
        select: { id: true, email: true, name: true, createdAt: true },
      })
      if (bootstrapUser) {
        admins.unshift({
          id: `bootstrap:${bootstrap.username}`,
          userId: bootstrapUser.id,
          loginIdentifier: bootstrap.username,
          email: bootstrapUser.email,
          name: bootstrapUser.name,
          disabled: false,
          deleted: false,
          mustRotatePassword: false,
          lastLoginAt: null,
          createdAt: bootstrapUser.createdAt,
          platformRole: 'PLATFORM_ADMIN',
        })
      }
    }

    return admins
  }

  async createPlatformAdmin(
    actor: PlatformAdminActor,
    input: { email: string; name: string; loginIdentifier: string; password: string },
  ) {
    if (!actor.id || actor.authMethod !== 'session') {
      throw new ForbiddenException('Creating platform admins requires a signed-in admin account')
    }
    if (!this.isConfiguredSuperAdminEmail(actor.email)) {
      throw new ForbiddenException('Only the configured super admin can create platform admins')
    }
    const email = normalizeEmail(input.email)
    const name = normalizeName(input.name)
    const loginIdentifier = normalizeAdminConsoleLoginIdentifier(input.loginIdentifier)
    const password = normalizePassword(input.password)

    if (!isValidAdminConsoleLoginIdentifier(loginIdentifier)) {
      throw new BadRequestException(
        'Login identifier must be 3-64 characters using letters, numbers, dot, dash, underscore, or @',
      )
    }
    if (!isValidAdminConsolePassword(password)) {
      throw new BadRequestException('Password must be at least 12 characters')
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const loginConflict = await tx.platformAdminAccount.findUnique({
        where: { loginIdentifier },
        select: { id: true },
      })
      if (loginConflict) {
        throw new BadRequestException('That login identifier is already in use')
      }

      const user = await tx.user.upsert({
        where: { email },
        update: {
          name,
          platformRole: 'PLATFORM_ADMIN',
          deletedAt: null,
        },
        create: {
          email,
          name,
          platformRole: 'PLATFORM_ADMIN',
        },
        select: {
          id: true,
          email: true,
          name: true,
          clerkId: true,
          platformRole: true,
        },
      })

      const existingAccount = await tx.platformAdminAccount.findUnique({
        where: { userId: user.id },
        select: { id: true },
      })
      if (existingAccount) {
        throw new BadRequestException('That user already has a platform admin account')
      }

      const account = await tx.platformAdminAccount.create({
        data: {
          userId: user.id,
          loginIdentifier,
          passwordHash: createAdminConsolePasswordHash(password),
          mustRotatePassword: true,
        },
        select: {
          id: true,
          loginIdentifier: true,
          mustRotatePassword: true,
          createdAt: true,
        },
      })

      await tx.auditLog.create({
        data: {
          clubId: null,
          type: 'admin.auth.account_created',
          actorType: 'admin',
          actorId: actor.id,
          actorLabel: actor.email ?? actor.name,
          summary: `Created platform admin ${loginIdentifier}.`,
          metadata: {
            targetUserId: user.id,
            targetEmail: user.email,
            loginIdentifier,
          },
        },
      })

      return { user, account }
    })

    return {
      id: created.account.id,
      userId: created.user.id,
      email: created.user.email,
      name: created.user.name,
      loginIdentifier: created.account.loginIdentifier,
      mustRotatePassword: created.account.mustRotatePassword,
      createdAt: created.account.createdAt,
    }
  }

  private async findOrCreatePlatformAdminUser(
    credentials: NonNullable<ReturnType<typeof resolveAdminConsoleCredentials>>,
  ): Promise<PlatformAdminUser> {
    const existing = await this.prisma.user.findFirst({
      where: { email: credentials.email, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        clerkId: true,
      },
    })

    if (existing) {
      return this.prisma.user.update({
        where: { id: existing.id },
        data: {
          name: credentials.name,
          platformRole: 'PLATFORM_ADMIN',
          deletedAt: null,
        },
        select: {
          id: true,
          email: true,
          name: true,
          clerkId: true,
        },
      })
    }

    return this.prisma.user.create({
      data: {
        email: credentials.email,
        name: credentials.name,
        platformRole: 'PLATFORM_ADMIN',
      },
      select: {
        id: true,
        email: true,
        name: true,
        clerkId: true,
      },
    })
  }

  private buildLoginResult(
    user: PlatformAdminUser,
    adminVersion: string,
    options: { loginIdentifier: string | null; mustRotatePassword: boolean },
  ) {
    return {
      token: signSessionToken(user.id, {
        ttlSeconds: ADMIN_CONSOLE_SESSION_TTL_SECONDS,
        audience: ADMIN_CONSOLE_AUDIENCE,
        adminVersion,
      }),
      user: {
        id: user.id,
        clerkId: user.clerkId,
        email: user.email,
        name: user.name,
        loginIdentifier: options.loginIdentifier,
        mustRotatePassword: options.mustRotatePassword,
        canManagePlatformAdmins: this.isConfiguredSuperAdminEmail(user.email),
      },
    }
  }

  private isConfiguredSuperAdminEmail(email: string | null): boolean {
    const credentials = resolveAdminConsoleCredentials()
    return Boolean(
      credentials &&
        email &&
        constantTimeEquals(email.trim().toLowerCase(), credentials.email),
    )
  }
}

function normalizePassword(value: unknown): string {
  if (typeof value !== 'string' || !value) {
    throw new UnauthorizedException('Invalid username or password')
  }
  return value
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('Valid email required')
  }
  const normalized = value.trim().toLowerCase()
  if (!normalized || normalized.length > 254 || !normalized.includes('@')) {
    throw new BadRequestException('Valid email required')
  }
  return normalized
}

function normalizeName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('Name is required')
  }
  const normalized = value.trim()
  if (!normalized || normalized.length > 120) {
    throw new BadRequestException('Name is required')
  }
  return normalized
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

function verifyScryptPassword(serializedHash: string, password: string): boolean {
  const credentials = {
    username: 'unused',
    passwordHash: serializedHash,
    email: 'unused@example.com',
    name: 'unused',
    version: 'unused',
  }
  return verifyAdminConsolePassword(credentials, password)
}
