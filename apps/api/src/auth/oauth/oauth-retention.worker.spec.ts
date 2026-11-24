import { PrismaService } from '../../prisma/prisma.service'
import { OAuthProviderService } from './oauth.provider'
import { SocialIdentityRetentionWorker } from './oauth-retention.worker'

describe('social grant retention', () => {
  const now = new Date('2026-11-16T12:00:00Z')
  function setup() {
    const db = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      socialIdentity: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      socialLoginChallenge: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      authIdentityTombstone: {
        upsert: jest.fn(),
        deleteMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    }
    const prisma = {
      ...db,
      $transaction: jest.fn(async (fn: (tx: typeof db) => unknown) => fn(db)),
    }
    const provider = { revokeApple: jest.fn().mockResolvedValue(undefined) }
    const worker = new SocialIdentityRetentionWorker(
      prisma as unknown as PrismaService,
      provider as unknown as OAuthProviderService,
    )
    // The assertion is on persistence/retry; don't write deliberate failure logs.
    jest.spyOn(worker['logger'], 'error').mockImplementation(() => undefined)
    return { db, provider, worker }
  }
  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })
  it('continues cleanup when new social logins are disabled', () => {
    const env = { ...process.env }
    const { worker } = setup()
    jest.useFakeTimers()
    process.env.NODE_ENV = 'production'
    process.env.ANSTOSS_SOCIAL_LOGIN_ENABLED = 'false'
    const sweep = jest.spyOn(worker, 'sweep').mockResolvedValue(undefined)
    try {
      worker.onModuleInit()
      expect(sweep).toHaveBeenCalledTimes(1)
      jest.advanceTimersByTime(60_000)
      expect(sweep).toHaveBeenCalledTimes(2)
    } finally {
      worker.onModuleDestroy()
      process.env = env
    }
  })
  it('revokes Apple access before removing a deleted user identity', async () => {
    const { db, provider, worker } = setup()
    db.socialIdentity.findMany.mockResolvedValue([
      {
        id: 'identity',
        provider: 'apple',
        subjectHash: 'hash',
        userId: 'deleted-user',
        sealedRefreshToken: 'sealed-grant',
        user: { deletedAt: now },
      },
    ])
    db.socialIdentity.findUnique.mockResolvedValue({
      id: 'identity',
      provider: 'apple',
      sealedRefreshToken: 'sealed-grant',
      user: { deletedAt: now },
    })
    await worker.sweep(now)
    expect(provider.revokeApple).toHaveBeenCalledWith('sealed-grant')
    expect(db.authIdentityTombstone.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          provider: 'social-apple',
          subjectHash: 'hash',
          createdAt: now,
        }),
      }),
    )
    expect(provider.revokeApple.mock.invocationCallOrder[0]).toBeLessThan(
      db.socialIdentity.deleteMany.mock.invocationCallOrder[0],
    )
  })
  it('retains a failed deletion grant for retry without leaking it into logs', async () => {
    const { db, provider, worker } = setup()
    db.socialIdentity.findMany.mockResolvedValue([
      {
        id: 'identity',
        provider: 'apple',
        subjectHash: 'hash',
        userId: 'deleted-user',
        sealedRefreshToken: 'sealed-grant',
        user: { deletedAt: now },
      },
    ])
    db.socialIdentity.findUnique.mockResolvedValue({
      id: 'identity',
      provider: 'apple',
      sealedRefreshToken: 'sealed-grant',
      user: { deletedAt: now },
    })
    provider.revokeApple.mockRejectedValue(new Error('sensitive provider response'))
    await worker.sweep(now)
    expect(db.socialIdentity.deleteMany).not.toHaveBeenCalled()
    expect(worker['logger'].error).toHaveBeenCalledWith(
      'Social identity revocation failed; will retry',
    )
  })
  function expired() {
    const state = setup()
    const grant = {
      id: 'expired-link',
      provider: 'apple',
      subjectHash: 'hash',
      sealedRefreshToken: 'pending-grant',
      expiresAt: new Date(now.getTime() - 1),
    }
    state.db.socialLoginChallenge.findMany.mockResolvedValue([grant])
    state.db.socialLoginChallenge.findUnique.mockResolvedValue(grant)
    return state
  }
  it('revokes an abandoned Apple linking grant before deleting it', async () => {
    const { db, provider, worker } = expired()
    await worker.sweep(now)
    expect(provider.revokeApple).toHaveBeenCalledWith('pending-grant')
    expect(db.socialLoginChallenge.deleteMany).toHaveBeenCalledWith({
      where: { id: 'expired-link' },
    })
  })
  it('does not revoke Apple access if another linking attempt already succeeded', async () => {
    const { db, provider, worker } = expired()
    db.socialIdentity.findUnique.mockResolvedValue({
      id: 'active-identity',
      user: { deletedAt: null, managedById: null },
    })
    await worker.sweep(now)
    expect(provider.revokeApple).not.toHaveBeenCalled()
    expect(db.socialLoginChallenge.deleteMany).toHaveBeenCalledWith({
      where: { id: 'expired-link' },
    })
  })
  it('keeps a failed expired-grant revocation for the next sweep', async () => {
    const { db, provider, worker } = expired()
    provider.revokeApple.mockRejectedValue(new Error('offline'))
    await worker.sweep(now)
    expect(db.socialLoginChallenge.deleteMany).not.toHaveBeenCalledWith({
      where: { id: 'expired-link' },
    })
    expect(db.socialLoginChallenge.deleteMany).toHaveBeenCalledWith({
      where: {
        expiresAt: { lte: now },
        sealedRefreshToken: null,
      },
    })
  })
})
