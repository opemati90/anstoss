import { OnboardingService } from './onboarding.service'
import { ClubActivationService } from '../club-activation/club-activation.service'
import { ConflictException } from '@nestjs/common'
import { MembershipRole } from '@prisma/client'

// Regression: ISSUE-005 — a guessed short team code granted immediate player access
// Found by /qa on 2026-08-21
// Report: .gstack/qa-reports/qa-report-anstoss-launch-2026-08-21.md
describe('OnboardingService secure team-code join', () => {
  it('turns a valid player code into a manager-approved join request only', async () => {
    const prisma = {
      team: {
        findUnique: jest.fn().mockResolvedValue({ id: 'team-1', clubId: 'club-1' }),
      },
      $transaction: jest.fn(),
      membership: { create: jest.fn() },
      teamAccess: { create: jest.fn() },
    }
    const joinRequests = { create: jest.fn().mockResolvedValue({ id: 'request-1' }) }
    const service = new OnboardingService(prisma as never, {} as never, joinRequests as never)

    await expect(
      service.joinTeamByCode('user-1', {
        joinCode: 'AB23XC45ZK',
        role: 'PLAYER',
      }),
    ).resolves.toEqual({ clubId: 'club-1', teamId: 'team-1', status: 'PENDING' })
    expect(joinRequests.create).toHaveBeenCalledWith('user-1', 'club-1', {
      teamId: 'team-1',
      role: 'PLAYER',
    })
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(prisma.membership.create).not.toHaveBeenCalled()
    expect(prisma.teamAccess.create).not.toHaveBeenCalled()
  })

  it('turns a coach code into an inert staff claim without membership or team access', async () => {
    const prisma = {
      team: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'team-1',
          clubId: 'club-1',
        }),
      },
      membership: { create: jest.fn() },
      teamAccess: { create: jest.fn() },
      $transaction: jest.fn(),
    }
    const staffClaims = { submitStaffRequest: jest.fn().mockResolvedValue({ id: 'claim-1' }) }
    const service = new OnboardingService(
      prisma as never,
      {} as never,
      { create: jest.fn() } as never,
      staffClaims as never,
    )

    await expect(
      service.joinTeamByCode('coach-1', {
        joinCode: 'AB23XC45ZK',
        role: 'COACH',
      }),
    ).resolves.toEqual({ clubId: 'club-1', teamId: 'team-1', status: 'PENDING' })
    expect(staffClaims.submitStaffRequest).toHaveBeenCalledWith('coach-1', 'club-1', {
      desiredRole: 'COACH',
      requestedTeamIds: ['team-1'],
      teamRoles: ['ASSISTANT_COACH'],
    })
    expect(prisma.membership.create).not.toHaveBeenCalled()
    expect(prisma.teamAccess.create).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it.each([MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.COACH])(
    'rejects an existing %s whose authority appears while a coach-code claim is locking',
    async (role) => {
      const tx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        membership: { findUnique: jest.fn().mockResolvedValue({ role }) },
        clubClaim: {
          findMany: jest.fn().mockResolvedValue([]),
          updateMany: jest.fn(),
          findFirst: jest.fn(),
          create: jest.fn(),
        },
      }
      const prisma = {
        team: {
          findUnique: jest.fn().mockResolvedValue({ id: 'team-1', clubId: 'club-1' }),
          count: jest.fn().mockResolvedValue(1),
        },
        clubDirectoryEntry: { findFirst: jest.fn().mockResolvedValue({ id: 'directory-1' }) },
        membership: { findUnique: jest.fn().mockResolvedValue(null) },
        clubClaim: { findFirst: jest.fn().mockResolvedValue(null) },
        $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
      }
      const staffClaims = new ClubActivationService(
        prisma as never,
        { log: jest.fn() } as never,
        {} as never,
        {} as never,
      )
      const service = new OnboardingService(
        prisma as never,
        {} as never,
        { create: jest.fn() } as never,
        staffClaims as never,
      )

      await expect(
        service.joinTeamByCode(`${role.toLowerCase()}-1`, {
          joinCode: 'AB23XC45ZK',
          role: 'COACH',
        }),
      ).rejects.toBeInstanceOf(ConflictException)
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
      expect(tx.clubClaim.create).not.toHaveBeenCalled()
    },
  )
})
