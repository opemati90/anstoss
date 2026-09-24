import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { ChannelsService, isMuteActive } from './channels.service'

function makeService(
  overrides: {
    channel?: Record<string, unknown> | null
    channelMembers?: Array<{ userId: string }>
    callerMember?: { id: string } | null
    roster?: Array<{ userId: string; role: string }>
    memberships?: Array<{ userId: string; role: string }>
    access?: { membership?: { role: string } | null; activeTeamAccess: Array<{ role: string }> }
  } = {},
) {
  const access = overrides.access ?? {
    membership: { role: 'COACH' },
    activeTeamAccess: [],
  }
  const rosterAccess = overrides.roster ?? [
    { userId: 'u-1', role: 'PLAYER' },
    { userId: 'u-2', role: 'HEAD_COACH' },
  ]

  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    team: { findUnique: jest.fn().mockResolvedValue({ clubId: 'club-1' }) },
    channel: {
      findFirst: jest.fn().mockResolvedValue(overrides.channel ?? null),
      findUnique: jest.fn().mockResolvedValue(overrides.channel ?? null),
    },
    channelMember: {
      findUnique: jest
        .fn()
        .mockResolvedValue(overrides.callerMember === undefined ? null : overrides.callerMember),
      findMany: jest.fn().mockResolvedValue(overrides.channelMembers ?? []),
      upsert: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue(undefined),
    },
    teamAccess: {
      findMany: jest.fn().mockImplementation((query) => {
        if (query?.where?.userId) return Promise.resolve(access.activeTeamAccess)
        return Promise.resolve(
          rosterAccess.map((r) => ({
            userId: r.userId,
            role: r.role,
            user: { name: r.userId, email: `${r.userId}@x.de`, avatarUrl: null },
          })),
        )
      }),
      findFirst: jest.fn().mockResolvedValue({ id: 'ta-1' }),
    },
    membership: {
      findMany: jest.fn().mockResolvedValue(overrides.memberships ?? []),
      findFirst: jest.fn().mockResolvedValue(access.membership ?? null),
    },
  }

  const teamsService = {
    assertReadableAccess: jest.fn().mockResolvedValue(access),
  }
  const eventEmitter = { emit: jest.fn() }

  return {
    service: new ChannelsService(prisma as never, teamsService as never, eventEmitter as never),
    prisma,
    teamsService,
  }
}

const CUSTOM = {
  id: 'ch-1',
  kind: 'CUSTOM',
  visibility: 'MEMBERS',
  clubId: 'club-1',
  teamId: 'team-1',
}
const TEAM = {
  id: 'ch-team',
  kind: 'TEAM',
  visibility: 'MEMBERS',
  clubId: 'club-1',
  teamId: 'team-1',
}
const STAFF = {
  id: 'ch-staff',
  kind: 'COACHES',
  visibility: 'COACHES_ONLY',
  clubId: 'club-1',
  teamId: null,
}

describe('ChannelsService.listMembers', () => {
  it('tags the roster with isMember for a CUSTOM channel', async () => {
    const { service } = makeService({
      channel: CUSTOM,
      callerMember: { id: 'cm-0' },
      channelMembers: [{ userId: 'u-2' }],
      roster: [
        { userId: 'u-1', role: 'PLAYER' },
        { userId: 'u-2', role: 'HEAD_COACH' },
      ],
    })
    const members = await service.listMembers('u-2', 'team-1', 'ch-1')
    expect(members).toHaveLength(2)
    expect(members.find((m) => m.userId === 'u-1')!.isMember).toBe(false)
    expect(members.find((m) => m.userId === 'u-2')!.isMember).toBe(true)
  })

  it('treats the whole visible audience as members for a default channel', async () => {
    const { service } = makeService({
      channel: TEAM,
      roster: [
        { userId: 'u-1', role: 'PLAYER' },
        { userId: 'u-2', role: 'HEAD_COACH' },
      ],
    })
    const members = await service.listMembers('u-1', 'team-1', 'ch-team')
    expect(members.every((m) => m.isMember)).toBe(true)
  })

  it('forbids a non-member from viewing a CUSTOM channel roster', async () => {
    const { service } = makeService({ channel: CUSTOM, callerMember: null })
    await expect(service.listMembers('outsider', 'team-1', 'ch-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('hides non-members and emails from a regular member of a CUSTOM group', async () => {
    // A rank-and-file player in a private group must NOT be able to
    // enumerate the whole team (or their emails) — only the actual members.
    const { service } = makeService({
      channel: CUSTOM,
      access: { membership: { role: 'PLAYER' }, activeTeamAccess: [] },
      callerMember: { id: 'cm-1' },
      channelMembers: [{ userId: 'u-1' }, { userId: 'u-2' }],
      roster: [
        { userId: 'u-1', role: 'PLAYER' },
        { userId: 'u-2', role: 'PLAYER' },
        { userId: 'u-3', role: 'PLAYER' },
      ],
    })
    const members = await service.listMembers('u-1', 'team-1', 'ch-1')
    expect(members.map((m) => m.userId).sort()).toEqual(['u-1', 'u-2'])
    expect(members.every((m) => m.isMember)).toBe(true)
    expect(members.every((m) => m.email === null)).toBe(true)
  })
})

// Legacy addMember/removeMember were removed (H2); see channels.review-fixes.spec.ts.

describe('ChannelsService CUSTOM access control', () => {
  it('does NOT allow a non-member to write to a CUSTOM channel', async () => {
    const { service } = makeService({ channel: CUSTOM, callerMember: null })
    await expect(service.assertWritable('outsider', 'ch-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('allows a member to write to a CUSTOM channel', async () => {
    const { service } = makeService({
      channel: CUSTOM,
      callerMember: { id: 'cm-1' },
    })
    await expect(service.assertWritable('u-1', 'ch-1')).resolves.toBeUndefined()
  })

  it('listChannelReaderIds returns only the ChannelMember set for CUSTOM', async () => {
    const { service } = makeService({
      channel: CUSTOM,
      channelMembers: [{ userId: 'u-2' }, { userId: 'u-3' }],
    })
    const readers = await service.listChannelReaderIds('team-1', 'ch-1')
    expect(readers.sort()).toEqual(['u-2', 'u-3'])
  })

  it('excludes expired loans from default-channel reader fan-out', async () => {
    const { service, prisma } = makeService({ channel: TEAM })

    await service.listChannelReaderIds('team-1', 'ch-team')

    expect(prisma.teamAccess.findMany).toHaveBeenCalledWith({
      where: {
        teamId: 'team-1',
        status: 'ACTIVE',
        OR: [{ loanEndDate: null }, { loanEndDate: { gt: expect.any(Date) } }],
      },
      select: { userId: true, role: true, clubId: true },
    })
  })

  it('allows club staff but denies players from writing to the club staff room', async () => {
    const staff = makeService({
      channel: STAFF,
      access: { membership: { role: 'ADMIN' }, activeTeamAccess: [] },
    })
    await expect(staff.service.assertWritable('admin-1', 'ch-staff')).resolves.toBeUndefined()

    const player = makeService({
      channel: STAFF,
      access: { membership: { role: 'PLAYER' }, activeTeamAccess: [{ role: 'PLAYER' }] },
    })
    await expect(player.service.assertWritable('player-1', 'ch-staff')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('fans a club staff room out across teams to admins and coaches only', async () => {
    const { service } = makeService({
      channel: STAFF,
      roster: [
        { userId: 'coach-team-a', role: 'HEAD_COACH' },
        { userId: 'coach-team-b', role: 'ASSISTANT_COACH' },
        { userId: 'player-1', role: 'PLAYER' },
      ],
      memberships: [
        { userId: 'admin-1', role: 'ADMIN' },
        { userId: 'player-1', role: 'PLAYER' },
      ],
    })
    await expect(service.listChannelReaderIds('team-1', 'ch-staff')).resolves.toEqual(
      expect.arrayContaining(['admin-1', 'coach-team-a', 'coach-team-b']),
    )
    const readers = await service.listChannelReaderIds('team-1', 'ch-staff')
    expect(readers).not.toContain('player-1')
  })
})

// createCustomChannel is covered with where-matching data in channels.review-fixes.spec.ts (B1).

describe('ChannelsService Eltern (PARENTS_ONLY) access', () => {
  const PARENTS = {
    id: 'ch-parents',
    kind: 'PARENTS',
    visibility: 'PARENTS_ONLY',
    clubId: 'club-1',
    teamId: 'team-1',
  }

  it('lets parents and the team coaches write, but not players', async () => {
    const parent = makeService({
      channel: PARENTS,
      access: { membership: { role: 'PARENT' }, activeTeamAccess: [{ role: 'PARENT' }] },
    })
    await expect(parent.service.assertWritable('parent', 'ch-parents')).resolves.toBeUndefined()

    const coach = makeService({
      channel: PARENTS,
      access: { membership: { role: 'PLAYER' }, activeTeamAccess: [{ role: 'HEAD_COACH' }] },
    })
    await expect(coach.service.assertWritable('coach', 'ch-parents')).resolves.toBeUndefined()

    const player = makeService({
      channel: PARENTS,
      access: { membership: { role: 'PLAYER' }, activeTeamAccess: [{ role: 'PLAYER' }] },
    })
    await expect(player.service.assertWritable('player', 'ch-parents')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('fans Eltern messages out to parents and coaches only', async () => {
    const { service } = makeService({
      channel: PARENTS,
      roster: [
        { userId: 'parent-1', role: 'PARENT' },
        { userId: 'coach-1', role: 'HEAD_COACH' },
        { userId: 'player-1', role: 'PLAYER' },
      ],
    })
    const readers = await service.listChannelReaderIds('team-1', 'ch-parents')
    expect(readers.sort()).toEqual(['coach-1', 'parent-1'])
  })
})

describe('ChannelsService mute', () => {
  it('a mute row on a default channel never grants access', async () => {
    const COACHES = { ...TEAM, id: 'ch-coaches', kind: 'COACHES', visibility: 'COACHES_ONLY' }
    const { service } = makeService({
      channel: COACHES,
      callerMember: { id: 'mute-row' },
      access: { membership: { role: 'PLAYER' }, activeTeamAccess: [{ role: 'PLAYER' }] },
    })
    const result = await service.getChannelAccess('player', 'ch-coaches')
    expect(result.canRead).toBe(false)
    expect(result.canWrite).toBe(false)
  })

  it('upserts a preference row for default channels', async () => {
    const { service, prisma } = makeService({ channel: TEAM })
    ;(prisma.channelMember as any).update = jest.fn()
    await expect(
      service.setChannelMute('u-1', 'club-1', 'ch-team', { muted: true, mutedUntil: null }),
    ).resolves.toEqual({ muted: true, mutedUntil: null })
    expect(prisma.channelMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { channelId_userId: { channelId: 'ch-team', userId: 'u-1' } },
        create: { channelId: 'ch-team', userId: 'u-1', muted: true, mutedUntil: null },
      }),
    )
  })

  it('only updates (never creates) the membership row of a CUSTOM group', async () => {
    const { service, prisma } = makeService({ channel: CUSTOM, callerMember: { id: 'cm-1' } })
    const update = jest.fn().mockResolvedValue(undefined)
    ;(prisma.channelMember as any).update = update
    await service.setChannelMute('u-1', 'club-1', 'ch-1', {
      muted: true,
      mutedUntil: '2026-10-01T10:00:00.000Z',
    })
    expect(update).toHaveBeenCalled()
    expect(prisma.channelMember.upsert).not.toHaveBeenCalled()
  })

  it('refuses to mute a channel the caller cannot read (no group join via mute)', async () => {
    const { service } = makeService({ channel: CUSTOM, callerMember: null })
    await expect(
      service.setChannelMute('outsider', 'club-1', 'ch-1', { muted: true }),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('drops readers with an active mute from push fan-out', async () => {
    const { service, prisma } = makeService({
      channel: CUSTOM,
      channelMembers: [{ userId: 'u-2' }, { userId: 'u-3' }, { userId: 'u-4' }],
    })
    prisma.channelMember.findMany.mockImplementation((query: any) => {
      if (query?.where?.muted) {
        return Promise.resolve([
          { userId: 'u-3', muted: true, mutedUntil: null },
          // expired mute — buzzes again
          { userId: 'u-4', muted: true, mutedUntil: new Date('2000-01-01') },
        ])
      }
      return Promise.resolve([{ userId: 'u-2' }, { userId: 'u-3' }, { userId: 'u-4' }])
    })
    const readers = await service.listChannelReaderIds('team-1', 'ch-1', { excludeMuted: true })
    expect(readers.sort()).toEqual(['u-2', 'u-4'])
  })

  it('isMuteActive honours mutedUntil', () => {
    const now = new Date('2026-09-23T12:00:00Z')
    expect(isMuteActive({ muted: true, mutedUntil: null }, now)).toBe(true)
    expect(isMuteActive({ muted: true, mutedUntil: new Date('2026-09-24T00:00:00Z') }, now)).toBe(
      true,
    )
    expect(isMuteActive({ muted: true, mutedUntil: new Date('2026-09-22T00:00:00Z') }, now)).toBe(
      false,
    )
    expect(isMuteActive({ muted: false, mutedUntil: null }, now)).toBe(false)
  })
})

describe('ChannelsService channel-scoped membership', () => {
  it('refuses to leave or remove members of a default channel', async () => {
    const { service } = makeService({ channel: TEAM })
    await expect(
      service.removeChannelMember('u-1', 'club-1', 'ch-team', 'u-1'),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('lets a member leave a CUSTOM group', async () => {
    const { service, prisma } = makeService({
      channel: CUSTOM,
      callerMember: { id: 'cm-1' },
      access: { membership: { role: 'PLAYER' }, activeTeamAccess: [{ role: 'PLAYER' }] },
    })
    await expect(service.removeChannelMember('u-1', 'club-1', 'ch-1', 'u-1')).resolves.toEqual({
      removed: true,
    })
    expect(prisma.channelMember.deleteMany).toHaveBeenCalledWith({
      where: { channelId: 'ch-1', userId: 'u-1' },
    })
  })

  it('404s a channel addressed through another club', async () => {
    const { service } = makeService({ channel: TEAM })
    await expect(service.getChannelAccess('u-1', 'ch-team')).resolves.toMatchObject({
      canRead: true,
    })
    await expect(
      service.setChannelMute('u-1', 'club-OTHER', 'ch-team', { muted: true }),
    ).rejects.toThrow('Channel not found')
  })
})

// ensureTeamChannels (youth-only Eltern, cached, no-op writes): channels.review-fixes.spec.ts (H4).
