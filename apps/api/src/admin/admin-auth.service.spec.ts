import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { scryptSync } from 'node:crypto'
import { AdminAuthService } from './admin-auth.service'
import { ADMIN_CONSOLE_AUDIENCE, ADMIN_CONSOLE_SESSION_TTL_SECONDS } from './admin-auth.config'
import { verifySessionToken } from '../auth/otp/jwt.util'

describe('AdminAuthService', () => {
  const originalEnv = { ...process.env }
  const salt = Buffer.from('0123456789abcdef0123456789abcdef', 'hex')

  function passwordHashFor(password: string) {
    return `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 64).toString('hex')}`
  }

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      AUTH_JWT_SECRET: 'admin-auth-secret',
      ADMIN_CONSOLE_USERNAME: 'admin',
      ADMIN_CONSOLE_PASSWORD_HASH: passwordHashFor('correct horse battery staple'),
      ADMIN_CONSOLE_EMAIL: 'admin@anstoss.io',
      ADMIN_CONSOLE_NAME: 'Anstoss Admin',
    }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('creates or promotes the configured platform admin and returns a session', async () => {
    const prisma = {
      user: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: any) => ({
          id: 'user_1',
          email: data.email,
          name: data.name,
          clerkId: null,
        })),
      },
    }

    const service = new AdminAuthService(prisma as any)
    const result = await service.login('Admin', 'correct horse battery staple')
    const claims = verifySessionToken(result.token)

    expect(result.token).toEqual(expect.any(String))
    expect(claims.aud).toBe(ADMIN_CONSOLE_AUDIENCE)
    expect(claims.exp - claims.iat).toBe(ADMIN_CONSOLE_SESSION_TTL_SECONDS)
    expect(claims.admin_v).toEqual(expect.any(String))
    expect(result.user).toMatchObject({
      id: 'user_1',
      email: 'admin@anstoss.io',
      name: 'Anstoss Admin',
    })
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'admin@anstoss.io',
          platformRole: 'PLATFORM_ADMIN',
        }),
      }),
    )
  })

  it('supports scrypt password hashes', async () => {
    process.env.ADMIN_CONSOLE_PASSWORD_HASH = passwordHashFor('p455w0rd')

    const prisma = {
      user: {
        findFirst: jest.fn(async () => ({
          id: 'user_2',
          email: 'admin@anstoss.io',
          name: 'Old Name',
          clerkId: null,
        })),
        update: jest.fn(async ({ where, data }: any) => ({
          id: where.id,
          email: 'admin@anstoss.io',
          name: data.name,
          clerkId: null,
        })),
      },
    }

    const service = new AdminAuthService(prisma as any)
    const result = await service.login('admin', 'p455w0rd')

    expect(result.user.name).toBe('Anstoss Admin')
    expect(prisma.user.update).toHaveBeenCalled()
  })

  it('rejects bad credentials', async () => {
    const prisma = {
      user: {
        findFirst: jest.fn(),
      },
    }
    const service = new AdminAuthService(prisma as any)
    await expect(service.login('admin', 'wrong')).rejects.toThrow(UnauthorizedException)
  })

  it('fails closed when admin console credentials are missing', async () => {
    delete process.env.ADMIN_CONSOLE_USERNAME
    delete process.env.ADMIN_CONSOLE_PASSWORD_HASH

    const service = new AdminAuthService({ user: {} } as any)
    await expect(service.login('admin', 'anything')).rejects.toThrow(
      ServiceUnavailableException,
    )
  })
})
