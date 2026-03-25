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

  it('blocks authenticated users under the minimum age', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          dateOfBirth: new Date(),
        }),
      },
    }
    const guard = new AgeGateGuard(prisma as never)

    await expect(guard.canActivate(createContext('minor'))).rejects.toBeInstanceOf(
      AgeGateError,
    )
  })
})
