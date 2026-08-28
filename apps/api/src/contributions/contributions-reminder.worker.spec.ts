import { ContributionsReminderWorker } from './contributions-reminder.worker'

describe('ContributionsReminderWorker entitlement boundary', () => {
  it('does not invoke automation for a free or expired club', async () => {
    const prisma = {
      clubContributionSettings: {
        findMany: jest.fn().mockResolvedValue([{ clubId: 'free-club' }]),
      },
    }
    const contributions = { runAutomaticReminderSweep: jest.fn() }
    const entitlements = { resolve: jest.fn().mockResolvedValue({ tier: 'FREE' }) }
    const worker = new ContributionsReminderWorker(
      prisma as never,
      contributions as never,
      entitlements as never,
    )

    await worker.runCycle()

    expect(entitlements.resolve).toHaveBeenCalledWith('free-club')
    expect(contributions.runAutomaticReminderSweep).not.toHaveBeenCalled()
  })
})
