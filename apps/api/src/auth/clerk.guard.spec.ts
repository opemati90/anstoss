import type { ExecutionContext } from '@nestjs/common'
import { UnauthorizedException } from '@nestjs/common'
import { ClerkTokenExpiredError } from '@anstoss/shared'
import { ClerkAuthGuard } from './clerk.guard'
import { signSessionToken } from './otp/jwt.util'

function ctxFor(token?: string): {
  ctx: ExecutionContext
  request: { headers: Record<string, string>; user?: unknown }
} {
  const request: { headers: Record<string, string>; user?: unknown } = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  }
  const ctx = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
  return { ctx, request }
}

const USER = {
  id: 'user_1',
  clerkId: null,
  email: 'a@b.com',
  name: 'A',
  deletedAt: null,
}

function makePrisma(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    user: {
      findFirst: overrides.findFirst ?? jest.fn(async () => USER),
      findUnique: overrides.findUnique ?? jest.fn(async () => USER),
      create: overrides.create ?? jest.fn(async () => USER),
    },
  }
}

describe('ClerkAuthGuard (session JWT)', () => {
  beforeEach(() => {
    process.env.AUTH_JWT_SECRET = 'guard-jwt-secret'
    process.env.NODE_ENV = 'development'
  })

  it('attaches the user for a valid JWT', async () => {
    const prisma = makePrisma()
    const guard = new ClerkAuthGuard(prisma as any)
    const token = signSessionToken('user_1')
    const { ctx, request } = ctxFor(token)
    await expect(guard.canActivate(ctx)).resolves.toBe(true)
    expect(request.user).toEqual({
      id: 'user_1',
      clerkId: null,
      email: 'a@b.com',
      name: 'A',
      sessionIssuedAt: expect.any(Number),
      authenticatedAt: expect.any(Number),
    })
  })

  it('honors the dev_ bypass in development', async () => {
    const findUnique = jest.fn(async () => null)
    const create = jest.fn(async () => ({
      id: 'dev_user',
      clerkId: 'dev_dev@anstoss.app',
      email: 'dev@anstoss.app',
      name: 'dev',
    }))
    const prisma = makePrisma({ findUnique, create })
    const guard = new ClerkAuthGuard(prisma as any)
    const { ctx, request } = ctxFor('dev_dev@anstoss.app')
    await expect(guard.canActivate(ctx)).resolves.toBe(true)
    expect((request.user as any).email).toBe('dev@anstoss.app')
  })

  it('blocks dev_ tokens in production', async () => {
    process.env.NODE_ENV = 'production'
    const guard = new ClerkAuthGuard(makePrisma() as any)
    const { ctx } = ctxFor('dev_x@y.com')
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException)
  })

  it('rejects a missing Authorization header', async () => {
    const guard = new ClerkAuthGuard(makePrisma() as any)
    const { ctx } = ctxFor()
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException)
  })

  it('rejects a bad/forged token with 401', async () => {
    const guard = new ClerkAuthGuard(makePrisma() as any)
    const { ctx } = ctxFor('totally.invalid.token')
    await expect(guard.canActivate(ctx)).rejects.toThrow('Invalid authentication token')
  })

  it('maps an expired token to ClerkTokenExpiredError', async () => {
    const past = Date.now() - 60 * 60 * 1000
    const token = signSessionToken('user_1', { ttlSeconds: 1, now: past })
    const guard = new ClerkAuthGuard(makePrisma() as any)
    const { ctx } = ctxFor(token)
    await expect(guard.canActivate(ctx)).rejects.toThrow(ClerkTokenExpiredError)
  })

  it('401s when the user no longer exists', async () => {
    const prisma = makePrisma({ findFirst: jest.fn(async () => null) })
    const guard = new ClerkAuthGuard(prisma as any)
    const token = signSessionToken('ghost')
    const { ctx } = ctxFor(token)
    await expect(guard.canActivate(ctx)).rejects.toThrow('Account not found')
  })
})
