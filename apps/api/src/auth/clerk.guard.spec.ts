import type { ExecutionContext } from '@nestjs/common'
import { createPublicKey } from 'node:crypto'
import { createClerkClient, verifyToken } from '@clerk/backend'
import { ClerkAuthGuard } from './clerk.guard'

jest.mock('@clerk/backend', () => ({
  verifyToken: jest.fn(),
  createClerkClient: jest.fn(() => ({
    users: {
      getUser: jest.fn(),
    },
  })),
}))

jest.mock('node:crypto', () => ({
  createPublicKey: jest.fn(() => ({
    export: jest.fn(() => 'pem-public-key'),
  })),
}))

const mockedVerifyToken = verifyToken as jest.Mock
const mockedCreateClerkClient = createClerkClient as jest.Mock
const mockedCreatePublicKey = createPublicKey as jest.Mock
let mockGetClerkUser: jest.Mock

function createUnsignedToken(payload: Record<string, unknown>) {
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')

  return `${encode({ alg: 'RS256', kid: 'kid_123' })}.${encode(payload)}.signature`
}

describe('ClerkAuthGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetClerkUser = jest.fn()
    mockedCreateClerkClient.mockImplementation(() => ({
      users: {
        getUser: mockGetClerkUser,
      },
    }))
    process.env.CLERK_SECRET_KEY = 'sk_test_123'
    delete process.env.CLERK_JWT_KEY
    global.fetch = jest.fn()
  })

  it('recovers from a concurrent JIT user create conflict', async () => {
    const createdUser = {
      id: 'user_123',
      clerkId: 'clerk_123',
      email: 'coach@example.com',
      name: 'Casey Coach',
    }

    const prisma = {
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)   // clerkId lookup → not found
          .mockResolvedValueOnce(null)   // email lookup → not found
          .mockResolvedValueOnce(createdUser), // race-condition fallback clerkId → found
        findUnique: jest.fn(),
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
        update: jest.fn(),
      },
    }

    mockedVerifyToken.mockResolvedValue({
      sub: 'clerk_123',
      email: 'coach@example.com',
      first_name: 'Casey',
      last_name: 'Coach',
    })

    const request = {
      headers: {
        authorization: 'Bearer token_123',
      },
    }

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext

    const guard = new ClerkAuthGuard(prisma as any)

    await expect(guard.canActivate(context)).resolves.toBe(true)

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        clerkId: 'clerk_123',
        email: 'coach@example.com',
        name: 'Casey Coach',
      },
    })
    expect(request).toMatchObject({
      user: createdUser,
    })
    expect(mockedCreateClerkClient).not.toHaveBeenCalled()
  })

  it('relinks an existing email user when the stored Clerk binding is missing', async () => {
    const existingEmailUser = {
      id: 'user_db_123',
      clerkId: 'clerk_old',
      email: 'coach@example.com',
      name: 'Casey Coach',
    }
    const relinkedUser = {
      ...existingEmailUser,
      clerkId: 'clerk_new',
    }

    const prisma = {
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)           // clerkId lookup → not found
          .mockResolvedValueOnce(existingEmailUser), // email lookup → found
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue(relinkedUser),
      },
    }

    mockedVerifyToken.mockResolvedValue({
      sub: 'clerk_new',
      email: 'coach@example.com',
    })
    mockGetClerkUser.mockRejectedValue({ status: 404 })

    const request = {
      headers: {
        authorization: 'Bearer token_123',
      },
    }
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext

    const guard = new ClerkAuthGuard(prisma as any)

    await expect(guard.canActivate(context)).resolves.toBe(true)

    expect(mockGetClerkUser).toHaveBeenCalledWith('clerk_old')
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user_db_123' },
      data: {
        clerkId: 'clerk_new',
        email: 'coach@example.com',
      },
    })
    expect(request).toMatchObject({
      user: relinkedUser,
    })
  })

  it('relinks an existing email user when the stored Clerk binding no longer owns that email', async () => {
    const existingEmailUser = {
      id: 'user_db_123',
      clerkId: 'clerk_old',
      email: 'coach@example.com',
      name: 'Casey Coach',
    }
    const relinkedUser = {
      ...existingEmailUser,
      clerkId: 'clerk_new',
    }

    const prisma = {
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)           // clerkId lookup → not found
          .mockResolvedValueOnce(existingEmailUser), // email lookup → found
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue(relinkedUser),
      },
    }

    mockedVerifyToken.mockResolvedValue({
      sub: 'clerk_new',
      email: 'coach@example.com',
    })
    mockGetClerkUser.mockResolvedValue({
      emailAddresses: [
        {
          emailAddress: 'former-owner@example.com',
        },
      ],
    })

    const request = {
      headers: {
        authorization: 'Bearer token_123',
      },
    }
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext

    const guard = new ClerkAuthGuard(prisma as any)

    await expect(guard.canActivate(context)).resolves.toBe(true)

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user_db_123' },
      data: {
        clerkId: 'clerk_new',
        email: 'coach@example.com',
      },
    })
  })

  it('rejects an email relink when the stored Clerk binding still owns that email', async () => {
    const existingEmailUser = {
      id: 'user_db_123',
      clerkId: 'clerk_old',
      email: 'coach@example.com',
      name: 'Casey Coach',
    }

    const prisma = {
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)           // clerkId lookup → not found
          .mockResolvedValueOnce(existingEmailUser), // email lookup → found
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    }

    mockedVerifyToken.mockResolvedValue({
      sub: 'clerk_new',
      email: 'coach@example.com',
    })
    mockGetClerkUser.mockResolvedValue({
      emailAddresses: [
        {
          emailAddress: 'coach@example.com',
        },
      ],
    })

    const request = {
      headers: {
        authorization: 'Bearer token_123',
      },
    }
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext

    const guard = new ClerkAuthGuard(prisma as any)

    await expect(guard.canActivate(context)).rejects.toThrow(
      'Email already belongs to an existing account',
    )
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('falls back to JWKS verification when no Clerk secret is configured', async () => {
    delete process.env.CLERK_SECRET_KEY

    const createdUser = {
      id: 'user_456',
      clerkId: 'clerk_456',
      email: 'clerk_456@anstoss.app',
      name: 'Player',
    }

    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(null), // clerkId lookup → not found
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue(createdUser),
        update: jest.fn(),
      },
    }

    mockedVerifyToken.mockResolvedValue({
      sub: 'clerk_456',
    })

    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        keys: [
          {
            kid: 'kid_123',
            kty: 'RSA',
            n: 'test-modulus',
            e: 'AQAB',
          },
        ],
      }),
    })

    const request = {
      headers: {
        authorization: `Bearer ${createUnsignedToken({
          sub: 'clerk_456',
          iss: 'https://precious-hawk-48.clerk.accounts.dev',
        })}`,
      },
    }

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext

    const guard = new ClerkAuthGuard(prisma as any)

    await expect(guard.canActivate(context)).resolves.toBe(true)

    expect(global.fetch).toHaveBeenCalledWith(
      new URL('https://precious-hawk-48.clerk.accounts.dev/.well-known/jwks.json'),
    )
    expect(mockedCreatePublicKey).toHaveBeenCalledWith({
      key: {
        kid: 'kid_123',
        kty: 'RSA',
        n: 'test-modulus',
        e: 'AQAB',
      },
      format: 'jwk',
    })
    expect(mockedVerifyToken).toHaveBeenCalledWith(request.headers.authorization.slice(7), {
      jwtKey: 'pem-public-key',
    })
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        clerkId: 'clerk_456',
        email: 'clerk_456@anstoss.app',
        name: 'Player',
      },
    })
    expect(mockedCreateClerkClient).not.toHaveBeenCalled()
  })
})
