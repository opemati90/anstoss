import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { moderateChannelMemberSchema } from '@anstoss/shared'
import { ChannelsService } from './channels.service'
import { CHAT_FAKE_SCHEMA, FakePrisma } from '../test-utils/fake-prisma'

function setup(kind = 'TEAM') {
  const prisma = new FakePrisma({ ...CHAT_FAKE_SCHEMA, auditLog: {} }, {
    channel: [{ id: 'chat', clubId: 'club', teamId: 'team', kind, visibility: 'MEMBERS' }],
    user: ['owner', 'admin', 'player'].map((id) => ({ id, name: id, dateOfBirth: new Date('1990-01-01'), deletedAt: null })),
    membership: ['owner', 'admin', 'player'].map((userId) => ({ id: userId, userId, clubId: 'club', role: userId.toUpperCase() })),
    teamAccess: ['owner', 'admin', 'player'].map((userId) => ({ id: userId, userId, teamId: 'team', clubId: 'club', role: 'PLAYER', status: 'ACTIVE', loanEndDate: null })),
    channelMember: kind === 'CUSTOM' ? ['owner', 'admin', 'player'].map((userId) => ({ id: userId, userId, channelId: 'chat', removed: false, postingSuspended: false })) : [],
  })
  const teams = { assertReadableAccess: jest.fn(async (id: string) => {
    const membership = prisma.rows('membership').find((row) => row.userId === id)
    if (!membership) throw new ForbiddenException()
    return { membership, activeTeamAccess: [{ role: 'PLAYER' }] }
  }) }
  const events = { emit: jest.fn() }
  return { prisma, events, service: new ChannelsService(prisma as never, teams as never, events as never) }
}

describe('Chat moderation, independent of club membership', () => {
  it.each(['TEAM', 'CUSTOM'])('suspends posting, removes reading and restores a %s member', async (kind) => {
    const { service, prisma, events } = setup(kind)
    const originalMembership = structuredClone(prisma.rows('membership'))
    const originalAccess = structuredClone(prisma.rows('teamAccess'))
    expect(await service.moderateChannelMember('owner', 'club', 'chat', 'player', 'suspend')).toEqual({ status: 'suspended' })
    expect(await service.getChannelAccess('player', 'chat')).toMatchObject({ canRead: true, canWrite: false })
    await expect(service.assertWritable('player', 'chat')).rejects.toThrow(ForbiddenException)
    expect(await service.listReadersForChannel('chat')).toContain('player')
    expect((await service.listChannelMembers('owner', 'club', 'chat')).find((m) => m.userId === 'player')).toMatchObject({ moderationStatus: 'suspended', canModerate: true })

    await service.moderateChannelMember('owner', 'club', 'chat', 'player', 'remove')
    await expect(service.assertReadableChannel('player', 'chat')).rejects.toThrow(ForbiddenException)
    expect(await service.listReadersForChannel('chat')).not.toContain('player')
    expect(await service.listReadersForChannel('chat', { excludeMuted: true })).not.toContain('player')
    expect((await service.listChannelMembers('owner', 'club', 'chat')).find((m) => m.userId === 'player')).toMatchObject({ moderationStatus: 'removed', isMember: false, canModerate: true })

    await service.moderateChannelMember('owner', 'club', 'chat', 'player', 'restore')
    expect(await service.getChannelAccess('player', 'chat')).toMatchObject({ canRead: true, canWrite: true })
    expect(prisma.rows('membership')).toEqual(originalMembership)
    expect(prisma.rows('teamAccess')).toEqual(originalAccess)
    expect(prisma.rows('auditLog')).toHaveLength(3)
    expect(events.emit).toHaveBeenCalledWith('realtime.access.changed', { userId: 'player' })
  })

  it('rejects unauthorized, cross-club and privileged-target changes before writing', async () => {
    const { service, prisma } = setup()
    await expect(service.moderateChannelMember('player', 'club', 'chat', 'admin', 'remove')).rejects.toThrow(ForbiddenException)
    await expect(service.moderateChannelMember('admin', 'club', 'chat', 'owner', 'remove')).rejects.toThrow(ForbiddenException)
    await expect(service.moderateChannelMember('admin', 'club', 'chat', 'admin', 'suspend')).rejects.toThrow(ForbiddenException)
    await expect(service.moderateChannelMember('owner', 'foreign-club', 'chat', 'player', 'remove')).rejects.toThrow(NotFoundException)
    await expect(service.moderateChannelMember('owner', 'club', 'chat', 'outsider', 'restore')).rejects.toThrow(NotFoundException)
    expect(prisma.rows('channelMember')).toHaveLength(0)
    expect(prisma.rows('auditLog')).toHaveLength(0)
  })

  it('does not let restore manufacture custom-group membership', async () => {
    const { service, prisma } = setup('CUSTOM')
    prisma.tables.channelMember = prisma.rows('channelMember').filter((row) => row.userId !== 'player')
    await expect(service.moderateChannelMember('owner', 'club', 'chat', 'player', 'restore')).rejects.toThrow(NotFoundException)
  })

  it('validates actions and rejects privilege/membership fields', () => {
    expect(moderateChannelMemberSchema.safeParse({ action: 'suspend' }).success).toBe(true)
    expect(moderateChannelMemberSchema.safeParse({ action: 'ban' }).success).toBe(false)
    expect(moderateChannelMemberSchema.safeParse({ action: 'restore', role: 'OWNER' }).success).toBe(false)
  })
})


describe('Private room membership safety', () => {
  it.each(['removed', 'postingSuspended'])('cannot re-add a %s member or emit a socket join', async (restriction) => {
    const { service, prisma, events } = setup('CUSTOM')
    prisma.rows('channelMember').find((row) => row.userId === 'player')![restriction] = true
    await expect(service.addChannelMembers('owner', 'club', 'chat', ['player'])).rejects.toThrow(ForbiddenException)
    expect(events.emit).not.toHaveBeenCalled()
    expect(prisma.calls.filter((call) => call.op === 'createMany')).toHaveLength(0)
  })

  it('adds only new members and emits no join for an already present member', async () => {
    const { service, prisma, events } = setup('CUSTOM')
    prisma.tables.channelMember = prisma.rows('channelMember').filter((row) => row.userId !== 'player')
    await expect(service.addChannelMembers('owner', 'club', 'chat', ['admin', 'player', 'player'])).resolves.toEqual({ added: 1 })
    expect(events.emit.mock.calls).toEqual([
      ['channel.member.added', { userId: 'player', teamId: 'team', channelId: 'chat' }],
    ])
    expect(prisma.rows('channelMember').filter((row) => row.userId === 'player')).toHaveLength(1)
  })

  it('keeps private rooms inaccessible to an uninvited club owner', async () => {
    const { service, prisma } = setup('CUSTOM')
    prisma.tables.channelMember = prisma.rows('channelMember').filter((row) => row.userId !== 'owner')
    await expect(service.addChannelMembers('owner', 'club', 'chat', ['player'])).rejects.toThrow(ForbiddenException)
    await expect(service.removeChannelMember('owner', 'club', 'chat', 'player')).rejects.toThrow(ForbiddenException)
    await expect(service.moderateChannelMember('owner', 'club', 'chat', 'player', 'restore')).rejects.toThrow(ForbiddenException)
  })

  it.each(['add', 'remove', 'moderate'])('rechecks an actor removed while waiting to %s', async (operation) => {
    const { service, prisma, events } = setup('CUSTOM')
    prisma.$executeRaw = async () => {
      prisma.rows('channelMember').find((row) => row.userId === 'owner')!.removed = true
      return 0
    }
    const request = operation === 'add'
      ? service.addChannelMembers('owner', 'club', 'chat', ['player'])
      : operation === 'remove'
        ? service.removeChannelMember('owner', 'club', 'chat', 'player')
        : service.moderateChannelMember('owner', 'club', 'chat', 'player', 'remove')
    await expect(request).rejects.toThrow(ForbiddenException)
    expect(prisma.rows('channelMember').find((row) => row.userId === 'player')?.removed).toBe(false)
    expect(events.emit).not.toHaveBeenCalled()
  })

  it('does not count removed staff when adding a minor', async () => {
    const { service, prisma } = setup('CUSTOM')
    prisma.rows('user').find((row) => row.id === 'player')!.dateOfBirth = new Date('2020-01-01')
    prisma.rows('channelMember').find((row) => row.userId === 'admin')!.removed = true
    prisma.tables.channelMember = prisma.rows('channelMember').filter((row) => row.userId !== 'player')
    await expect(service.addChannelMembers('owner', 'club', 'chat', ['player'])).rejects.toThrow('GROUP_PRIVATE_PAIR_NOT_ALLOWED')
  })

  it('does not count suspended staff or hide suspended minors from safeguarding', async () => {
    const { service, prisma } = setup('CUSTOM')
    prisma.rows('user').find((row) => row.id === 'player')!.dateOfBirth = new Date('2020-01-01')
    await expect(service.moderateChannelMember('owner', 'club', 'chat', 'admin', 'suspend')).rejects.toThrow('GROUP_REMOVE_BREAKS_SAFEGUARD')
    expect(prisma.rows('channelMember').find((row) => row.userId === 'admin')!.postingSuspended).toBe(false)
    await service.moderateChannelMember('owner', 'club', 'chat', 'player', 'suspend')
    await expect(service.removeChannelMember('owner', 'club', 'chat', 'admin')).rejects.toThrow('GROUP_REMOVE_BREAKS_SAFEGUARD')
    expect(prisma.rows('channelMember').find((row) => row.userId === 'admin')).toBeDefined()
  })

  it('does not count a suspended guardian even if they manage the minor account', async () => {
    const { service, prisma } = setup('CUSTOM')
    prisma.rows('membership').find((row) => row.userId === 'admin')!.role = 'PARENT'
    prisma.rows('user').find((row) => row.id === 'player')!.dateOfBirth = new Date('2020-01-01')
    prisma.rows('user').find((row) => row.id === 'player')!.managedById = 'admin'
    await expect(service.moderateChannelMember('owner', 'club', 'chat', 'admin', 'suspend')).rejects.toThrow('GROUP_REMOVE_BREAKS_SAFEGUARD')
  })
})

describe('Closing a private group', () => {
  it('hides a closed group from every member and retains its stored data', async () => {
    const { service, prisma, events } = setup('CUSTOM')
    const { archivedAt } = await service.closeChannel('owner', 'club', 'chat')
    expect(Number.isNaN(Date.parse(archivedAt))).toBe(false)
    expect(prisma.rows('channel')).toHaveLength(1)
    expect(prisma.rows('channelMember')).toHaveLength(3)
    for (const userId of ['owner', 'admin', 'player']) {
      expect(await service.getChannelAccess(userId, 'chat')).toMatchObject({ canRead: false, canWrite: false, isManager: false })
      await expect(service.assertReadableChannel(userId, 'chat')).rejects.toThrow(ForbiddenException)
      await expect(service.getChannelDetail(userId, 'club', 'chat')).rejects.toThrow(ForbiddenException)
    }
    expect(await service.listReadersForChannel('chat')).toEqual([])
    expect(await service.listReadersForChannel('chat', { excludeMuted: true })).toEqual([])
    await expect(service.addChannelMembers('owner', 'club', 'chat', ['player'])).rejects.toThrow(ForbiddenException)
    await expect(service.removeChannelMember('owner', 'club', 'chat', 'player')).rejects.toThrow(ForbiddenException)
    await expect(service.moderateChannelMember('owner', 'club', 'chat', 'player', 'restore')).rejects.toThrow(ForbiddenException)
    expect(prisma.rows('auditLog')).toHaveLength(1)
    expect(events.emit).toHaveBeenCalledWith('channel.closed', { channelId: 'chat', clubId: 'club', teamId: 'team' })
  })

  it('requires an invited owner/admin and refuses role-derived default channels', async () => {
    const custom = setup('CUSTOM')
    await expect(custom.service.closeChannel('player', 'club', 'chat')).rejects.toThrow(ForbiddenException)
    await expect(custom.service.closeChannel('owner', 'another-club', 'chat')).rejects.toThrow(NotFoundException)
    custom.prisma.tables.channelMember = custom.prisma.rows('channelMember').filter((row) => row.userId !== 'owner')
    await expect(custom.service.closeChannel('owner', 'club', 'chat')).rejects.toThrow(ForbiddenException)
    await expect(setup('TEAM').service.closeChannel('owner', 'club', 'chat')).rejects.toThrow('Only private groups can be closed')
    expect(custom.prisma.rows('auditLog')).toHaveLength(0)
  })

  it('rechecks club roles after waiting for the membership lock', async () => {
    const { service, prisma } = setup('CUSTOM')
    prisma.$executeRaw = async () => {
      prisma.rows('membership').find((row) => row.userId === 'owner')!.role = 'PLAYER'
      return 0
    }
    await expect(service.closeChannel('owner', 'club', 'chat')).rejects.toThrow(ForbiddenException)
    await expect(service.moderateChannelMember('admin', 'club', 'chat', 'player', 'remove')).resolves.toEqual({ status: 'removed' })
    expect(prisma.rows('channel')[0].archivedAt).toBeUndefined()
  })

  it('rechecks target privilege after waiting for moderation', async () => {
    const { service, prisma } = setup('CUSTOM')
    prisma.$executeRaw = async () => {
      prisma.rows('membership').find((row) => row.userId === 'player')!.role = 'OWNER'
      return 0
    }
    await expect(service.moderateChannelMember('owner', 'club', 'chat', 'player', 'remove')).rejects.toThrow(ForbiddenException)
    expect(prisma.rows('channelMember').find((row) => row.userId === 'player')!.removed).toBe(false)
  })

  it('blocks a writer removed while the room write waits', async () => {
    const { service, prisma } = setup('CUSTOM')
    const write = jest.fn()
    prisma.$executeRaw = async () => {
      prisma.rows('channelMember').find((row) => row.userId === 'player')!.removed = true
      return 0
    }
    await expect(service.withOpenChannel('chat', write, { userId: 'player' })).rejects.toThrow(ForbiddenException)
    expect(write).not.toHaveBeenCalled()
  })
})
