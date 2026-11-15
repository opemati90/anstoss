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
