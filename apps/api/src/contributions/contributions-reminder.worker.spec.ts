import {
  ContributionsReminderWorker,
  isContributionDeliveryWindow,
} from './contributions-reminder.worker'

describe('ContributionsReminderWorker entitlement boundary', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-28T10:00:00.000Z'))
  })

  afterEach(() => jest.useRealTimers())

  it('does not invoke automation for a free or expired club', async () => {
    const prisma = {
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
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

  it('respects the 08:00–20:00 Europe/Berlin delivery window', () => {
    expect(isContributionDeliveryWindow(new Date('2026-01-15T06:59:00.000Z'))).toBe(false)
    expect(isContributionDeliveryWindow(new Date('2026-01-15T07:00:00.000Z'))).toBe(true)
    expect(isContributionDeliveryWindow(new Date('2026-07-15T17:59:00.000Z'))).toBe(true)
    expect(isContributionDeliveryWindow(new Date('2026-07-15T18:00:00.000Z'))).toBe(false)
  })

  it('does not invoke automation while the contribution kill switch is active', async () => {
    const prisma = {
      platformSetting: { findUnique: jest.fn().mockResolvedValue({ value: 'true' }) },
      clubContributionSettings: { findMany: jest.fn() },
    }
    const contributions = { runAutomaticReminderSweep: jest.fn() }
    const entitlements = { resolve: jest.fn() }
    const worker = new ContributionsReminderWorker(
      prisma as never,
      contributions as never,
      entitlements as never,
    )

    await worker.runCycle()

    expect(prisma.clubContributionSettings.findMany).not.toHaveBeenCalled()
    expect(contributions.runAutomaticReminderSweep).not.toHaveBeenCalled()
  })
})
