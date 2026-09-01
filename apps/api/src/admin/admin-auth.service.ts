import {
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
  type ResolvedAdminConsoleCredentials,
  resolveAdminConsoleCredentials,
  verifyAdminConsolePassword,
} from './admin-auth.config'

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
    const username = normalizeUsername(rawUsername)
    const password = normalizePassword(rawPassword)
    const credentials = resolveAdminConsoleCredentials()

    if (!credentials) {
      throw new ServiceUnavailableException('Admin console credentials are not configured')
    }

    const usernameMatches = constantTimeEquals(username, credentials.username)
    const passwordMatches = verifyAdminConsolePassword(credentials, password)
    if (!usernameMatches || !passwordMatches) {
      throw new UnauthorizedException('Invalid username or password')
    }

    const user = await this.findOrCreatePlatformAdminUser(credentials)
    return {
      token: signSessionToken(user.id, {
        ttlSeconds: ADMIN_CONSOLE_SESSION_TTL_SECONDS,
        audience: ADMIN_CONSOLE_AUDIENCE,
        adminVersion: credentials.version,
      }),
      user: {
        id: user.id,
        clerkId: user.clerkId,
        email: user.email,
        name: user.name,
      },
    }
  }

  private async findOrCreatePlatformAdminUser(
    credentials: ResolvedAdminConsoleCredentials,
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
}

function normalizeUsername(value: unknown): string {
  if (typeof value !== 'string') {
    throw new UnauthorizedException('Invalid username or password')
  }
  const normalized = value.trim().toLowerCase()
  if (!normalized || normalized.length > 64) {
    throw new UnauthorizedException('Invalid username or password')
  }
  return normalized
}

function normalizePassword(value: unknown): string {
  if (typeof value !== 'string' || !value) {
    throw new UnauthorizedException('Invalid username or password')
  }
  return value
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}
