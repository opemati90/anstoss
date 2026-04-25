import { NotFoundException } from '@nestjs/common'
import { TeamAccessDeniedError, RosterSlotAlreadyClaimedError, UserAlreadyOnRosterError } from '@anstoss/shared'
import { RosterSlotsService } from './roster-slots.service'

describe('RosterSlotsService.bulkCreate', () => {
  function createService() {
    const prisma = {
      membership: {
        findFirst: jest.fn(),
      },
      team: {
        findFirst: jest.fn(),
      },
      rosterSlot: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    }
    const service = new RosterSlotsService(prisma as never)
    return { prisma, service }
  }

  it('admin can bulk-create slots', async () => {
    const { prisma, service } = createService()
    prisma.membership.findFirst.mockResolvedValue({ role: 'OWNER' })
    prisma.team.findFirst.mockResolvedValue({ id: 'team-1' })
    const slots = [
      { id: 'slot-1', teamId: 'team-1', fullName: 'Max Mustermann', position: 'GK', jerseyNumber: 1, dateOfBirth: null },
      { id: 'slot-2', teamId: 'team-1', fullName: 'Lars Schmidt', position: 'DEF', jerseyNumber: 5, dateOfBirth: null },
    ]
    prisma.$transaction.mockResolvedValue(slots)

    const result = await service.bulkCreate('club-1', 'team-1', 'user-1', {
      slots: [
        { fullName: 'Max Mustermann', position: 'GK', jerseyNumber: 1 },
        { fullName: 'Lars Schmidt', position: 'DEF', jerseyNumber: 5 },
      ],
    })

    expect(result).toHaveLength(2)
    expect(prisma.$transaction).toHaveBeenCalled()
  })

  it('non-admin caller is rejected', async () => {
    const { prisma, service } = createService()
    prisma.membership.findFirst.mockResolvedValue(null)

    await expect(
      service.bulkCreate('club-1', 'team-1', 'user-stranger', {
        slots: [{ fullName: 'Max Mustermann' }],
      }),
    ).rejects.toThrow(TeamAccessDeniedError)
  })
})

describe('RosterSlotsService.list', () => {
  function createService() {
    const prisma = {
      membership: {
        findFirst: jest.fn(),
      },
      rosterSlot: {
        findMany: jest.fn(),
      },
    }
    const service = new RosterSlotsService(prisma as never)
    return { prisma, service }
  }

  it('list returns all slots for the team', async () => {
    const { prisma, service } = createService()
    prisma.membership.findFirst.mockResolvedValue({ role: 'OWNER' })
    prisma.rosterSlot.findMany.mockResolvedValue([
      { id: 'slot-1', teamId: 'team-1', fullName: 'Max Mustermann', jerseyNumber: 1 },
      { id: 'slot-2', teamId: 'team-1', fullName: 'Lars Schmidt', jerseyNumber: 5 },
    ])

    const result = await service.list('club-1', 'team-1', 'user-1')

    expect(result).toHaveLength(2)
    expect(prisma.rosterSlot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ jerseyNumber: 'asc' }, { fullName: 'asc' }],
      }),
    )
  })

  it('non-manager does not receive dateOfBirth (GDPR Article 8)', async () => {
    const { prisma, service } = createService()
    prisma.membership.findFirst.mockResolvedValue({ role: 'PLAYER' })
    prisma.rosterSlot.findMany.mockResolvedValue([
      { id: 'slot-1', teamId: 'team-1', fullName: 'Max Mustermann', jerseyNumber: 1 },
    ])

    await service.list('club-1', 'team-1', 'user-player')

    expect(prisma.rosterSlot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ dateOfBirth: false }),
      }),
    )
  })

  it('manager receives dateOfBirth', async () => {
    const { prisma, service } = createService()
    prisma.membership.findFirst.mockResolvedValue({ role: 'OWNER' })
    prisma.rosterSlot.findMany.mockResolvedValue([
      { id: 'slot-1', teamId: 'team-1', fullName: 'Max Mustermann', jerseyNumber: 1, dateOfBirth: new Date('2010-03-15') },
    ])

    await service.list('club-1', 'team-1', 'user-owner')

    expect(prisma.rosterSlot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ dateOfBirth: true }),
      }),
    )
  })
})

describe('RosterSlotsService.claim', () => {
  function createService() {
    const prisma = {
      membership: {
        findFirst: jest.fn(),
      },
      rosterSlot: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    }
    const service = new RosterSlotsService(prisma as never)
    return { prisma, service }
  }

  it('marks the slot claimed by the user', async () => {
    const { prisma, service } = createService()
    const claimedAt = new Date()
    const tx = {
      rosterSlot: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({
          id: 'slot-1', teamId: 'team-1', claimedByUserId: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'slot-1', teamId: 'team-1', claimedByUserId: 'user-1', claimedAt,
        }),
      },
    }
    prisma.$transaction.mockImplementation((fn: any) => fn(tx))

    const result = await service.claim('team-1', 'slot-1', 'user-1')

    expect(result.claimedByUserId).toBe('user-1')
    expect(result.claimedAt).toBeInstanceOf(Date)
    expect(tx.rosterSlot.updateMany).toHaveBeenCalledWith({
      where: { id: 'slot-1', claimedByUserId: null },
      data: { claimedByUserId: 'user-1', claimedAt: expect.any(Date) },
    })
    expect(tx.rosterSlot.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 'slot-1' } })
  })

  it('rejects claim on an already-claimed slot', async () => {
    const { prisma, service } = createService()
    const tx = {
      rosterSlot: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({
          id: 'slot-1', teamId: 'team-1', claimedByUserId: 'someone-else',
        }),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
    }
    prisma.$transaction.mockImplementation((fn: any) => fn(tx))

    await expect(service.claim('team-1', 'slot-1', 'user-2'))
      .rejects.toThrow(/already claimed/i)
    // Defense-in-depth pre-check should short-circuit before write.
    expect(tx.rosterSlot.updateMany).not.toHaveBeenCalled()
  })

  it('rejects when user already claimed a different slot', async () => {
    const { prisma, service } = createService()
    const tx = {
      rosterSlot: {
        findFirst: jest.fn().mockResolvedValue({ id: 'other-slot' }),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
    }
    prisma.$transaction.mockImplementation((fn: any) => fn(tx))

    await expect(service.claim('team-1', 'slot-1', 'user-1'))
      .rejects.toThrow(/already on the roster/i)
  })

  it('rejects when slot becomes claimed mid-transaction (race)', async () => {
    const { prisma, service } = createService()
    // findFirst sees no existing claim by this user; findUnique sees an unclaimed slot;
    // but updateMany returns count: 0 because another concurrent tx claimed it first.
    const tx = {
      rosterSlot: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({
          id: 'slot-1', teamId: 'team-1', claimedByUserId: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: jest.fn(),
      },
    }
    prisma.$transaction.mockImplementation((fn: any) => fn(tx))

    await expect(service.claim('team-1', 'slot-1', 'user-1'))
      .rejects.toThrow(RosterSlotAlreadyClaimedError)
    expect(tx.rosterSlot.updateMany).toHaveBeenCalledWith({
      where: { id: 'slot-1', claimedByUserId: null },
      data: { claimedByUserId: 'user-1', claimedAt: expect.any(Date) },
    })
    expect(tx.rosterSlot.findUniqueOrThrow).not.toHaveBeenCalled()
  })
})
