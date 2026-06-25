import { ServiceUnavailableException } from '@nestjs/common'
import { HealthController } from './health.controller'

describe('HealthController', () => {
  it('returns ok when the database responds', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    }
    const controller = new HealthController(prisma as any)

    await expect(controller.check()).resolves.toMatchObject({
      status: 'ok',
      db: 'ok',
    })
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith('SELECT 1')
  })

  it('fails the readiness check when the database is unavailable', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockRejectedValue(new Error('db down')),
    }
    const controller = new HealthController(prisma as any)

    await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException)
  })
})
