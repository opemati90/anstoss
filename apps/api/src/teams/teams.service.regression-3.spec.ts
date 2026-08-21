import { TeamAccessPhase, TeamAccessStatus, TeamRole } from '@anstoss/shared'
import { TeamsService } from './teams.service'

// Regression: adversarial re-audit — trial/loan revocation left live sockets subscribed.
describe('TeamsService realtime access change events', () => {
  it('emits after rejecting trial access', async () => {
    const access = {
      id: 'access-1',
      clubId: 'club-1',
      teamId: 'team-1',
      userId: 'player-1',
      phase: TeamAccessPhase.TRIAL,
      status: TeamAccessStatus.PENDING,
      role: TeamRole.PLAYER,
      team: {},
    }
    const prisma = {
      teamAccess: {
        findFirst: jest.fn().mockResolvedValue(access),
        update: jest.fn().mockResolvedValue({ ...access, status: TeamAccessStatus.REJECTED }),
      },
    }
    const events = { emit: jest.fn() }
    const service = new TeamsService(prisma as never, events as never)
    jest.spyOn(service as any, 'assertManageAccess').mockResolvedValue(undefined)

    await service.decideTrialAccess('club-1', 'access-1', 'manager-1', {
      decision: 'REJECT',
    })

    expect(events.emit).toHaveBeenCalledWith('realtime.access.changed', {
      userId: 'player-1',
    })
  })

  it('emits after recalling a player loan', async () => {
    const access = {
      id: 'loan-1',
      clubId: 'club-1',
      teamId: 'target-1',
      userId: 'player-1',
      loanedFromTeamId: 'source-1',
      status: TeamAccessStatus.ACTIVE,
    }
    const prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      teamAccess: {
        findUnique: jest.fn().mockResolvedValue(access),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      guardianRelationship: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
      membership: { findUnique: jest.fn() },
    }
    Object.assign(prisma, {
      $transaction: jest.fn(async (callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
      ),
    })
    const events = { emit: jest.fn() }
    const service = new TeamsService(prisma as never, events as never)
    jest.spyOn(service as any, 'assertLoanManageAccess').mockResolvedValue(undefined)

    await service.recallPlayerLoan('club-1', 'source-1', 'loan-1', 'manager-1')

    expect(events.emit).toHaveBeenCalledWith('realtime.access.changed', {
      userId: 'player-1',
    })
  })
})
