/** Default adult launch: delayed writes must never restore erased profile data. */
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { RegistrationRole } from '@anstoss/shared'
import { UsersService } from './users.service'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function fixture() {
  const state = {
    id: 'user',
    name: 'Adult',
    email: 'adult@example.invalid',
    clerkId: null,
    deletedAt: null as Date | null,
    dateOfBirth: new Date('1990-02-01'),
    registrationRole: RegistrationRole.PLAYER,
    adultConfirmedAt: null,
    avatarUrl: null as string | null,
  }
  let inTransaction = false
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    user: {
      findUnique: jest.fn(async () => ({ ...state })),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
        Object.assign(state, data),
      ),
    },
    accountMediaDeletion: { findUnique: jest.fn().mockResolvedValue(null) },
    membership: { findFirst: jest.fn().mockResolvedValue(null) },
    clubClaim: { findFirst: jest.fn().mockResolvedValue(null) },
  }
  const prisma = {
    user: { findUnique: jest.fn(async () => ({ ...state })) },
    membership: { findFirst: jest.fn().mockResolvedValue(null) },
    clubClaim: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(async (run: (client: typeof tx) => Promise<unknown>) => {
      inTransaction = true
      try {
        return await run(tx)
      } finally {
        inTransaction = false
      }
    }),
  }
  const r2 = {
    enabled: true,
    objectKeyFromUrl: jest.fn((url: string) =>
      url.startsWith('https://assets.invalid/')
        ? url.slice('https://assets.invalid/'.length)
        : null,
    ),
    assertStoredObject: jest.fn(async () => {
      expect(inTransaction).toBe(false)
    }),
  }
  const invites = {
    validate: jest.fn().mockResolvedValue({ id: 'invite' }),
    redeem: jest.fn().mockResolvedValue({ ok: true }),
  }
  const service = new UsersService(
    prisma as never,
    {} as never,
    {} as never,
    invites as never,
    {} as never,
    r2 as never,
  )
  return { state, prisma, tx, r2, service, invites }
}

describe('profile writes versus account erasure', () => {
  const avatarUrl = 'https://assets.invalid/users/user/avatar/new.png'

  it('refuses an already deleted account before provider or transaction work', async () => {
    const { state, service, prisma, tx, r2 } = fixture()
    state.deletedAt = new Date()
    await expect(
      service.updateProfile('user', { name: 'Restored', avatarUrl }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(r2.assertStoredObject).not.toHaveBeenCalled()
    expect(tx.user.update).not.toHaveBeenCalled()
  })

  it('does not restore PII after erasure commits during slow avatar validation', async () => {
    const { state, service, tx, r2 } = fixture()
    const started = deferred()
    const finish = deferred()
    r2.assertStoredObject.mockImplementation(async () => {
      started.resolve()
      await finish.promise
    })
    const update = service.updateProfile('user', { name: 'Restored', avatarUrl })
    await started.promise
    state.deletedAt = new Date()
    state.name = 'Deleted User'
    state.avatarUrl = null
    finish.resolve()
    await expect(update).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.user.update).not.toHaveBeenCalled()
    expect(state).toMatchObject({ name: 'Deleted User', avatarUrl: null })
  })

  it('rechecks deletion after waiting for the account lifecycle lock', async () => {
    const { state, service, tx } = fixture()
    tx.$executeRaw.mockImplementationOnce(async () => {
      state.deletedAt = new Date()
      return 0
    })
    await expect(service.updateProfile('user', { name: 'Restored' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(tx.user.update).not.toHaveBeenCalled()
  })

  it('retains account -> object lock order and performs provider I/O before the transaction', async () => {
    const { state, service, tx, r2 } = fixture()
    await service.updateProfile('user', { name: 'Updated', avatarUrl })
    expect(tx.$executeRaw.mock.calls.map((call) => call[1])).toEqual([
      'user',
      'media-object:users/user/avatar/new.png',
    ])
    expect(r2.assertStoredObject.mock.invocationCallOrder[0]).toBeLessThan(
      tx.$executeRaw.mock.invocationCallOrder[0],
    )
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user', deletedAt: null },
      data: { name: 'Updated', avatarUrl },
    })
    expect(state.name).toBe('Updated')
  })

  it('does not attach an avatar that already has a durable deletion job', async () => {
    const { service, tx } = fixture()
    tx.accountMediaDeletion.findUnique.mockResolvedValue({ objectKey: 'users/user/avatar/new.png' })
    await expect(service.updateProfile('user', { avatarUrl })).rejects.toThrow('being removed')
    expect(tx.user.update).not.toHaveBeenCalled()
  })

  it('does not overwrite an immutable DOB concurrently supplied by another request', async () => {
    const { state, service, tx } = fixture()
    tx.$executeRaw.mockImplementationOnce(async () => {
      state.dateOfBirth = new Date('1991-03-01')
      return 0
    })
    await expect(
      service.updateProfile('user', { dateOfBirth: '1990-02-01' }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(tx.user.update).not.toHaveBeenCalled()
  })

  it('requires fresh validation when a registration role changes before commit', async () => {
    const { state, service, tx } = fixture()
    tx.$executeRaw.mockImplementationOnce(async () => {
      state.registrationRole = RegistrationRole.COACH
      return 0
    })
    await expect(
      service.updateProfile('user', { registrationRole: RegistrationRole.FREE_AGENT }),
    ).rejects.toThrow('Profile changed')
    expect(tx.user.update).not.toHaveBeenCalled()
  })

  it('rechecks club membership admitted after preflight role validation', async () => {
    const { service, tx } = fixture()
    tx.membership.findFirst.mockResolvedValue({ id: 'new-membership' })
    await expect(
      service.updateProfile('user', { registrationRole: RegistrationRole.CLUB_ADMIN }),
    ).rejects.toThrow('after joining a club')
    expect(tx.user.update).not.toHaveBeenCalled()
  })
})

describe('onboarding writes versus account erasure', () => {
  const input = {
    registrationRole: RegistrationRole.PLAYER as const,
    profile: { displayName: 'Adult', dateOfBirth: '1990-02-01', photoUrl: 'https://assets.invalid/users/user/avatar/new.png' },
    join: { inviteCode: 'INVITE1' },
  }

  it('refuses an erased account before validation or dispatch', async () => {
    const { state, service, invites, r2, tx } = fixture()
    state.deletedAt = new Date()
    await expect(service.completeOnboarding('user', input)).rejects.toBeInstanceOf(NotFoundException)
    expect(invites.validate).not.toHaveBeenCalled()
    expect(r2.assertStoredObject).not.toHaveBeenCalled()
    expect(tx.user.update).not.toHaveBeenCalled()
    expect(invites.redeem).not.toHaveBeenCalled()
  })

  it('does not restore erased profile data or redeem an invite after slow avatar validation', async () => {
    const { state, service, tx, r2, invites } = fixture()
    const started = deferred()
    const finish = deferred()
    r2.assertStoredObject.mockImplementation(async () => { started.resolve(); await finish.promise })
    const request = service.completeOnboarding('user', input)
    await started.promise
    state.deletedAt = new Date()
    state.name = 'Deleted User'
    state.avatarUrl = null
    finish.resolve()
    await expect(request).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.user.update).not.toHaveBeenCalled()
    expect(invites.redeem).not.toHaveBeenCalled()
    expect(state).toMatchObject({ name: 'Deleted User', avatarUrl: null })
  })

  it('rechecks role after the account lock', async () => {
    const { state, service, tx, invites } = fixture()
    tx.$executeRaw.mockImplementationOnce(async () => { state.registrationRole = RegistrationRole.COACH; return 0 })
    await expect(service.completeOnboarding('user', input)).rejects.toThrow('registrationRole')
    expect(tx.user.update).not.toHaveBeenCalled()
    expect(invites.redeem).not.toHaveBeenCalled()
  })

  it('does not overwrite a date of birth recorded by a concurrent request', async () => {
    const { state, service, tx, invites } = fixture()
    tx.$executeRaw.mockImplementationOnce(async () => { state.dateOfBirth = new Date('1991-03-01'); return 0 })
    await expect(service.completeOnboarding('user', input)).rejects.toThrow('Date of birth is read-only')
    expect(tx.user.update).not.toHaveBeenCalled()
    expect(invites.redeem).not.toHaveBeenCalled()
  })

  it('rejects an avatar queued for deletion without writing or dispatching', async () => {
    const { service, tx, invites } = fixture()
    tx.accountMediaDeletion.findUnique.mockResolvedValue({ objectKey: 'users/user/avatar/new.png' })
    await expect(service.completeOnboarding('user', input)).rejects.toThrow('being removed')
    expect(tx.user.update).not.toHaveBeenCalled()
    expect(invites.redeem).not.toHaveBeenCalled()
  })

  it('persists the profile under account and avatar locks before invite redemption', async () => {
    const { service, tx, invites } = fixture()
    await expect(service.completeOnboarding('user', input)).resolves.toEqual({ ok: true })
    expect(tx.$executeRaw.mock.calls.map((call) => call[1])).toEqual(['user', 'media-object:users/user/avatar/new.png'])
    expect(tx.user.update.mock.invocationCallOrder[0]).toBeLessThan(invites.redeem.mock.invocationCallOrder[0])
  })
})
