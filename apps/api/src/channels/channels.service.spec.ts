import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { ChannelsService } from './channels.service'

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

describe('ChannelsService.addMember', () => {
  it('lets a manager add a member to a CUSTOM channel', async () => {
    const { service, prisma } = makeService({ channel: CUSTOM })
    await expect(service.addMember('coach', 'team-1', 'ch-1', 'u-1')).resolves.toEqual({
      added: true,
    })
    expect(prisma.channelMember.upsert).toHaveBeenCalled()
  })

  it('forbids a non-manager from adding a member', async () => {
    const { service } = makeService({
      channel: CUSTOM,
      access: { membership: { role: 'PLAYER' }, activeTeamAccess: [] },
    })
    await expect(service.addMember('player', 'team-1', 'ch-1', 'u-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('rejects adding to a default (auto-managed) channel', async () => {
    const { service } = makeService({ channel: TEAM })
    await expect(service.addMember('coach', 'team-1', 'ch-team', 'u-1')).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })
})

describe('ChannelsService.removeMember', () => {
  it('allows self-leave without manager rights', async () => {
    const { service, prisma } = makeService({
      channel: CUSTOM,
      access: { membership: { role: 'PLAYER' }, activeTeamAccess: [] },
    })
    await expect(service.removeMember('u-1', 'team-1', 'ch-1', 'u-1')).resolves.toEqual({
      removed: true,
    })
    expect(prisma.channelMember.deleteMany).toHaveBeenCalled()
  })

  it('forbids a non-manager from removing someone else', async () => {
    const { service } = makeService({
      channel: CUSTOM,
      access: { membership: { role: 'PLAYER' }, activeTeamAccess: [] },
    })
    await expect(service.removeMember('u-1', 'team-1', 'ch-1', 'u-2')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('lets a manager remove another member', async () => {
    const { service, prisma } = makeService({ channel: CUSTOM })
    await expect(service.removeMember('coach', 'team-1', 'ch-1', 'u-2')).resolves.toEqual({
      removed: true,
    })
    expect(prisma.channelMember.deleteMany).toHaveBeenCalledWith({
      where: { channelId: 'ch-1', userId: 'u-2' },
    })
  })
})

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

describe('ChannelsService.createCustomChannel', () => {
  it('auto-adds the creator as a ChannelMember', async () => {
    const prisma = {
      membership: {
        findFirst: jest.fn().mockResolvedValue({ role: 'COACH' }),
      },
      team: { findUnique: jest.fn() },
      channel: {
        create: jest.fn().mockResolvedValue({
          id: 'ch-new',
          clubId: 'club-1',
          teamId: null,
          slug: 'group-x',
          kind: 'CUSTOM',
          name: 'X',
          description: null,
          visibility: 'MEMBERS',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
      channelMember: { create: jest.fn().mockResolvedValue(undefined) },
      $transaction: jest.fn(),
    }
    // createCustomChannel wraps the channel + member writes in a transaction;
    // run the callback against the same mock so the create assertions hold.
    prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma))
    const service = new ChannelsService(prisma as never, {} as never, { emit: jest.fn() } as never)
    await service.createCustomChannel('creator', { clubId: 'club-1', name: 'X' })
    expect(prisma.channelMember.create).toHaveBeenCalledWith({
      data: { channelId: 'ch-new', userId: 'creator' },
    })
  })
})
