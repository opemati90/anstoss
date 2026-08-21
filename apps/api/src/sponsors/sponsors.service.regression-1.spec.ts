import { BadRequestException } from '@nestjs/common'
import { SponsorsService } from './sponsors.service'

// Regression: adversarial re-audit — sponsor records accepted arbitrary URLs.
describe('SponsorsService upload ownership', () => {
  it('rejects a logo outside the club sponsor namespace', async () => {
    const prisma = { sponsor: { create: jest.fn() } }
    const r2 = {
      enabled: true,
      objectKeyFromUrl: jest.fn().mockReturnValue('other/sponsor_logo/x.png'),
      assertStoredObject: jest.fn(),
    }
    const service = new SponsorsService(prisma as never, r2 as never)

    await expect(
      service.create('club-1', { name: 'Sponsor', logoUrl: 'https://assets.example/x.png' }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.sponsor.create).not.toHaveBeenCalled()
  })
})
