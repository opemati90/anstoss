import '../../test/future-capabilities'

/**
 * Chat revamp adversarial-review fixes (B1, H1, H2, H3, H4, M2, M4) against
 * an in-memory Prisma that evaluates where clauses, so a forgotten scope or a
 * permissive rule fails here.
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { ChannelsService } from './channels.service'
import { ChannelsController } from './channels.controller'
import { CHAT_FAKE_SCHEMA, FakePrisma, yearsAgo } from '../test-utils/fake-prisma'
import { evaluateGroupSafeguarding } from './group-safeguarding'

const CLUB = 'club-1'
const TEAM = 'team-u13'
const OTHER_TEAM = 'team-herren'
const active = { status: 'ACTIVE', phase: 'FULL', loanEndDate: null }

function seed() {
  return {
    user: [
      { id: 'coach', dateOfBirth: yearsAgo(40), managedById: null, adultConfirmedAt: null, deletedAt: null, name: 'Tim Weber' },
      { id: 'assistant', dateOfBirth: yearsAgo(35), managedById: null, adultConfirmedAt: null, deletedAt: null, name: 'Jan Krause' },
      { id: 'clubcoach', dateOfBirth: yearsAgo(45), managedById: null, adultConfirmedAt: null, deletedAt: null, name: 'Uwe Brandt' },
      { id: 'parent', dateOfBirth: yearsAgo(42), managedById: null, adultConfirmedAt: null, deletedAt: null, name: 'Anna Hoffmann' },
      { id: 'kid', dateOfBirth: yearsAgo(12), managedById: null, adultConfirmedAt: null, deletedAt: null, name: 'Lukas Hoffmann' },
      { id: 'kid2', dateOfBirth: yearsAgo(13), managedById: null, adultConfirmedAt: null, deletedAt: null, name: 'Mia Schulz' },
      { id: 'adult', dateOfBirth: yearsAgo(25), managedById: null, adultConfirmedAt: null, deletedAt: null, name: 'Felix Braun' },
      { id: 'admin', dateOfBirth: yearsAgo(50), managedById: null, adultConfirmedAt: null, deletedAt: null, name: 'Petra Vogel' },
    ],
    membership: [
      { id: 'm1', userId: 'coach', clubId: CLUB, role: 'COACH', operationalRoles: [], createdAt: new Date('2026-01-01') },
      { id: 'm2', userId: 'assistant', clubId: CLUB, role: 'PLAYER', operationalRoles: [], createdAt: new Date('2026-01-01') },
      { id: 'm3', userId: 'clubcoach', clubId: CLUB, role: 'COACH', operationalRoles: [], createdAt: new Date('2026-01-01') },
      { id: 'm4', userId: 'parent', clubId: CLUB, role: 'PARENT', operationalRoles: [], createdAt: new Date('2026-01-01') },
      { id: 'm5', userId: 'kid', clubId: CLUB, role: 'PLAYER', operationalRoles: [], createdAt: new Date('2026-01-01') },
      { id: 'm6', userId: 'kid2', clubId: CLUB, role: 'PLAYER', operationalRoles: [], createdAt: new Date('2026-01-01') },
      { id: 'm7', userId: 'adult', clubId: CLUB, role: 'PLAYER', operationalRoles: [], createdAt: new Date('2026-01-01') },
      { id: 'm8', userId: 'admin', clubId: CLUB, role: 'ADMIN', operationalRoles: [], createdAt: new Date('2026-01-01') },
    ],
    team: [
      { id: TEAM, clubId: CLUB, ageGroup: 'U13', name: 'U13', displayName: 'U13' },
      { id: OTHER_TEAM, clubId: CLUB, ageGroup: 'Herren', name: 'Herren', displayName: 'Herren' },
    ],
    teamAccess: [
      { id: 'ta1', userId: 'coach', teamId: TEAM, clubId: CLUB, role: 'HEAD_COACH', ...active, createdAt: new Date('2026-02-01') },
      { id: 'ta2', userId: 'assistant', teamId: TEAM, clubId: CLUB, role: 'ASSISTANT_COACH', ...active, createdAt: new Date('2026-02-01') },
      // Club-level COACH who only coaches the Herren.
      { id: 'ta3', userId: 'clubcoach', teamId: OTHER_TEAM, clubId: CLUB, role: 'HEAD_COACH', ...active, createdAt: new Date('2026-02-01') },
      { id: 'ta4', userId: 'kid', teamId: TEAM, clubId: CLUB, role: 'PLAYER', ...active, createdAt: new Date('2026-02-01') },
      { id: 'ta5', userId: 'kid2', teamId: TEAM, clubId: CLUB, role: 'PLAYER', ...active, createdAt: new Date('2026-02-01') },
      { id: 'ta6', userId: 'adult', teamId: TEAM, clubId: CLUB, role: 'PLAYER', ...active, createdAt: new Date('2026-06-01') },
    ],
    guardianRelationship: [
      { id: 'g1', clubId: CLUB, teamId: TEAM, parentUserId: 'parent', playerUserId: 'kid', createdAt: new Date('2026-02-01') },
    ],
    parentalConsent: [],
    channel: [],
    channelMember: [],
    message: [],
  }
}

/** assertReadableAccess against the fake data (manager / active access / guardian). */
function teamsServiceFor(prisma: FakePrisma) {
  return {
    assertReadableAccess: jest.fn(async (userId: string, teamId: string) => {
      const team = prisma.rows('team').find((t) => t.id === teamId)
      if (!team) throw new ForbiddenException('no team')
      const membership = prisma.rows('membership').find((m) => m.userId === userId && m.clubId === team.clubId) ?? null
      const activeTeamAccess = prisma
        .rows('teamAccess')
        .filter((t) => t.userId === userId && t.teamId === teamId && t.status === 'ACTIVE')
      const guardian = prisma.rows('guardianRelationship').some((g) => g.parentUserId === userId && g.teamId === teamId)
      const manager = membership && ['OWNER', 'ADMIN', 'COACH'].includes(membership.role)
      if (!manager && activeTeamAccess.length === 0 && !guardian) throw new ForbiddenException('no access')
      return { team, membership, activeTeamAccess }
    }),
  }
}

function build(extra?: (s: ReturnType<typeof seed>) => void) {
  const data = seed()
  extra?.(data)
  const prisma = new FakePrisma(CHAT_FAKE_SCHEMA, data)
  const events = { emit: jest.fn() }
  const service = new ChannelsService(prisma as never, teamsServiceFor(prisma) as never, events as never)
  return { prisma, service, events }
}

function group(id: string, members: string[], teamId: string | null = TEAM) {
  return (s: ReturnType<typeof seed>) => {
    s.channel.push({ id, clubId: CLUB, teamId, slug: id, kind: 'CUSTOM', name: 'Gruppe', visibility: 'MEMBERS', description: null, createdAt: new Date(), updatedAt: new Date() } as never)
    for (const userId of members) {
      s.channelMember.push({ id: `${id}-${userId}`, channelId: id, userId, muted: false, mutedUntil: null, createdAt: new Date('2026-03-01') } as never)
    }
  }
}

describe('B1 group safeguarding', () => {
  it('rejects a coach creating a private 1:1 "group" with an under-16', async () => {
    const { service } = build()
    await expect(
      service.createCustomChannel('coach', { clubId: CLUB, teamId: TEAM, name: 'Einzel', memberIds: ['kid'] }),
    ).rejects.toThrow('GROUP_PRIVATE_PAIR_NOT_ALLOWED')
  })

  it('rejects a group with an under-16 and only one staff adult plus another adult', async () => {
    const { service } = build()
    await expect(
      service.createCustomChannel('coach', { clubId: CLUB, teamId: TEAM, name: 'Torwart', memberIds: ['kid', 'adult'] }),
    ).rejects.toThrow('GROUP_MINOR_NEEDS_STAFF')
  })

  it('does not count a club-level COACH as staff of a team they do not coach', async () => {
    // clubcoach is membership COACH but coaches the Herren only; they are not
    // even eligible for the U13 group, and cannot create one there.
    const { service } = build()
    await expect(
      service.createCustomChannel('coach', { clubId: CLUB, teamId: TEAM, name: 'Mix', memberIds: ['kid', 'clubcoach'] }),
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(
      service.createCustomChannel('clubcoach', { clubId: CLUB, teamId: TEAM, name: 'Mix', memberIds: ['coach', 'kid'] }),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('does not let a TRIAL coach create or manage a team group', async () => {
    const { service } = build((s) => {
      s.teamAccess.find((row) => row.userId === 'coach' && row.teamId === TEAM)!.phase = 'TRIAL'
    })

    await expect(service.provisionTeamChannels('coach', TEAM)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    await expect(
      service.createCustomChannel('coach', {
        clubId: CLUB,
        teamId: TEAM,
        name: 'Trial authority',
        memberIds: ['assistant', 'adult'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('allows two team staff adults with minors, and staff + the child’s guardian', async () => {
    const { service, prisma } = build()
    await service.createCustomChannel('coach', { clubId: CLUB, teamId: TEAM, name: 'Trainerteam + Kids', memberIds: ['assistant', 'kid', 'kid2'] })
    await service.createCustomChannel('coach', { clubId: CLUB, teamId: TEAM, name: 'Eltern', memberIds: ['parent', 'kid'] })
    expect(prisma.rows('channel')).toHaveLength(2)
  })

  it('rejects staff + guardian when a second minor has no guardian in the group', async () => {
    const { service } = build()
    await expect(
      service.createCustomChannel('coach', { clubId: CLUB, teamId: TEAM, name: 'x', memberIds: ['parent', 'kid', 'kid2'] }),
    ).rejects.toThrow('GROUP_MINOR_NEEDS_STAFF')
  })

  it('blocks adding a minor to a group with a single staff adult', async () => {
    const { service, prisma } = build(group('g-adults', ['coach', 'adult']))
    await expect(service.addChannelMembers('coach', CLUB, 'g-adults', ['kid'])).rejects.toThrow(
      'GROUP_MINOR_NEEDS_STAFF',
    )
    expect(prisma.rows('channelMember').filter((m) => m.channelId === 'g-adults')).toHaveLength(2)
  })

  it('blocks removing the second staff adult from a group with a minor', async () => {
    const { service, prisma } = build(group('g-kids', ['coach', 'assistant', 'kid', 'kid2']))
    await expect(service.removeChannelMember('coach', CLUB, 'g-kids', 'assistant')).rejects.toThrow(
      'GROUP_REMOVE_BREAKS_SAFEGUARD',
    )
    // Self-leave is held to the same rule.
    await expect(service.removeChannelMember('assistant', CLUB, 'g-kids', 'assistant')).rejects.toThrow(
      'GROUP_REMOVE_BREAKS_SAFEGUARD',
    )
    // Removing a minor is always fine.
    await service.removeChannelMember('coach', CLUB, 'g-kids', 'kid2')
    expect(prisma.rows('channelMember').map((m) => m.userId)).not.toContain('kid2')
  })

  it('rejects members outside the club and players of another team', async () => {
    const { service, prisma } = build((s) => {
      s.user.push({ id: 'herren-player', dateOfBirth: yearsAgo(25), managedById: null, adultConfirmedAt: null, deletedAt: null, name: 'Adult player' })
      s.membership.push({ id: 'm9', userId: 'herren-player', clubId: CLUB, role: 'PLAYER', operationalRoles: [], createdAt: new Date() })
      s.teamAccess.push({ id: 'ta9', userId: 'herren-player', teamId: OTHER_TEAM, clubId: CLUB, role: 'PLAYER', ...active, createdAt: new Date() })
    })
    await expect(
      service.createCustomChannel('coach', { clubId: CLUB, teamId: TEAM, name: 'x', memberIds: ['stranger'] }),
    ).rejects.toThrow('User is not a member of this club')
    await expect(
      service.createCustomChannel('coach', { clubId: CLUB, teamId: TEAM, name: 'x', memberIds: ['herren-player'] }),
    ).rejects.toThrow('User is not on this team')
    expect(prisma.rows('channel')).toHaveLength(0)
  })

  it('writes the creator and the members in one transaction', async () => {
    const { service, prisma, events } = build()
    await service.createCustomChannel('coach', { clubId: CLUB, teamId: TEAM, name: 'Fahrgemeinschaft', memberIds: ['assistant', 'adult', 'adult'] })
    expect(prisma.rows('channelMember').map((m) => m.userId).sort()).toEqual(['adult', 'assistant', 'coach'])
    expect(events.emit).toHaveBeenCalledTimes(3)
  })

  it('treats an unknown age as a minor', () => {
    const users = [
      { id: 'a', dateOfBirth: yearsAgo(30), managedById: null },
      { id: 'b', dateOfBirth: yearsAgo(30), managedById: null },
      { id: 'x', dateOfBirth: null, managedById: null, adultConfirmedAt: null },
    ]
    expect(
      evaluateGroupSafeguarding(['a', 'b', 'x'], { users, staffIds: new Set(['a']), guardianPairs: new Set() }),
    ).toEqual({ ok: false, code: 'GROUP_MINOR_NEEDS_STAFF' })
  })
})

describe('H1 / M4 write rules', () => {
  function clubChannels(s: ReturnType<typeof seed>) {
    for (const [id, kind] of [['news', 'CLUB_NEWS'], ['ann', 'ANNOUNCEMENTS']] as const) {
      s.channel.push({ id, clubId: CLUB, teamId: null, slug: id === 'news' ? 'news' : 'announcements', kind, name: id, visibility: 'MEMBERS', description: null, createdAt: new Date(), updatedAt: new Date() } as never)
    }
    s.channel.push({ id: 'team-ann', clubId: CLUB, teamId: TEAM, slug: 'announcements', kind: 'ANNOUNCEMENTS', name: 'a', visibility: 'MEMBERS', description: null, createdAt: new Date(), updatedAt: new Date() } as never)
  }

  it('CLUB_NEWS is writable by club admins only', async () => {
    const { service } = build(clubChannels)
    expect((await service.getChannelAccess('adult', 'news')).canWrite).toBe(false)
    expect((await service.getChannelAccess('coach', 'news')).canWrite).toBe(false)
    expect((await service.getChannelAccess('admin', 'news')).canWrite).toBe(true)
  })

  it('club ANNOUNCEMENTS is OWNER/ADMIN only; team announcements stay with that team’s coaches', async () => {
    const { service } = build(clubChannels)
    expect((await service.getChannelAccess('coach', 'ann')).canWrite).toBe(false)
    expect((await service.getChannelAccess('admin', 'ann')).canWrite).toBe(true)
    expect((await service.getChannelAccess('coach', 'team-ann')).canWrite).toBe(true)
    // A club COACH of another team reads but cannot announce to the U13.
    expect((await service.getChannelAccess('clubcoach', 'team-ann')).canWrite).toBe(false)
  })

  it('does not let a TRIAL coach write team announcements', async () => {
    const { service } = build((s) => {
      clubChannels(s)
      s.teamAccess.find((row) => row.userId === 'coach' && row.teamId === TEAM)!.phase = 'TRIAL'
    })

    expect((await service.getChannelAccess('coach', 'team-ann')).canWrite).toBe(false)
  })

  it('a club-news REST post is not an announcement', async () => {
    const { service, prisma } = build(clubChannels)
    await service.postMessage(CLUB, 'news', 'Sommerfest am Samstag', 'admin')
    expect(prisma.rows('message')[0]).toMatchObject({ channelId: 'news', isAnnouncement: false })
    await service.postMessage(CLUB, 'ann', 'Platzsperre', 'admin')
    expect(prisma.rows('message')[1]).toMatchObject({ channelId: 'ann', isAnnouncement: true })
    await expect(service.postMessage(CLUB, 'news', 'Hallo', 'adult')).rejects.toBeInstanceOf(ForbiddenException)
  })
})

describe('H2 legacy member routes', () => {
  it('are gone from the controller and the service', () => {
    expect((ChannelsController.prototype as unknown as Record<string, unknown>).addMember).toBeUndefined()
    expect((ChannelsController.prototype as unknown as Record<string, unknown>).removeMember).toBeUndefined()
    expect((ChannelsService.prototype as unknown as Record<string, unknown>).addMember).toBeUndefined()
  })
})

describe('H3 group access follows team access', () => {
  it('refuses a group member whose team access ended, and purges the row', async () => {
    const { service, prisma } = build(group('g1', ['coach', 'assistant', 'adult']))
    expect((await service.getChannelAccess('adult', 'g1')).canRead).toBe(true)
    prisma.rows('teamAccess').find((t) => t.userId === 'adult')!.status = 'REMOVED'
    expect((await service.getChannelAccess('adult', 'g1')).canRead).toBe(false)

    const purged = await service.purgeStaleGroupMemberships({ userId: 'adult' })
    expect(purged).toBe(1)
    expect(prisma.rows('channelMember').map((m) => m.userId)).toEqual(['coach', 'assistant'])
  })

  it('the inbox drops groups on teams the caller can no longer read', async () => {
    const { service, prisma } = build(group('g1', ['coach', 'assistant', 'adult']))
    prisma.rows('teamAccess').find((t) => t.userId === 'adult')!.status = 'REMOVED'
    const inbox = await service.listInboxChannels('adult', CLUB)
    expect(inbox.map((c) => c.id)).not.toContain('g1')
  })
})

describe('H4 provisioning', () => {
  it('seeds a team once per process and skips no-op writes', async () => {
    const { service, prisma } = build()
    await service.ensureTeamChannels(CLUB, TEAM, 'U13')
    const writes = () => prisma.calls.filter((c) => c.model === 'channel' && ['create', 'update', 'upsert'].includes(c.op)).length
    expect(writes()).toBe(4) // TEAM, ANNOUNCEMENTS, COACHES, PARENTS
    const reads = prisma.calls.length
    await service.ensureTeamChannels(CLUB, TEAM, 'U13')
    expect(prisma.calls.length).toBe(reads)

    // A fresh process sees correct rows and writes nothing.
    const fresh = new ChannelsService(prisma as never, teamsServiceFor(prisma) as never, { emit: jest.fn() } as never)
    await fresh.ensureTeamChannels(CLUB, TEAM, 'U13')
    expect(writes()).toBe(4)
  })

  it('seeds the Eltern channel for youth teams only', async () => {
    const { service, prisma } = build()
    await service.ensureTeamChannels(CLUB, OTHER_TEAM, 'Herren')
    expect(prisma.rows('channel').map((c) => c.slug).sort()).toEqual(['announcements', 'coaches', 'team'])
  })

  it('provisions on team.created', async () => {
    const { service, prisma } = build()
    await service.onTeamCreated({ clubId: CLUB, teamId: OTHER_TEAM, ageGroup: 'Herren' })
    const kinds = prisma.rows('channel').filter((c) => c.teamId === OTHER_TEAM).map((c) => c.kind)
    expect(kinds.sort()).toEqual(['ANNOUNCEMENTS', 'COACHES', 'TEAM'])
  })
})

describe('M2 unread since join', () => {
  it('counts from the member’s join time, not the channel’s whole history', async () => {
    const { service, prisma } = build()
    const spy = jest.spyOn(prisma, '$queryRaw')
    await service.listInboxChannels('adult', CLUB)
    const [strings, ...values] = spy.mock.calls[0] as unknown as [string[], ...unknown[]]
    expect(strings.join('?')).toContain('m."createdAt" > s."since"')
    // adult joined the U13 on 2026-06-01; its team channels count from then,
    // club channels from the club membership (2026-01-01).
    const bound = (values as Array<{ values?: unknown[] }>).flatMap((v) => v?.values ?? [v])
    const flat = (bound as Array<{ values?: unknown[] }>).flatMap((v) => v?.values ?? [v])
    expect(flat).toContain(new Date('2026-06-01').toISOString())
    expect(flat).toContain(new Date('2026-01-01').toISOString())
  })
})
