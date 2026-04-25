import { NotFoundException } from '@nestjs/common'
import { TeamAccessDeniedError } from '@anstoss/shared'
import { RosterSlotsService } from './roster-slots.service'

describe('RosterSlotsService.bulkUpsert', () => {
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

    const result = await service.bulkUpsert('club-1', 'team-1', 'user-1', {
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
      service.bulkUpsert('club-1', 'team-1', 'user-stranger', {
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
})
