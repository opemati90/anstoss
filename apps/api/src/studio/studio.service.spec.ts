import {
  StudioService,
  StudioAccessDeniedException,
  StudioPlanRequiredException,
  StudioSelectionNotFoundException,
} from './studio.service'
import { getClubId } from '../prisma/tenant.context'

function setup() {
  const db = {
    membership: { findFirst: jest.fn().mockResolvedValue({ role: 'ADMIN', operationalRoles: [] }) },
    teamAccess: { findMany: jest.fn().mockResolvedValue([{ teamId: 'team-a' }]) },
    team: { findFirst: jest.fn().mockResolvedValue({ id: 'team-a' }) },
    event: { findFirst: jest.fn().mockResolvedValue({ id: 'match-a' }) },
    club: { findUnique: jest.fn().mockResolvedValue({ primaryColor: '#123456', badgeUrl: null }) },
    studioBrandKit: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockImplementation(async () => {
        expect(getClubId()).toBe('club-a')
      }),
    },
    sponsor: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: 's1', name: 'Sponsor', logoUrl: 'https://assets.example/logo.png' },
        ]),
    },
    $transaction: jest.fn(),
  }
  db.$transaction.mockImplementation((fn) => fn(db))
  const plans = { resolve: jest.fn().mockResolvedValue({ tier: 'PRO' }) }
  return { db, plans, service: new StudioService(db as never, plans as never) }
}

describe('Studio server access and context', () => {
  it.each(['OWNER', 'ADMIN'])('allows club-wide context for %s', async (role) => {
    const { db, service } = setup()
    db.membership.findFirst.mockResolvedValue({ role, operationalRoles: [] })
    await expect(service.context('club-a', 'user', { eventId: 'match-a' })).resolves.toEqual({
      eventId: 'match-a',
      consents: [],
    })
    expect(db.event.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ clubId: 'club-a', id: 'match-a' }),
      }),
    )
  })

  it.each(['BOARD_MEMBER', 'MEDIA_MANAGER'])('allows the explicit %s office', async (office) => {
    const { db, service } = setup()
    db.membership.findFirst.mockResolvedValue({ role: 'PLAYER', operationalRoles: [office] })
    await expect(service.context('club-a', 'user', {})).resolves.toHaveProperty(
      'eventId',
      'match-a',
    )
  })

  it.each(['COACH', 'PLAYER', 'PARENT'])('does not infer Studio access from %s', async (role) => {
    const { db, service } = setup()
    db.membership.findFirst.mockResolvedValue({ role, operationalRoles: [] })
    await expect(service.context('club-a', 'user', {})).rejects.toThrow(StudioAccessDeniedException)
    expect(db.event.findFirst).not.toHaveBeenCalled()
  })

  it('rejects a nonmember and scopes the membership to a nondeleted user', async () => {
    const { db, service } = setup()
    db.membership.findFirst.mockResolvedValue(null)
    await expect(service.context('club-a', 'user', {})).rejects.toThrow(StudioAccessDeniedException)
    expect(db.membership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clubId: 'club-a', userId: 'user', user: { deletedAt: null } },
      }),
    )
  })

  it.each(['TEAM_COORDINATOR', 'CAPTAIN'])(
    'limits %s to current full team access',
    async (office) => {
      const { db, service } = setup()
      db.membership.findFirst.mockResolvedValue({ role: 'PLAYER', operationalRoles: [office] })
      await service.context('club-a', 'user', {})
      expect(db.event.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ teamId: { in: ['team-a'] } }) }),
      )
      expect(db.teamAccess.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clubId: 'club-a',
            userId: 'user',
            phase: 'FULL',
            status: 'ACTIVE',
            AND: expect.any(Array),
            OR: expect.any(Array),
          }),
        }),
      )
      await expect(service.context('club-a', 'user', { teamId: 'team-b' })).rejects.toThrow(
        StudioSelectionNotFoundException,
      )
      db.teamAccess.findMany.mockResolvedValue([])
      await expect(service.context('club-a', 'user', {})).rejects.toThrow(
        StudioAccessDeniedException,
      )
    },
  )

  it('rejects FREE clubs before reading a match or kit', async () => {
    const { db, plans, service } = setup()
    plans.resolve.mockResolvedValue({ tier: 'FREE' })
    await expect(service.context('club-a', 'user', {})).rejects.toThrow(StudioPlanRequiredException)
    await expect(service.brandKit('club-a', 'user')).rejects.toThrow(StudioPlanRequiredException)
    expect(db.event.findFirst).not.toHaveBeenCalled()
    expect(db.studioBrandKit.findUnique).not.toHaveBeenCalled()
  })

  it('returns not found for a missing/foreign explicit team or match', async () => {
    const { db, service } = setup()
    db.team.findFirst.mockResolvedValue(null)
    await expect(service.context('club-a', 'user', { teamId: 'foreign' })).rejects.toThrow(
      StudioSelectionNotFoundException,
    )
    db.event.findFirst.mockResolvedValue(null)
    await expect(service.context('club-a', 'user', { eventId: 'foreign' })).rejects.toThrow(
      StudioSelectionNotFoundException,
    )
  })

  it('selects recorded live, recent finished, then upcoming; never invents consent', async () => {
    const { db, service } = setup()
    db.event.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'next' })
    expect(await service.context('club-a', 'user', {})).toEqual({ eventId: 'next', consents: [] })
    expect(db.event.findFirst.mock.calls[0][0].where.matchLive.is.status.in).toContain('FIRST_HALF')
    expect(db.event.findFirst.mock.calls[1][0].where.matchLive.is.status).toBe('FINISHED')
    expect(db.event.findFirst.mock.calls[2][0].where.date.gte).toBeInstanceOf(Date)
    for (const [query] of db.event.findFirst.mock.calls)
      expect(query.where).toMatchObject({ clubId: 'club-a', archivedAt: null, cancelledAt: null })
  })

  it('returns an honest empty context when no match is available', async () => {
    const { db, service } = setup()
    db.event.findFirst.mockResolvedValue(null)
    expect(await service.context('club-a', 'user', {})).toEqual({ eventId: null, consents: [] })
  })
})

describe('Studio brand kit persistence', () => {
  it('uses club identity and existing sponsors, with social accounts disconnected', async () => {
    const { service } = setup()
    const kit = await service.brandKit('club-a', 'user')
    expect(kit.colors.primary).toBe('#123456')
    expect(kit.sponsors[0].id).toBe('s1')
    expect(kit.accounts.every((account) => !account.connected)).toBe(true)
    expect(kit.templateSetAt).toBeNull()
  })

  it('saves only supplied fields within the authenticated tenant', async () => {
    const { db, service } = setup()
    await service.updateBrandKit('club-a', 'user', { fontPairing: 'MODERN' })
    expect(db.studioBrandKit.upsert).toHaveBeenCalledWith({
      where: { clubId: 'club-a' },
      create: { clubId: 'club-a', fontPairing: 'MODERN' },
      update: { fontPairing: 'MODERN' },
    })
  })

  it('does not grant a captain club-wide brand editing', async () => {
    const { db, service } = setup()
    db.membership.findFirst.mockResolvedValue({ role: 'PLAYER', operationalRoles: ['CAPTAIN'] })
    await expect(service.updateBrandKit('club-a', 'user', { handle: '@new' })).rejects.toThrow(
      StudioAccessDeniedException,
    )
    expect(db.studioBrandKit.upsert).not.toHaveBeenCalled()
  })

  it('rejects foreign and duplicate sponsor IDs before writing', async () => {
    const { db, service } = setup()
    db.sponsor.findMany.mockResolvedValue([])
    await expect(
      service.updateBrandKit('club-a', 'user', { sponsors: [{ id: 'foreign', name: 'Other' }] }),
    ).rejects.toThrow('Sponsor selection')
    await expect(
      service.updateBrandKit('club-a', 'user', {
        sponsors: [
          { id: 's1', name: 'One' },
          { id: 's1', name: 'Two' },
        ],
      }),
    ).rejects.toThrow('Duplicate')
    expect(db.studioBrandKit.upsert).not.toHaveBeenCalled()
  })

  it('does not turn a failed database write into a successful save', async () => {
    const { db, service } = setup()
    db.studioBrandKit.upsert.mockRejectedValue(new Error('DB failed'))
    await expect(service.updateBrandKit('club-a', 'user', { handle: '@new' })).rejects.toThrow(
      'DB failed',
    )
  })

  it('does not resurrect deleted sponsor assets; empty selection remains empty', async () => {
    const { db, service } = setup()
    db.studioBrandKit.findUnique.mockResolvedValue({
      fontPairing: 'MODERN',
      handle: '@club',
      hashtags: [],
      sponsors: [{ id: 'deleted', name: 'Old sponsor' }],
    })
    expect((await service.brandKit('club-a', 'user')).sponsors).toEqual([])
    db.studioBrandKit.findUnique.mockResolvedValue({ sponsors: [] })
    expect((await service.brandKit('club-a', 'user')).sponsors).toEqual([])
  })
})
