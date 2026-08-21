import { ChatService } from './chat.service'

// Regression: ISSUE-007 — arbitrary/foreign URLs could be persisted as chat media.
// Found by the launch adversarial audit on 2026-08-21.
describe('ChatService media upload binding', () => {
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
        messageType: 'IMAGE',
        attachmentUrl: 'https://assets.example/x.png',
      }),
    ).rejects.toThrow('Attachment upload is invalid or incomplete')
    expect(prisma.message.create).not.toHaveBeenCalled()
  })
})
