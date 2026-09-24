import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { UsersService } from './users.service'
import { hashUnderageEmail, UNDERAGE_EMAIL_PROVIDER } from '../auth/underage-email-tombstone'

jest.mock('../email/mailer', () => ({ sendEmail: jest.fn(async () => true) }))

// Onboarding review fixes B1/B2/M3 for POST /me/parent-handoff.
function dobForAge(years: number) {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  d.setDate(d.getDate() - 10)
  return d.toISOString()
}

function createService(opts: { blockedEmails?: string[]; inviteTeamId?: string | null } = {}) {
  const blocked = new Set((opts.blockedEmails ?? []).map((e) => hashUnderageEmail(e)))
  const tx = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
    parentHandoff: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    authIdentityTombstone: { upsert: jest.fn().mockResolvedValue({}) },
    user: { update: jest.fn().mockResolvedValue({}) },
  }
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        clerkId: null,
        preferredLanguage: 'de',
        email: 'lena.kid@example.de',
      }),
    },
    parentHandoff: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    authIdentityTombstone: {
      findUnique: jest.fn(async ({ where }: any) =>
        blocked.has(where.provider_subjectHash.subjectHash) ? { createdAt: new Date() } : null,
      ),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  }
  const invites = {
    validate: jest.fn(async () => ({ teamId: opts.inviteTeamId ?? null })),
    validateCampaign: jest.fn(),
  }
  const service = new UsersService(
    prisma as never,
    {} as never,
    {} as never,
    invites as never,
    {} as never,
  )
  return { prisma, tx, service, invites }
}

describe('UsersService.sendParentHandoff', () => {
  it('rejects the child giving their own address as the guardian (B2)', async () => {
    const { service, tx } = createService()
    const err = await service
      .sendParentHandoff('kid-1', {
        childFirstName: 'Lena',
        childDateOfBirth: dobForAge(14),
        guardianEmail: ' Lena.Kid@Example.de ',
      })
      .catch((e) => e)
    expect(err).toBeInstanceOf(BadRequestException)
    expect(err.getResponse()).toMatchObject({ code: 'GUARDIAN_IS_CHILD' })
    expect(tx.parentHandoff.create).not.toHaveBeenCalled()
  })

  it('rejects a recently removed under-16 address as the guardian (B2)', async () => {
    const { service } = createService({ blockedEmails: ['old.kid@example.de'] })
    const err = await service
      .sendParentHandoff('kid-1', {
        childFirstName: 'Lena',
        childDateOfBirth: dobForAge(14),
        guardianEmail: 'old.kid@example.de',
      })
      .catch((e) => e)
    expect(err.getResponse()).toMatchObject({ code: 'GUARDIAN_IS_CHILD' })
  })

  it('refuses under 13: that path is blocked, not handed off (M3)', async () => {
    const { service } = createService()
    const err = await service
      .sendParentHandoff('kid-1', {
        childFirstName: 'Mia',
        childDateOfBirth: dobForAge(11),
        guardianEmail: 'anna.weber@example.de',
      })
      .catch((e) => e)
    expect(err).toBeInstanceOf(ForbiddenException)
    expect(err.getResponse()).toMatchObject({ code: 'UNDER_13' })
  })

  it('blocks the child address for 30 days and remembers the invite team (B1, H5)', async () => {
    const { service, tx } = createService({ inviteTeamId: 'team-u14' })
    await service.sendParentHandoff('kid-1', {
      childFirstName: 'Lena',
      childDateOfBirth: dobForAge(14),
      guardianEmail: 'anna.weber@example.de',
      inviteCode: 'E2EINV01',
    })
    expect(tx.parentHandoff.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ teamId: 'team-u14', guardianEmail: 'anna.weber@example.de' }),
    })
    expect(tx.authIdentityTombstone.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_subjectHash: {
            provider: UNDERAGE_EMAIL_PROVIDER,
            subjectHash: hashUnderageEmail('lena.kid@example.de'),
          },
        },
      }),
    )
    // The account itself is removed in the same transaction.
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
    )
  })
})
