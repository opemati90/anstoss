import { ForbiddenException } from '@nestjs/common'
import { OnboardingService } from './onboarding.service'

// Regression: ISSUE-002 — a caller could claim roster identity with only a phone number
// Found by /qa on 2026-08-21
// Report: .gstack/qa-reports/qa-report-anstoss-launch-2026-08-21.md
describe('OnboardingService legacy phone claims', () => {
  const originalNodeEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
  })

  it('does not reveal roster claims in a production runtime', async () => {
    process.env.NODE_ENV = 'production'
    const prisma = { rosterSlot: { findMany: jest.fn() } }
    const service = new OnboardingService(prisma as never, {} as never)

    await expect(service.listPendingClaims('+4915112345678')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(prisma.rosterSlot.findMany).not.toHaveBeenCalled()
  })

  it('does not grant a slot in a production runtime', async () => {
    process.env.NODE_ENV = 'production'
    const prisma = { $transaction: jest.fn() }
    const service = new OnboardingService(prisma as never, {} as never)

    await expect(
      service.claimSlot('attacker', '+4915112345678', 'slot-1'),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
