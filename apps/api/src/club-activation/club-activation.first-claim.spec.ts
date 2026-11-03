import { ForbiddenException } from '@nestjs/common'
import { RegistrationRole } from '@anstoss/shared'
import { ClubActivationService } from './club-activation.service'

// Onboarding review fix (H3): CLUB_ADMIN is written with the claim, not before.
describe('ClubActivationService.submitFirstClaim role handling', () => {
  function setup(opts: { role: RegistrationRole | null; membership?: boolean }) {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      clubClaim: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'claim-1', status: 'SUBMITTED' }),
      },
      clubDirectoryEntry: { findUnique: jest.fn().mockResolvedValue({ activeClubId: null }) },
      user: { update: jest.fn().mockResolvedValue({}) },
      clubClaimEvidence: { create: jest.fn() },
    }
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ registrationRole: opts.role }),
        findFirst: jest.fn().mockResolvedValue({ dateOfBirth: new Date('1990-01-01') }) },
      membership: { findFirst: jest.fn().mockResolvedValue(opts.membership ? { id: 'm' } : null) },
      clubDirectoryEntry: {
        findUnique: jest.fn().mockResolvedValue({ id: 'dir-1', activeClubId: null }),
      },
      clubClaim: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    }
    const service = new ClubActivationService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    )
    return { service, tx }
  }

  const input = {
    directoryEntryId: 'dir-1',
    teamName: 'Herren I',
    teamGroupType: 'SENIOR',
    teamRoles: [],
    primaryColor: '#1B4F9C',
    externalTeamUrl: 'https://www.fussball.de/mannschaft/sv-albatros',
  } as never

  it('sets CLUB_ADMIN inside the claim transaction for a fresh account', async () => {
    const { service, tx } = setup({ role: RegistrationRole.PLAYER })
    await service.submitFirstClaim('user-1', 'tim@example.de', input)
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { registrationRole: RegistrationRole.CLUB_ADMIN },
    })
    expect(tx.clubClaim.create).toHaveBeenCalled()
  })

  it('does not rewrite the role for an existing club admin', async () => {
    const { service, tx } = setup({ role: RegistrationRole.CLUB_ADMIN })
    await service.submitFirstClaim('user-1', 'tim@example.de', input)
    expect(tx.user.update).not.toHaveBeenCalled()
  })

  it('refuses a non-admin who already belongs to a club', async () => {
    const { service, tx } = setup({ role: RegistrationRole.PLAYER, membership: true })
    await expect(service.submitFirstClaim('user-1', null, input)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(tx.clubClaim.create).not.toHaveBeenCalled()
  })
})
