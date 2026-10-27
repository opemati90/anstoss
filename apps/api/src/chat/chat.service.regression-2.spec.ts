import { ChatService } from './chat.service'

// Regression: ISSUE-007 — arbitrary/foreign URLs could be persisted as chat media.
// Found by the launch adversarial audit on 2026-08-21.
describe('ChatService media upload binding', () => {
  it.each([
    { deleted: false, retiring: false }, { deleted: true, retiring: false }, { deleted: false, retiring: true },
  ])('rechecks lifecycle/storage under locks (%j)', async ({ deleted, retiring }) => {
    const prisma = {
      $transaction: jest.fn(), $executeRaw: jest.fn().mockResolvedValue(0),
      message: { create: jest.fn() },
      accountMediaDeletion: { findUnique: jest.fn().mockResolvedValue(retiring ? { objectKey: 'key' } : null) },
      user: { findUnique: jest.fn().mockResolvedValue({ deletedAt: deleted ? new Date() : null }) },
      channel: { findUnique: jest.fn().mockResolvedValue({ teamId: 'team-1', clubId: 'club-1' }) },
    }
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma))
    const r2 = {
      enabled: true,
      objectKeyFromUrl: jest.fn().mockReturnValue('chat/club-1/team-1/image/x.png'),
      assertStoredObject: jest.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('retired')),
    }
    const service = new ChatService(prisma as never,
      { assertReadableAccess: jest.fn().mockResolvedValue({ team: { clubId: 'club-1' } }) } as never,
      {} as never, {} as never, { assertWritable: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never, r2 as never)
    await expect(service.postMedia('user-1', {
      teamId: 'team-1', channelId: 'ch-1', messageType: 'IMAGE', attachmentUrl: 'https://assets.example/x.png',
    })).rejects.toThrow(deleted ? 'Account unavailable' : retiring ? 'Attachment is being removed; upload it again' : 'Attachment upload is invalid or incomplete')
    expect(prisma.$executeRaw.mock.calls[0]).toContain('user-1')
    if (!deleted && !retiring) {
      expect(prisma.$executeRaw.mock.calls[2]).toContain('media-object:chat/club-1/team-1/image/x.png')
      expect(r2.assertStoredObject.mock.invocationCallOrder[1]).toBeGreaterThan(prisma.$executeRaw.mock.invocationCallOrder[2])
    } else expect(r2.assertStoredObject).toHaveBeenCalledTimes(1)
    expect(prisma.message.create).not.toHaveBeenCalled()
  })
  it('rejects an attachment outside the caller team namespace before persisting', async () => {
    const prisma = { message: { create: jest.fn() } }
    const teams = {
      assertReadableAccess: jest.fn().mockResolvedValue({ team: { clubId: 'club-1' } }),
    }
    const r2 = {
      objectKeyFromUrl: jest.fn().mockReturnValue('chat/club-2/team-2/image/x.png'),
      assertStoredObject: jest.fn(),
    }
    const service = new ChatService(
      prisma as never,
      teams as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      r2 as never,
    )

    await expect(
      service.postMedia('user-1', {
        teamId: 'team-1',
        channelId: 'ch-1',
        messageType: 'IMAGE',
        attachmentUrl: 'https://assets.example/foreign.png',
      }),
    ).rejects.toThrow('Attachment does not belong to this team upload')
    expect(prisma.message.create).not.toHaveBeenCalled()
    expect(r2.assertStoredObject).not.toHaveBeenCalled()
  })

  it('requires the uploaded object metadata to pass server-side inspection', async () => {
    const prisma = { message: { create: jest.fn() } }
    const teams = {
      assertReadableAccess: jest.fn().mockResolvedValue({ team: { clubId: 'club-1' } }),
    }
    const r2 = {
      objectKeyFromUrl: jest.fn().mockReturnValue('chat/club-1/team-1/image/x.png'),
      assertStoredObject: jest.fn().mockRejectedValue(new Error('too large')),
    }
    const service = new ChatService(
      prisma as never,
      teams as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      r2 as never,
    )

    await expect(
      service.postMedia('user-1', {
        teamId: 'team-1',
        channelId: 'ch-1',
        messageType: 'IMAGE',
        attachmentUrl: 'https://assets.example/x.png',
      }),
    ).rejects.toThrow('Attachment upload is invalid or incomplete')
    expect(prisma.message.create).not.toHaveBeenCalled()
  })

  it('L3: refuses a media post without a channel before touching storage', async () => {
    const prisma = { message: { create: jest.fn() } }
    const teams = { assertReadableAccess: jest.fn() }
    const r2 = { objectKeyFromUrl: jest.fn(), assertStoredObject: jest.fn() }
    const service = new ChatService(
      prisma as never,
      teams as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      r2 as never,
    )
    await expect(
      service.postMedia('user-1', {
        teamId: 'team-1',
        messageType: 'IMAGE',
        attachmentUrl: 'https://assets.example/x.png',
      }),
    ).rejects.toThrow('Channel required')
    expect(teams.assertReadableAccess).not.toHaveBeenCalled()
    expect(prisma.message.create).not.toHaveBeenCalled()
  })
})
