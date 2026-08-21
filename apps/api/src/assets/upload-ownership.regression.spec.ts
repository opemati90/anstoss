import { BadRequestException } from '@nestjs/common'
import { UsersService } from '../users/users.service'
import { ClubsService } from '../clubs/clubs.service'

// Regression: adversarial re-audit — profile/club PATCH accepted arbitrary URLs.
describe('uploaded asset ownership', () => {
  it('rejects an avatar URL outside the authenticated user namespace', async () => {
    const r2 = {
      enabled: true,
      objectKeyFromUrl: jest.fn().mockReturnValue('users/attacker/avatar/x.png'),
      assertStoredObject: jest.fn(),
    }
    const service = new UsersService(
      {} as never, {} as never, {} as never, {} as never, {} as never,
      r2 as never,
    )

    await expect(
      (service as any).assertOwnedAvatarUpload('victim', 'https://assets.example/x.png'),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(r2.assertStoredObject).not.toHaveBeenCalled()
  })

  it('rejects a badge URL outside the target club namespace', async () => {
    const prisma = { club: { update: jest.fn() } }
    const r2 = {
      enabled: true,
      objectKeyFromUrl: jest.fn().mockReturnValue('other-club/club_badge/x.png'),
      assertStoredObject: jest.fn(),
    }
    const service = new ClubsService(prisma as never, undefined, r2 as never)

    await expect(
      service.updateClub('club-1', { badgeUrl: 'https://assets.example/x.png' }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.club.update).not.toHaveBeenCalled()
  })
})
