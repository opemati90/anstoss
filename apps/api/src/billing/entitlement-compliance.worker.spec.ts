import { sendEmail } from '../email/mailer'
import { EntitlementComplianceWorker } from './entitlement-compliance.worker'

jest.mock('../email/mailer', () => ({ sendEmail: jest.fn() }))

const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>

describe('EntitlementComplianceWorker', () => {
  beforeEach(() => mockSendEmail.mockReset())

  it('notifies the owner once and preserves the club data during remediation', async () => {
    const compliance = {
      id: 'compliance-1',
      status: 'OVER_QUOTA',
      excessTeams: 2,
      excessPlayers: 9,
      remediationEndsAt: new Date('2026-09-27T12:00:00.000Z'),
      notifiedAt: null,
    }
    const prisma = {
      club: { findMany: jest.fn().mockResolvedValue([{ id: 'club-1', name: 'FC Test' }]) },
      membership: {
        findFirst: jest.fn().mockResolvedValue({ user: { email: 'owner@example.com' } }),
      },
      clubPlanCompliance: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    }
    const entitlements = { refreshCompliance: jest.fn().mockResolvedValue(compliance) }
    mockSendEmail.mockResolvedValue(true)

    await expect(
      new EntitlementComplianceWorker(prisma as never, entitlements as never).runCycle(),
    ).resolves.toEqual({ clubs: 1, notified: 1 })

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@example.com',
        text: expect.stringContaining('Existing data stays available'),
      }),
    )
    expect(prisma.clubPlanCompliance.updateMany).toHaveBeenCalledWith({
      where: { id: 'compliance-1', status: 'OVER_QUOTA', notifiedAt: null },
      data: { notifiedAt: expect.any(Date) },
    })
  })

  it('does not resend a notification for the same compliance incident', async () => {
    const prisma = {
      club: { findMany: jest.fn().mockResolvedValue([{ id: 'club-1', name: 'FC Test' }]) },
      membership: { findFirst: jest.fn() },
      clubPlanCompliance: { updateMany: jest.fn() },
    }
    const entitlements = {
      refreshCompliance: jest.fn().mockResolvedValue({
        id: 'compliance-1',
        status: 'OVER_QUOTA',
        notifiedAt: new Date(),
      }),
    }

    await expect(
      new EntitlementComplianceWorker(prisma as never, entitlements as never).runCycle(),
    ).resolves.toEqual({ clubs: 1, notified: 0 })
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(prisma.membership.findFirst).not.toHaveBeenCalled()
  })
})
