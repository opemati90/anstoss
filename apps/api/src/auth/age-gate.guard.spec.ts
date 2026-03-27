import { ExecutionContext } from '@nestjs/common'
import { AgeGateError } from '@anstoss/shared'
import { AgeGateGuard } from './age-gate.guard'

describe('AgeGateGuard', () => {
  function createContext(userId: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: userId },
        }),
      }),
    } as ExecutionContext
  }

  it('allows authenticated users who meet the minimum age', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          dateOfBirth: new Date('1990-01-01'),
        }),
      },
    }
    const guard = new AgeGateGuard(prisma as never)

    await expect(guard.canActivate(createContext('adult'))).resolves.toBe(true)
  })

  it('blocks under-age users with no parental consent', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          dateOfBirth: new Date(),
        }),
      },
      parentalConsent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    }
    const guard = new AgeGateGuard(prisma as never)

    await expect(guard.canActivate(createContext('minor'))).rejects.toBeInstanceOf(
      AgeGateError,
    )
  })

  it('allows under-age users with approved parental consent', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          dateOfBirth: new Date(),
        }),
      },
      parentalConsent: {
        findMany: jest.fn().mockResolvedValue([
          { status: 'APPROVED' },
        ]),
      },
    }
    const guard = new AgeGateGuard(prisma as never)

    await expect(guard.canActivate(createContext('minor-approved'))).resolves.toBe(true)
  })

  it('blocks under-age users with pending parental consent', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          dateOfBirth: new Date(),
        }),
      },
      parentalConsent: {
        findMany: jest.fn().mockResolvedValue([
          { status: 'PENDING' },
        ]),
      },
    }
    const guard = new AgeGateGuard(prisma as never)

    await expect(guard.canActivate(createContext('minor-pending'))).rejects.toBeInstanceOf(
      AgeGateError,
    )
  })
})
