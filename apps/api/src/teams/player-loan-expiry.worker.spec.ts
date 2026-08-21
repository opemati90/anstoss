import { TeamAccessStatus } from '@anstoss/shared'
import { getClubId } from '../prisma/tenant.context'
import { PlayerLoanExpiryWorker } from './player-loan-expiry.worker'

describe('PlayerLoanExpiryWorker', () => {
  it('revokes expired loans inside tenant scope and ejects their sockets', async () => {
    const prisma = {
      teamAccess: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'loan-1', clubId: 'club-1', userId: 'player-1' }]),
        updateMany: jest.fn().mockImplementation(async () => {
          expect(getClubId()).toBe('club-1')
          return { count: 1 }
        }),
      },
    }
    const events = { emit: jest.fn() }
    const worker = new PlayerLoanExpiryWorker(prisma as never, events as never)
    const now = new Date('2026-08-21T12:00:00.000Z')

    await expect(worker.runCycle(now)).resolves.toBe(1)
    expect(prisma.teamAccess.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['loan-1'] },
        status: TeamAccessStatus.ACTIVE,
        loanEndDate: { lte: now },
      },
      data: { status: TeamAccessStatus.REVOKED },
    })
    expect(events.emit).toHaveBeenCalledWith('realtime.access.changed', {
      userId: 'player-1',
    })
  })

  it('catches a failed cycle and remains available for the next tick', async () => {
    const prisma = {
      teamAccess: {
        findMany: jest
          .fn()
          .mockRejectedValueOnce(new Error('database unavailable'))
          .mockResolvedValue([]),
      },
    }
    const worker = new PlayerLoanExpiryWorker(prisma as never, { emit: jest.fn() } as never)
    const logger = jest.spyOn((worker as any).logger, 'error').mockImplementation()

    await expect(worker.tick()).resolves.toBeUndefined()
    await expect(worker.tick()).resolves.toBeUndefined()

    expect(logger).toHaveBeenCalledWith(
      'Failed to expire player loans; the next scheduled cycle will retry.',
      expect.any(String),
    )
    expect(prisma.teamAccess.findMany).toHaveBeenCalledTimes(2)
  })

  it('disconnects a guardian whose target-team access depended on the expired loan', async () => {
    const prisma = {
      teamAccess: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'loan-1',
            clubId: 'club-1',
            teamId: 'target-1',
            userId: 'player-1',
            role: 'PLAYER',
            loanedFromTeamId: 'source-1',
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      guardianRelationship: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ parentUserId: 'parent-1', teamId: 'target-1' }]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      membership: { findUnique: jest.fn().mockResolvedValue(null) },
    }
    const events = { emit: jest.fn() }
    const worker = new PlayerLoanExpiryWorker(prisma as never, events as never)

    await worker.runCycle(new Date('2026-08-21T12:00:00.000Z'))

    expect(events.emit).toHaveBeenCalledWith('realtime.access.changed', {
      userId: 'player-1',
    })
    expect(events.emit).toHaveBeenCalledWith('realtime.access.changed', {
      userId: 'parent-1',
    })
  })

  it('keeps a guardian connected when another direct entitlement remains', async () => {
    const prisma = {
      teamAccess: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'loan-1',
            clubId: 'club-1',
            teamId: 'target-1',
            userId: 'player-1',
            role: 'PLAYER',
            loanedFromTeamId: 'source-1',
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn().mockResolvedValue({ id: 'direct-parent-access' }),
      },
      guardianRelationship: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ parentUserId: 'parent-1', teamId: 'target-1' }]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      membership: { findUnique: jest.fn().mockResolvedValue(null) },
    }
    const events = { emit: jest.fn() }
    const worker = new PlayerLoanExpiryWorker(prisma as never, events as never)

    await worker.runCycle(new Date('2026-08-21T12:00:00.000Z'))

    expect(events.emit).not.toHaveBeenCalledWith('realtime.access.changed', {
      userId: 'parent-1',
    })
  })
})
