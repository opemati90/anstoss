import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { PlayerPosition, PlayerSearchStatus } from '@anstoss/shared'
import { PlayerSearchService } from './player-search.service'

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'search-1',
    clubId: 'club-1',
    teamId: 'team-2',
    positions: [PlayerPosition.GK],
    note: 'Kreisliga A, Training Di + Do',
    status: PlayerSearchStatus.OPEN,
    expiresAt: null,
    createdAt: new Date('2026-09-20T10:00:00Z'),
    club: { id: 'club-1', name: 'SV Albatros', badgeUrl: null, primaryColor: '#1B4F9C', city: 'Potsdam' },
    team: { id: 'team-2', displayName: 'Herren II', leagueName: 'Kreisliga A', ageGroup: null },
    ...overrides,
  }
}

function createService(opts: { role?: string | null; coachedTeams?: string[] } = {}) {
  const prisma = {
    membership: {
      findUnique: jest
        .fn()
        .mockResolvedValue(opts.role === null ? null : { role: opts.role ?? 'COACH' }),
    },
    teamAccess: {
      findMany: jest
        .fn()
        .mockResolvedValue((opts.coachedTeams ?? ['team-2']).map((teamId) => ({ teamId }))),
    },
    team: { findFirst: jest.fn().mockResolvedValue({ id: 'team-2' }) },
    playerSearch: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      create: jest.fn().mockImplementation(async ({ data }: any) => row(data)),
      update: jest.fn().mockImplementation(async ({ data }: any) => row(data)),
      count: jest.fn().mockResolvedValue(0),
    },
    trialInvite: { findMany: jest.fn().mockResolvedValue([]) },
  }
  return { prisma, service: new PlayerSearchService(prisma as never) }
}

describe('PlayerSearchService (Gesuche)', () => {
  it('lets a coach post a Gesuch for their team', async () => {
    const { service, prisma } = createService()

    const created = await service.create('club-1', 'coach-1', {
      teamId: 'team-2',
      positions: [PlayerPosition.GK, PlayerPosition.GK],
      note: 'Kreisliga A, Training Di + Do',
      expiresAt: '2099-10-31',
    })

    expect(prisma.playerSearch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clubId: 'club-1',
          teamId: 'team-2',
          positions: [PlayerPosition.GK],
          createdByUserId: 'coach-1',
          expiresAt: new Date('2099-10-31T23:59:59.999Z'),
        }),
      }),
    )
    expect(created.openTrialCount).toBe(0)
  })

  it('keeps coaches out of other teams and plain members out entirely', async () => {
    const other = createService({ coachedTeams: ['team-9'] })
    await expect(
      other.service.create('club-1', 'coach-1', { teamId: 'team-2', positions: [PlayerPosition.GK] }),
    ).rejects.toBeInstanceOf(NotFoundException)

    const player = createService({ role: 'PLAYER', coachedTeams: [] })
    await expect(player.service.listForClub('club-1', 'player-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    )

    const outsider = createService({ role: null })
    await expect(outsider.service.listForClub('club-1', 'x')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('rejects an end date in the past', async () => {
    const { service } = createService({ role: 'ADMIN' })
    await expect(
      service.create('club-1', 'admin-1', {
        teamId: 'team-2',
        positions: [PlayerPosition.DEF],
        expiresAt: '2000-01-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('closes lapsed Gesuche and scopes a coach list to their teams', async () => {
    const { service, prisma } = createService({ coachedTeams: ['team-2'] })
    prisma.playerSearch.findMany.mockResolvedValue([{ ...row(), _count: { trialInvites: 2 } }])

    const list = await service.listForClub('club-1', 'coach-1')

    expect(prisma.playerSearch.updateMany).toHaveBeenCalledWith({
      where: { clubId: 'club-1', status: 'OPEN', expiresAt: { lt: expect.any(Date) } },
      data: { status: 'CLOSED' },
    })
    expect(prisma.playerSearch.findMany.mock.calls[0][0].where).toEqual({
      clubId: 'club-1',
      teamId: { in: ['team-2'] },
    })
    expect(list[0].openTrialCount).toBe(2)
  })

  it('marks a Gesuch as besetzt', async () => {
    const { service, prisma } = createService()
    prisma.playerSearch.findFirst.mockResolvedValue({ id: 'search-1', teamId: 'team-2' })

    const updated = await service.update('club-1', 'search-1', 'coach-1', {
      status: PlayerSearchStatus.FILLED,
    })

    expect(prisma.playerSearch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'FILLED' } }),
    )
    expect(updated.status).toBe('FILLED')
  })

  it('lists open Gesuche near a PLZ and flags the ones the player already asked', async () => {
    const { service, prisma } = createService()
    prisma.playerSearch.findMany.mockResolvedValue([row()])
    prisma.playerSearch.count.mockResolvedValue(1)
    prisma.trialInvite.findMany.mockResolvedValue([{ id: 'invite-7', clubId: 'club-1' }])

    const result = await service.listOpen(
      { page: 1, pageSize: 20, postalCode: '14482', radiusKm: 10, position: PlayerPosition.GK },
      'user-1',
    )

    const where = prisma.playerSearch.findMany.mock.calls[0][0].where
    expect(where).toMatchObject({
      status: 'OPEN',
      positions: { has: PlayerPosition.GK },
      club: { directoryEntry: { is: { postalCode: { startsWith: '144' } } } },
    })
    expect(result.items[0].myTrialInviteId).toBe('invite-7')
    expect(result.total).toBe(1)
  })
})
