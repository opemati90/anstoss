import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { ConsentService } from './consent.service'
import { getClubId } from '../prisma/tenant.context'

// Regression: ISSUE-003 — any signed-in user could decide another guardian's consent
// Found by /qa on 2026-08-21
// Report: .gstack/qa-reports/qa-report-anstoss-launch-2026-08-21.md
describe('ConsentService authorization and tuple integrity', () => {
  const adultDob = new Date('1980-01-01T00:00:00.000Z')

  it('rejects a consent decision from a different authenticated email', async () => {
    const consent = {
      id: 'consent-1',
      clubId: 'club-1',
      teamId: 'team-1',
      playerUserId: 'child-1',
      guardianEmail: 'parent@example.com',
      guardianUserId: null,
      status: 'PENDING',
    }
    const tx = { parentalConsent: { findUnique: jest.fn().mockResolvedValue(consent) } }
    const prisma = {
      parentalConsent: {
        findUnique: jest.fn().mockResolvedValue({ clubId: 'club-1' }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'attacker',
          email: 'attacker@example.com',
          dateOfBirth: adultDob,
        }),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => {
        expect(getClubId()).toBe('club-1')
        return fn(tx)
      }),
    }
    const service = new ConsentService(prisma as never, {} as never)

    await expect(service.approveConsent('consent-1', 'attacker')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('loses a concurrent decision race before activating access', async () => {
    const consent = {
      id: 'consent-1',
      clubId: 'club-1',
      teamId: 'team-1',
      playerUserId: 'child-1',
      guardianEmail: 'parent@example.com',
      guardianUserId: null,
      status: 'PENDING',
    }
    const tx = {
      parentalConsent: {
        findUnique: jest.fn().mockResolvedValue(consent),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      teamAccess: { updateMany: jest.fn() },
    }
    const prisma = {
      parentalConsent: {
        findUnique: jest.fn().mockResolvedValue({ clubId: 'club-1' }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'guardian-1',
          email: 'parent@example.com',
          dateOfBirth: adultDob,
        }),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    }
    const service = new ConsentService(prisma as never, {} as never)

    await expect(service.approveConsent('consent-1', 'guardian-1')).rejects.toBeInstanceOf(
      ConflictException,
    )
    expect(tx.teamAccess.updateMany).not.toHaveBeenCalled()
  })

  it('rejects a consent request for a player outside the supplied club/team tuple', async () => {
    const prisma = {
      team: { findFirst: jest.fn().mockResolvedValue(null) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'child-1', dateOfBirth: new Date('2015-01-01') }) },
      membership: { findUnique: jest.fn().mockResolvedValue({ userId: 'child-1' }) },
      teamAccess: { findFirst: jest.fn().mockResolvedValue({ id: 'access-1' }) },
    }
    const service = new ConsentService(prisma as never, {} as never)

    await expect(
      service.createConsentRequest({
        clubId: 'club-1',
        teamId: 'foreign-team',
        playerUserId: 'child-1',
        guardianEmail: 'parent@example.com',
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })
})
