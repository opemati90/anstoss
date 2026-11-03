import '../../test/future-capabilities'

import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { RegistrationRole } from '@anstoss/shared'
import { UsersService } from './users.service'
import { hashUnderageEmail, UNDERAGE_EMAIL_PROVIDER } from '../auth/underage-email-tombstone'

// Onboarding review fixes: every self-registering user gives a date of birth
// (B1), the registration role changes freely until the account belongs to a
// club or has a pending claim (H3), free agents are 16+ with a DOB (B3), and
// under-16 self-registrations never keep an account of their own (B1/M3).

function yearsAgo(years: number, extraDays = 0) {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  d.setDate(d.getDate() - extraDays)
  return d
}

function createService(
  current: {
    dateOfBirth: Date | null
    registrationRole: RegistrationRole | null
    adultConfirmedAt: Date | null
    email?: string | null
  },
  opts: { membership?: boolean; pendingClaim?: boolean } = {},
) {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn(),
    authIdentityTombstone: { upsert: jest.fn().mockResolvedValue({}) },
    user: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    membership: { findFirst: jest.fn() },
    clubClaim: { findFirst: jest.fn() },
  }
  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ email: 'kid@example.de', clerkId: null, ...current }),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'user-1', ...data }),
        ),
    },
    membership: {
      findFirst: jest.fn().mockResolvedValue(opts.membership ? { id: 'm-1' } : null),
    },
    clubClaim: {
      findFirst: jest.fn().mockResolvedValue(opts.pendingClaim ? { id: 'claim-1' } : null),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  }
  tx.user.findUnique.mockImplementation(() => prisma.user.findUnique())
  tx.membership.findFirst.mockImplementation(() => prisma.membership.findFirst())
  tx.clubClaim.findFirst.mockImplementation(() => prisma.clubClaim.findFirst())
  const service = new UsersService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  )
  return { prisma, service, tx }
}

describe('UsersService.updateProfile: date of birth instead of the 16+ declaration (B1)', () => {
  it('refuses a new 16+ declaration: new accounts give a DOB', async () => {
    const { prisma, service } = createService({
      dateOfBirth: null,
      registrationRole: RegistrationRole.PLAYER,
      adultConfirmedAt: null,
    })
    const err = await service
      .updateProfile('user-1', { registrationRole: RegistrationRole.PARENT, confirmAdult: true })
      .catch((e) => e)
    expect(err).toBeInstanceOf(BadRequestException)
    expect(err.getResponse()).toMatchObject({ code: 'DOB_REQUIRED' })
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('treats a repeat declaration on a legacy account as a no-op', async () => {
    const { tx, service } = createService({
      dateOfBirth: null,
      registrationRole: RegistrationRole.PARENT,
      adultConfirmedAt: new Date('2026-09-01'),
    })
    await service.updateProfile('user-1', { confirmAdult: true })
    const data = tx.user.update.mock.calls[0][0].data
    expect(data).not.toHaveProperty('adultConfirmedAt')
  })

  it('stores an adult DOB with the name in one write', async () => {
    const { tx, service } = createService({
      dateOfBirth: null,
      registrationRole: RegistrationRole.PLAYER,
      adultConfirmedAt: null,
    })
    await service.updateProfile('user-1', { name: 'Tim Weber', dateOfBirth: '1996-04-03' })
    expect(tx.user.update.mock.calls[0][0].data).toMatchObject({
      name: 'Tim Weber',
      dateOfBirth: new Date('1996-04-03'),
    })
  })

  it('under 13 without a club: removes the account, blocks the address, answers UNDER_13', async () => {
    const { prisma, service, tx } = createService({
      dateOfBirth: null,
      registrationRole: RegistrationRole.PLAYER,
      adultConfirmedAt: null,
      email: 'Kid@Example.de',
    })
    const dob = yearsAgo(11).toISOString().slice(0, 10)
    const err = await service.updateProfile('user-1', { dateOfBirth: dob }).catch((e) => e)
    expect(err).toBeInstanceOf(ForbiddenException)
    expect(err.getResponse()).toMatchObject({ code: 'UNDER_13' })
    expect(tx.authIdentityTombstone.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          provider: UNDERAGE_EMAIL_PROVIDER,
          subjectHash: hashUnderageEmail('kid@example.de'),
          reason: 'underage_blocked',
        }),
      }),
    )
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
    )
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('13-15 without a club: refuses to store the DOB and points to the parent handoff', async () => {
    const { prisma, service, tx } = createService({
      dateOfBirth: null,
      registrationRole: RegistrationRole.PLAYER,
      adultConfirmedAt: null,
    })
    const dob = yearsAgo(14).toISOString().slice(0, 10)
    const err = await service.updateProfile('user-1', { dateOfBirth: dob }).catch((e) => e)
    expect(err.getResponse()).toMatchObject({ code: 'UNDER_16_HANDOFF' })
    expect(tx.user.update).not.toHaveBeenCalled()
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('keeps the consent flow for a legacy member giving a late 14-year-old DOB', async () => {
    const { tx, service } = createService(
      { dateOfBirth: null, registrationRole: RegistrationRole.PLAYER, adultConfirmedAt: null },
      { membership: true },
    )
    const dob = yearsAgo(14).toISOString().slice(0, 10)
    await service.updateProfile('user-1', { dateOfBirth: dob })
    expect(tx.user.update).toHaveBeenCalled()
  })
})

describe('UsersService.updateProfile: registration role (H3, B3)', () => {
  it('lets a would-be club admin without a club or claim become a player again', async () => {
    const { tx, service } = createService({
      dateOfBirth: yearsAgo(30),
      registrationRole: RegistrationRole.CLUB_ADMIN,
      adultConfirmedAt: null,
    })
    await service.updateProfile('user-1', { registrationRole: RegistrationRole.PARENT })
    expect(tx.user.update.mock.calls[0][0].data.registrationRole).toBe(RegistrationRole.PARENT)
  })

  it('locks the role while a club claim is pending', async () => {
    const { service } = createService(
      { dateOfBirth: yearsAgo(30), registrationRole: RegistrationRole.CLUB_ADMIN, adultConfirmedAt: null },
      { pendingClaim: true },
    )
    const err = await service
      .updateProfile('user-1', { registrationRole: RegistrationRole.PLAYER })
      .catch((e) => e)
    expect(err.getResponse()).toMatchObject({ code: 'ROLE_LOCKED' })
  })

  it('locks the role once the account belongs to a club', async () => {
    const { service } = createService(
      { dateOfBirth: yearsAgo(30), registrationRole: RegistrationRole.COACH, adultConfirmedAt: null },
      { membership: true },
    )
    await expect(
      service.updateProfile('user-1', { registrationRole: RegistrationRole.PARENT }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('requires a DOB for the free-agent role', async () => {
    const { service } = createService({
      dateOfBirth: null,
      registrationRole: RegistrationRole.PLAYER,
      adultConfirmedAt: new Date('2026-09-01'),
    })
    const err = await service
      .updateProfile('user-1', { registrationRole: RegistrationRole.FREE_AGENT })
      .catch((e) => e)
    expect(err.getResponse()).toMatchObject({ code: 'DOB_REQUIRED' })
  })

  it('accepts the free-agent role with a 16+ DOB in the same request', async () => {
    const { tx, service } = createService({
      dateOfBirth: null,
      registrationRole: RegistrationRole.PLAYER,
      adultConfirmedAt: null,
    })
    await service.updateProfile('user-1', {
      name: 'Lukas Hoffmann',
      dateOfBirth: '2000-01-15',
      registrationRole: RegistrationRole.FREE_AGENT,
    })
    expect(tx.user.update.mock.calls[0][0].data.registrationRole).toBe(
      RegistrationRole.FREE_AGENT,
    )
  })

  it('refuses the free-agent role for a member under 16', async () => {
    const { service } = createService(
      { dateOfBirth: yearsAgo(15), registrationRole: RegistrationRole.PLAYER, adultConfirmedAt: null },
      { membership: true },
    )
    const err = await service
      .updateProfile('user-1', { registrationRole: RegistrationRole.FREE_AGENT })
      .catch((e) => e)
    expect(err).toBeInstanceOf(ForbiddenException)
    expect(err.getResponse()).toMatchObject({ code: 'FREE_AGENT_UNDER_16' })
  })
})
