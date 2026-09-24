import { NotFoundException } from '@nestjs/common'
import { ConsentService } from './consent.service'

// Regression: an admin of club A could inspect a member of club B by user id
// and receive name, email and date of birth (external audit 2026-09-24).
describe('ConsentService.inspectConsentStatus tenant scoping', () => {
  function build(userInClub: boolean) {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(
          userInClub
            ? { id: 'u1', name: 'Tim Weber', email: 't@example.com', dateOfBirth: null }
            : null,
        ),
        findUnique: jest.fn(),
      },
      parentalConsent: { findMany: jest.fn().mockResolvedValue([]) },
    }
    return { prisma, service: new ConsentService(prisma as never, {} as never) }
  }

  it('returns 404 for a user who is not a member of the admin club', async () => {
    const { prisma, service } = build(false)
    await expect(service.inspectConsentStatus('club-a', 'u-from-club-b')).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u-from-club-b', memberships: { some: { clubId: 'club-a' } } },
      }),
    )
  })

  it('only reads consent records of the admin club', async () => {
    const { prisma, service } = build(true)
    await service.inspectConsentStatus('club-a', 'u1')
    expect(prisma.parentalConsent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { playerUserId: 'u1', clubId: 'club-a' } }),
    )
  })
})
