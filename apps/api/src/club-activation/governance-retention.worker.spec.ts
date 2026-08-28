import { GovernanceRetentionWorker } from './governance-retention.worker'

describe('GovernanceRetentionWorker', () => {
  it('persists claim and ownership-transfer expiry with audit records', async () => {
    const now = new Date('2026-08-28T12:00:00.000Z')
    const tx = {
      clubClaim: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      ownershipTransfer: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    }
    const prisma = {
      clubClaim: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'claim-1', clubId: null, claimantUserId: 'user-1' }])
          .mockResolvedValueOnce([]),
      },
      ownershipTransfer: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'transfer-1',
            clubId: 'club-1',
            fromUserId: 'owner-1',
            toUserId: 'admin-1',
          },
        ]),
      },
      club: { findMany: jest.fn().mockResolvedValue([]) },
      clubClaimEvidence: { deleteMany: jest.fn() },
      ownershipTransferChallenge: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      invite: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      inviteCampaign: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    }

    const result = await new GovernanceRetentionWorker(prisma as never).runCycle(now)

    expect(result).toEqual({
      expiredClaims: 1,
      expiredTransfers: 1,
      purgedEvidence: 0,
      purgedInvites: 0,
      retiredCampaigns: 0,
    })
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'club.claim_expired' }),
    })
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'club.ownership_transfer_expired' }),
    })
  })

  it('purges resolved evidence after 180 days unless the club has an open dispute', async () => {
    const prisma = {
      clubClaim: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            { evidence: [{ id: 'purge-me' }], club: null },
            { evidence: [{ id: 'keep-me' }], club: { disputes: [{ id: 'dispute-1' }] } },
          ]),
      },
      ownershipTransfer: { findMany: jest.fn().mockResolvedValue([]) },
      club: { findMany: jest.fn().mockResolvedValue([]) },
      clubClaimEvidence: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      ownershipTransferChallenge: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      invite: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
      inviteCampaign: {
        findMany: jest.fn().mockResolvedValue([{ id: 'campaign-old' }]),
        update: jest.fn().mockResolvedValue({}),
      },
    }

    const result = await new GovernanceRetentionWorker(prisma as never).runCycle(
      new Date('2026-08-28T12:00:00.000Z'),
    )

    expect(result.purgedEvidence).toBe(1)
    expect(result.purgedInvites).toBe(2)
    expect(result.retiredCampaigns).toBe(1)
    expect(prisma.clubClaimEvidence.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['purge-me'] } },
    })
    expect(prisma.invite.deleteMany).toHaveBeenCalledWith({
      where: {
        acceptedByUserId: null,
        status: { in: ['EXPIRED', 'REVOKED'] },
        updatedAt: { lte: new Date('2026-05-30T12:00:00.000Z') },
      },
    })
    expect(prisma.inviteCampaign.update).toHaveBeenCalledWith({
      where: { id: 'campaign-old' },
      data: {
        recipientEmail: null,
        code: 'retired-campaign-old',
        retiredAt: new Date('2026-08-28T12:00:00.000Z'),
      },
    })
  })
})
