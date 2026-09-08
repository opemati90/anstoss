import { NotFoundException } from '@nestjs/common'
import { ChatService } from './chat.service'

describe('ChatService poll retention', () => {
  it('does not expose a poll after its parent message was retention-deleted', async () => {
    const prisma: any = {
      poll: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'poll-1',
          question: 'Old question',
          multiSelect: false,
          closesAt: null,
          closedAt: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          options: [{ id: 'opt-1', label: 'Old answer' }],
          votes: [],
          message: {
            id: 'msg-1',
            teamId: 'team-1',
            deletedAt: new Date('2026-09-08T12:00:00.000Z'),
          },
        }),
      },
    }
    const teams = { assertReadableAccess: jest.fn() }
    const service = new ChatService(
      prisma,
      teams as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )

    await expect(service.getPoll('user-1', 'poll-1')).rejects.toThrow(NotFoundException)
    expect(teams.assertReadableAccess).not.toHaveBeenCalled()
  })
})
