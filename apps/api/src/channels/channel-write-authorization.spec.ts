import { ChannelsService } from './channels.service'
import { ChatService } from '../chat/chat.service'
import { TeamsService } from '../teams/teams.service'
import { CHAT_FAKE_SCHEMA, FakePrisma } from '../test-utils/fake-prisma'

function setup() {
  const prisma = new FakePrisma({
    ...CHAT_FAKE_SCHEMA,
    user: { ...CHAT_FAKE_SCHEMA.user, memberships: { kind: 'many', model: 'membership', to: 'userId' } },
    actingSession: {},
    trialInvite: { freeAgentProfile: { kind: 'one', model: 'freeAgentProfile', from: 'freeAgentProfileId' } },
    freeAgentProfile: {},
  }, {
    channel: [{ id: 'room', clubId: 'club', teamId: 'team', kind: 'CUSTOM', visibility: 'MEMBERS', archivedAt: null }],
    team: [{ id: 'team', clubId: 'club' }],
    user: ['writer', 'child', 'sender'].map((id) => ({ id, deletedAt: null })),
    membership: [
      { id: 'writer-membership', userId: 'writer', clubId: 'club', role: 'PLAYER' },
      { id: 'child-membership', userId: 'child', clubId: 'club', role: 'PLAYER' },
    ],
    teamAccess: [{ id: 'writer-access', userId: 'writer', clubId: 'club', teamId: 'team',
      role: 'PLAYER', phase: 'FULL', status: 'ACTIVE', loanEndDate: null }],
    channelMember: [{ id: 'writer-room', channelId: 'room', userId: 'writer', removed: false, postingSuspended: false }],
    message: [{ id: 'message', channelId: 'room', teamId: 'team', clubId: 'club',
      senderId: 'sender', content: 'Original', deletedAt: null }],
  })
  const teams = new TeamsService(prisma as never)
  const channels = new ChannelsService(prisma as never, teams, { emit: jest.fn() } as never)
  const chat = new ChatService(prisma as never, teams, { broadcastChatEvent: jest.fn() } as never,
    {} as never, channels, {} as never)
  jest.spyOn(chat, 'serializeMessage').mockResolvedValue({ id: 'message' } as never)
  const write = jest.fn(async () => 'saved')
  return { prisma, channels, chat, write }
}

describe('fresh channel-write authorization', () => {
  it.each(['CUSTOM', 'TEAM'])('rejects stale team access for a %s room after the preliminary check succeeds', async (kind) => {
    const { prisma, channels, write } = setup()
    prisma.rows('channel')[0].kind = kind
    await channels.assertWritable('writer', 'room')
    prisma.$executeRaw = async () => {
      prisma.rows('teamAccess')[0].status = 'REVOKED'
      return 0
    }
    await expect(channels.withOpenChannel('room', write, { userId: 'writer' })).rejects.toThrow('You do not have access to this team')
    expect(write).not.toHaveBeenCalled()
  })

  it('preserves a direct guardian link without direct team access', async () => {
    const { prisma, channels, write } = setup()
    prisma.tables.teamAccess = []
    prisma.rows('membership')[0].role = 'PARENT'
    prisma.rows('guardianRelationship').push({ id: 'guardian', clubId: 'club', teamId: 'team', parentUserId: 'writer', playerUserId: null })
    await expect(channels.withOpenChannel('room', write, { userId: 'writer' })).resolves.toBe('saved')
  })

  it('preserves cross-team guardian access through the child’s current membership and team access', async () => {
    const { prisma, channels, write } = setup()
    prisma.rows('membership')[0].role = 'PARENT'
    prisma.rows('teamAccess')[0].userId = 'child'
    prisma.rows('guardianRelationship').push({ id: 'guardian', clubId: 'club', teamId: 'other-team', parentUserId: 'writer', playerUserId: 'child' })
    await expect(channels.withOpenChannel('room', write, { userId: 'writer' })).resolves.toBe('saved')
    prisma.rows('teamAccess')[0].status = 'REVOKED'
    await expect(channels.withOpenChannel('room', write, { userId: 'writer' })).rejects.toThrow('You do not have access to this team')
  })

  it('preserves current acting-coach access, but rejects ended grants', async () => {
    const { prisma, channels, write } = setup()
    prisma.tables.teamAccess = []
    prisma.rows('actingSession').push({ id: 'acting', actorUserId: 'writer', clubId: 'club', teamId: 'team',
      role: 'COACH', endedAt: null, expiresAt: new Date(Date.now() + 60_000) })
    await expect(channels.withOpenChannel('room', write, { userId: 'writer' })).resolves.toBe('saved')
    prisma.rows('actingSession')[0].endedAt = new Date()
    await expect(channels.withOpenChannel('room', write, { userId: 'writer' })).rejects.toThrow('You do not have access to this team')
  })

  it('preserves legacy member trials while denying event-only Wechsel trial access to chat', async () => {
    const { prisma, channels, write } = setup()
    prisma.rows('teamAccess')[0].phase = 'TRIAL'
    await expect(channels.withOpenChannel('room', write, { userId: 'writer' })).resolves.toBe('saved')
    prisma.rows('freeAgentProfile').push({ id: 'profile', userId: 'writer' })
    prisma.rows('trialInvite').push({ id: 'trial', teamId: 'team', status: 'ACCEPTED',
      freeAgentProfileId: 'profile', sessionEventIds: [] })
    await expect(channels.withOpenChannel('room', write, { userId: 'writer' })).rejects.toThrow('You do not have access to this team')
  })

  it('rejects delete-other when a coach becomes a player while waiting for the write lock', async () => {
    const { prisma, chat } = setup()
    prisma.rows('teamAccess')[0].role = 'ASSISTANT_COACH'
    prisma.$executeRaw = async () => {
      prisma.rows('teamAccess')[0].role = 'PLAYER'
      return 0
    }
    await expect(chat.deleteMessage('writer', 'message')).rejects.toThrow('Only the sender or a coach can delete')
    expect(prisma.rows('message')[0]).toMatchObject({ content: 'Original', deletedAt: null })
  })

  it('lets a suspended member delete their own message while the room remains open', async () => {
    const { prisma, chat } = setup()
    prisma.rows('message')[0].senderId = 'writer'
    prisma.rows('channelMember')[0].postingSuspended = true
    await expect(chat.deleteMessage('writer', 'message')).resolves.toMatchObject({ id: 'message' })
    expect(prisma.rows('message')[0].deletedAt).toBeInstanceOf(Date)
    expect(prisma.rows('message')[0].content).toBe('')
  })
})
