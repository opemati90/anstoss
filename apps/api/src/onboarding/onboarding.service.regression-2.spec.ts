import { OnboardingService } from './onboarding.service'

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
          club: { directoryEntry: { id: 'directory-1' } },
        }),
      },
      clubClaim: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'claim-1' }),
      },
      membership: { create: jest.fn() },
      teamAccess: { create: jest.fn() },
      $transaction: jest.fn(),
    }
    const service = new OnboardingService(
      prisma as never,
      {} as never,
      { create: jest.fn() } as never,
    )

    await expect(
      service.joinTeamByCode('coach-1', {
        joinCode: 'AB23XC45ZK',
        role: 'COACH',
      }),
    ).resolves.toEqual({ clubId: 'club-1', teamId: 'team-1', status: 'PENDING' })
    expect(prisma.clubClaim.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clubId: 'club-1',
        claimantUserId: 'coach-1',
        kind: 'STAFF_CLAIM',
        desiredRole: 'COACH',
        requestedTeamIds: ['team-1'],
        requestedTeamRoles: ['ASSISTANT_COACH'],
      }),
    })
    expect(prisma.membership.create).not.toHaveBeenCalled()
    expect(prisma.teamAccess.create).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
