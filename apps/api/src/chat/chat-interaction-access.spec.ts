import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { ChatService } from './chat.service'

function setup(access = { canRead: true, canWrite: true, postingSuspended: false }) {
  const message = {
    id: 'message',
    channelId: 'private',
    teamId: 'team',
    senderId: 'player',
    deletedAt: null as Date | null,
    messageType: 'TEXT',
    createdAt: new Date(),
  }
  const prisma = {
    message: { findUnique: jest.fn().mockResolvedValue(message), update: jest.fn() },
    messageReaction: { upsert: jest.fn(), deleteMany: jest.fn() },
    poll: {
      findUnique: jest
        .fn()
        .mockResolvedValue({
          id: 'poll',
          message,
          options: [],
          votes: [],
          multiSelect: false,
          closedAt: null,
          closesAt: null,
        }),
    },
    pollOption: { findFirst: jest.fn().mockResolvedValue(null) },
    pollVote: { deleteMany: jest.fn(), upsert: jest.fn() },
  }
  const channels = { getChannelAccess: jest.fn().mockResolvedValue(access) }
  const service = new ChatService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    channels as never,
    {} as never,
  )
  return { service, prisma, channels, message }
}

describe('Chat mutation and poll channel boundaries', () => {
  it.each(['reaction', 'unreact', 'edit', 'vote'])(
    'blocks suspended member %s before writing',
    async (operation) => {
      const { service, prisma } = setup({ canRead: true, canWrite: false, postingSuspended: true })
      const actions = {
        reaction: () => service.addReaction('player', 'message', '👍'),
        unreact: () => service.removeReaction('player', 'message', '👍'),
        edit: () => service.editMessage('player', 'message', 'changed'),
        vote: () => service.votePoll('player', 'poll', 'option'),
      }
      await expect(actions[operation as keyof typeof actions]()).rejects.toThrow(ForbiddenException)
      expect(prisma.message.update).not.toHaveBeenCalled()
      expect(prisma.messageReaction.upsert).not.toHaveBeenCalled()
      expect(prisma.messageReaction.deleteMany).not.toHaveBeenCalled()
      expect(prisma.pollVote.deleteMany).not.toHaveBeenCalled()
      expect(prisma.pollVote.upsert).not.toHaveBeenCalled()
    },
  )

  it('does not expose private-channel poll results through team membership', async () => {
    const { service } = setup({ canRead: false, canWrite: false, postingSuspended: false })
    await expect(service.getPoll('player', 'poll')).rejects.toThrow(ForbiddenException)
    await expect(service.votePoll('player', 'poll', 'option')).rejects.toThrow(ForbiddenException)
  })

  it('lets suspended members read poll results', async () => {
    const { service } = setup({ canRead: true, canWrite: false, postingSuspended: true })
    await expect(service.getPoll('player', 'poll')).resolves.toMatchObject({
      id: 'poll',
      totalVotes: 0,
    })
  })

  it('validates an option before deleting the previous vote, even in announcements', async () => {
    const { service, prisma } = setup({ canRead: true, canWrite: false, postingSuspended: false })
    await expect(service.votePoll('player', 'poll', 'foreign-option')).rejects.toThrow(
      BadRequestException,
    )
    expect(prisma.pollOption.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign-option', pollId: 'poll' },
    })
    expect(prisma.pollVote.deleteMany).not.toHaveBeenCalled()
  })

  it('does not accept votes for a deleted message', async () => {
    const { service, message, channels } = setup()
    message.deletedAt = new Date()
    await expect(service.votePoll('player', 'poll', 'option')).rejects.toThrow(NotFoundException)
    expect(channels.getChannelAccess).not.toHaveBeenCalled()
  })
})
