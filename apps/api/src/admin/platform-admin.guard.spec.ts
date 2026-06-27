import type { ExecutionContext } from '@nestjs/common'
import {
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common'
import { signSessionToken } from '../auth/otp/jwt.util'
import { PlatformAdminGuard } from './platform-admin.guard'

function ctxFor(headers: Record<string, string> = {}) {
  const request: { headers: Record<string, string>; user?: unknown } = {
    headers,
  }
  const ctx = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
  return { ctx, request }
}

function prismaWithUser(user: unknown) {
  return {
    user: {
      findFirst: jest.fn(async () => user),
    },
  }
}

describe('PlatformAdminGuard', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
    process.env.AUTH_JWT_SECRET = 'platform-admin-secret'
    process.env.ADMIN_API_KEY = 'super-secret-admin-key'
    process.env.INTERNAL_ADMIN_EMAILS = ''
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('allows X-Admin-Key before requiring a bearer token', async () => {
    const prisma = prismaWithUser(null)
    const guard = new PlatformAdminGuard(prisma as any)
    const { ctx, request } = ctxFor({
      'x-admin-key': 'super-secret-admin-key',
    })

    await expect(guard.canActivate(ctx)).resolves.toBe(true)
    expect(prisma.user.findFirst).not.toHaveBeenCalled()
    expect(request.user).toMatchObject({
      id: null,
      name: 'Admin API key',
      authMethod: 'admin-key',
    })
  })

  it('allows a signed-in platform admin session', async () => {
    const prisma = prismaWithUser({
      id: 'user_1',
      email: 'founder@anstoss.app',
      name: 'Founder',
      platformRole: 'PLATFORM_ADMIN',
    })
    const guard = new PlatformAdminGuard(prisma as any)
    const token = signSessionToken('user_1')
    const { ctx, request } = ctxFor({ authorization: `Bearer ${token}` })

    await expect(guard.canActivate(ctx)).resolves.toBe(true)
    expect(request.user).toEqual({
      id: 'user_1',
      email: 'founder@anstoss.app',
      name: 'Founder',
      authMethod: 'session',
    })
  })

  it('allows a bootstrap internal admin email', async () => {
    process.env.INTERNAL_ADMIN_EMAILS = 'ops@anstoss.app'
    const prisma = prismaWithUser({
      id: 'user_2',
      email: 'ops@anstoss.app',
      name: 'Ops',
      platformRole: 'NONE',
    })
    const guard = new PlatformAdminGuard(prisma as any)
    const token = signSessionToken('user_2')
    const { ctx } = ctxFor({ authorization: `Bearer ${token}` })

    await expect(guard.canActivate(ctx)).resolves.toBe(true)
  })

  it('rejects missing admin credentials', async () => {
    const guard = new PlatformAdminGuard(prismaWithUser(null) as any)
    const { ctx } = ctxFor()

    await expect(guard.canActivate(ctx)).rejects.toThrow(
      UnauthorizedException,
    )
  })

  it('rejects signed-in users without the platform role', async () => {
    const prisma = prismaWithUser({
      id: 'user_3',
      email: 'member@example.com',
      name: 'Member',
      platformRole: 'NONE',
    })
    const guard = new PlatformAdminGuard(prisma as any)
    const token = signSessionToken('user_3')
    const { ctx } = ctxFor({ authorization: `Bearer ${token}` })

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException)
  })
})
