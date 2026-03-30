import type { ExecutionContext } from '@nestjs/common'
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

const mockedVerifyToken = verifyToken as jest.Mock
const mockedCreateClerkClient = createClerkClient as jest.Mock

describe('ClerkAuthGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.CLERK_SECRET_KEY = 'sk_test_123'
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
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(createdUser),
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
})
