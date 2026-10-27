import { ChatRetentionWorker } from './chat-retention.worker'
import { tenantContext } from '../prisma/tenant.context'

describe('read-only retention preview', () => {
  it('counts only enabled clubs with the worker cutoffs, tenant scopes and report holds', async () => {
    const messageCount = jest.fn(async () => {
      expect(tenantContext.getStore()?.clubId).toBe('club-1')
      return 3
    })
    const directCount = jest.fn().mockResolvedValue(2)
    const prisma = {
      club: { findMany: jest.fn().mockResolvedValue([
        { id: 'club-1', chatRetentionSettings: { enabled: true, messageRetentionDays: 30, attachmentRetentionDays: 7 } },
        { id: 'disabled', chatRetentionSettings: { enabled: false } },
        { id: 'unset', chatRetentionSettings: null },
      ]) },
      message: { count: messageCount }, directMessage: { count: directCount },
    }
    // No write methods or storage provider are supplied: any attempted mutation fails.
    const worker = new ChatRetentionWorker(prisma as never, {} as never)
    const now = new Date('2026-10-27T12:00:00Z')
    const result = await worker.previewExpired(now)
    expect(result).toMatchObject({ advisory: true, clubsScanned: 3, enabledClubs: [{
      clubId: 'club-1', channelMessages: 3, directMessages: 2, channelAttachments: 3, directAttachments: 2,
    }] })
    const messageCutoff = new Date('2026-09-27T12:00:00Z')
    const attachmentCutoff = new Date('2026-10-20T12:00:00Z')
    expect(messageCount.mock.calls).toHaveLength(2)
    expect(directCount.mock.calls).toHaveLength(2)
    expect(messageCount).toHaveBeenNthCalledWith(1, { where: {
      clubId: 'club-1', deletedAt: null, createdAt: { lte: messageCutoff }, reports: { none: { resolvedAt: null } },
    } })
    expect(directCount).toHaveBeenNthCalledWith(2, { where: {
      conversation: { clubId: 'club-1' }, attachmentUrl: { not: null }, reports: { none: { resolvedAt: null } },
      OR: [{ createdAt: { lte: attachmentCutoff } }, { createdAt: { lte: messageCutoff }, deletedAt: null }],
    } })
  })
})
