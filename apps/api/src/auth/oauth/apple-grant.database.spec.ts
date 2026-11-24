import { randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import type { PrismaService } from '../../prisma/prisma.service'
import type { OtpService } from '../otp/otp.service'
import type { OAuthProviderService, VerifiedSocialIdentity } from './oauth.provider'
import { SocialLoginService, socialSubjectHash, socialTicketHash } from './oauth.service'
import { SocialIdentityRetentionWorker } from './oauth-retention.worker'
import { APPLE_REVOCATION_MARKER } from './apple-session'
import { pruneUnusedAppleRevocations } from './apple-revocation-retention'

const url = process.env.SOCIAL_TEST_DATABASE_URL
if (url) {
  const target = new URL(url)
  if (target.hostname !== '127.0.0.1' || !target.pathname.endsWith('_test'))
    throw new Error('Apple grant tests require an isolated localhost *_test database')
}

;(url ? describe : describe.skip)('Apple grant journal PostgreSQL integration', () => {
  const env = { ...process.env }
  const run = randomUUID()
  let prisma: PrismaClient
  let service: SocialLoginService
  let worker: SocialIdentityRetentionWorker
  const hashes: string[] = []
  const emails: string[] = []
  const provider = {
    configured: () => true,
    verify: jest.fn(),
    exchangeApple: jest.fn(),
    revokeApple: jest.fn(),
  }
  const otp = { requestCode: jest.fn(), verifyCode: jest.fn() }
  const db = () => prisma as unknown as PrismaService

  function fixture(
    index: string,
    proof = Math.floor(Date.now() / 1000) - 100,
  ): VerifiedSocialIdentity {
    const subject = `${run}-${index}`
    const email = `${subject}@example.invalid`
    hashes.push(socialSubjectHash('apple', subject))
    emails.push(email)
    return {
      provider: 'apple',
      subject,
      email,
      name: 'Local QA',
      authenticatedAt: proof,
      sealedRefreshToken: `encrypted-fixture-${index}`,
    }
  }
  async function signIn(identity: VerifiedSocialIdentity) {
    provider.verify.mockResolvedValue({ ...identity, sealedRefreshToken: null })
    provider.exchangeApple.mockResolvedValue(identity)
    const { nonce } = await service.appleNonce()
    return service.signIn('apple', {
      idToken: 'local-fixture',
      authorizationCode: 'local-code',
      nonce,
    })
  }
  async function journal(
    identity: VerifiedSocialIdentity,
    now = new Date(),
    overrides: Record<string, unknown> = {},
  ) {
    return prisma.socialLoginChallenge.create({
      data: {
        tokenHash: socialTicketHash(randomUUID()),
        kind: 'grant',
        provider: 'apple',
        subjectHash: socialSubjectHash('apple', identity.subject),
        sealedRefreshToken: identity.sealedRefreshToken,
        providerAuthenticatedAt: new Date(identity.authenticatedAt! * 1000),
        expiresAt: new Date(now.getTime() - 1000),
        cleanupNextAttemptAt: new Date(now.getTime() - 1000),
        ...overrides,
      },
    })
  }
  async function linked(identity: VerifiedSocialIdentity, legacy = false) {
    return prisma.user.create({
      data: {
        email: identity.email!,
        name: 'QA',
        socialIdentities: {
          create: {
            provider: 'apple',
            subjectHash: socialSubjectHash('apple', identity.subject),
            sealedRefreshToken: identity.sealedRefreshToken,
            providerAuthenticatedAt: legacy ? null : new Date(identity.authenticatedAt! * 1000),
          },
        },
      },
      include: { socialIdentities: true },
    })
  }
  beforeAll(async () => {
    process.env.AUTH_OTP_PEPPER = `pepper-${run}`
    process.env.AUTH_JWT_SECRET = `secret-${run}`
    prisma = new PrismaClient({ datasources: { db: { url } } })
    service = new SocialLoginService(
      db(),
      provider as unknown as OAuthProviderService,
      otp as unknown as OtpService,
    )
    worker = new SocialIdentityRetentionWorker(db(), provider as unknown as OAuthProviderService)
    jest.spyOn(worker['logger'], 'error').mockImplementation(() => undefined)
  })
  beforeEach(() => {
    jest.clearAllMocks()
    provider.revokeApple.mockResolvedValue(undefined)
  })
  afterEach(async () => {
    // Only records owned by this run. No table/database resets.
    await prisma.socialLoginChallenge.deleteMany({ where: { subjectHash: { in: hashes } } })
    await prisma.authIdentityTombstone.deleteMany({ where: { subjectHash: { in: hashes } } })
    await prisma.user.deleteMany({ where: { email: { in: emails } } })
  })
  afterAll(async () => {
    await prisma?.$disconnect()
    process.env = env
    jest.restoreAllMocks()
  })

  it('keeps an encrypted journal after business rollback, then consumes a successful grant', async () => {
    const identity = fixture('rollback')
    await expect(signIn({ ...identity, email: null })).rejects.toThrow(
      'Sign-in could not be verified',
    )
    const subjectHash = socialSubjectHash('apple', identity.subject)
    const abandoned = await prisma.socialLoginChallenge.findFirstOrThrow({
      where: { subjectHash, kind: 'grant' },
    })
    expect(abandoned.sealedRefreshToken).toBe(identity.sealedRefreshToken)
    expect(await prisma.socialIdentity.count({ where: { subjectHash } })).toBe(0)
    expect(
      (await signIn({ ...identity, authenticatedAt: identity.authenticatedAt! + 1 })).kind,
    ).toBe('session')
    // Only the failed attempt remains; successful ownership moved atomically.
    expect(await prisma.socialLoginChallenge.count({ where: { subjectHash, kind: 'grant' } })).toBe(
      1,
    )
    expect(await prisma.socialIdentity.count({ where: { subjectHash } })).toBe(1)
  })

  it('never replaces a newer working grant with an older abandoned one', async () => {
    const identity = fixture('freshness')
    const user = await linked(identity)
    const abandoned = await journal({
      ...identity,
      authenticatedAt: identity.authenticatedAt! - 10,
      sealedRefreshToken: 'older-fixture',
    })
    await worker.sweep()
    expect(provider.revokeApple).not.toHaveBeenCalled()
    expect(await prisma.socialLoginChallenge.findUnique({ where: { id: abandoned.id } })).toBeNull()
    expect(
      (
        await prisma.socialIdentity.findUniqueOrThrow({
          where: { id: user.socialIdentities[0].id },
        })
      ).sealedRefreshToken,
    ).toBe(identity.sealedRefreshToken)
  })

  it('adopts a newer journal but never adopts proof at or before a revocation marker', async () => {
    const identity = fixture('adoption')
    const user = await linked(identity)
    const subjectHash = socialSubjectHash('apple', identity.subject)
    const newer = {
      ...identity,
      authenticatedAt: identity.authenticatedAt! + 10,
      sealedRefreshToken: 'newer-journal-fixture',
    }
    await journal(newer)
    await worker.sweep()
    expect(
      (
        await prisma.socialIdentity.findUniqueOrThrow({
          where: { id: user.socialIdentities[0].id },
        })
      ).sealedRefreshToken,
    ).toBe(newer.sealedRefreshToken)
    await prisma.authIdentityTombstone.create({
      data: {
        provider: APPLE_REVOCATION_MARKER,
        subjectHash,
        deletedUserId: 'not-account-deletion',
        reason: 'consent-revoked',
        createdAt: new Date((identity.authenticatedAt! + 20) * 1000),
      },
    })
    for (const increment of [15, 20]) {
      await journal({
        ...identity,
        authenticatedAt: identity.authenticatedAt! + increment,
        sealedRefreshToken: 'revoked-fixture',
      })
      await worker.sweep()
      expect(
        (
          await prisma.socialIdentity.findUniqueOrThrow({
            where: { id: user.socialIdentities[0].id },
          })
        ).sealedRefreshToken,
      ).toBe(newer.sealedRefreshToken)
    }
    expect(provider.revokeApple).not.toHaveBeenCalled()
  })

  it.each([false, true])(
    'serializes actual acquisition against cleanup (account deleted: %s)',
    async (deleted) => {
      const identity = fixture(`acquisition-race-${deleted}`)
      const now = new Date()
      const user = deleted ? await linked(identity) : null
      if (user)
        await prisma.socialIdentity.updateMany({
          where: { userId: user.id },
          data: { cleanupNextAttemptAt: new Date(now.getTime() - 1000) },
        })
      const old = await journal(identity, now)
      let entered!: () => void
      let release!: () => void
      let claimed!: () => void
      const exchanging = new Promise<void>((resolve) => {
        entered = resolve
      })
      const allowExchange = new Promise<void>((resolve) => {
        release = resolve
      })
      const claimComplete = new Promise<void>((resolve) => {
        claimed = resolve
      })
      provider.verify.mockResolvedValue({ ...identity, sealedRefreshToken: null })
      provider.exchangeApple.mockImplementationOnce(async () => {
        entered()
        await allowExchange
        return { ...identity, authenticatedAt: identity.authenticatedAt! + 10 }
      })
      const { nonce } = await service.appleNonce()
      // Attach rejection immediately: deletion intentionally refuses login.
      const login = service
        .signIn('apple', { idToken: 'fixture', nonce, authorizationCode: 'code' })
        .then(
          (result) => ({ result, error: null }),
          (error: unknown) => ({ result: null, error }),
        )
      // Observe actual committed claims without substituting database behavior.
      const observedDb = {
        $transaction: prisma.$transaction.bind(prisma),
        $queryRaw: prisma.$queryRaw.bind(prisma),
        authIdentityTombstone: prisma.authIdentityTombstone,
        socialIdentity: {
          ...prisma.socialIdentity,
          updateMany: async (args: Prisma.SocialIdentityUpdateManyArgs) => {
            const result = await prisma.socialIdentity.updateMany(args)
            claimed()
            return result
          },
        },
        socialLoginChallenge: {
          ...prisma.socialLoginChallenge,
          updateMany: async (args: Prisma.SocialLoginChallengeUpdateManyArgs) => {
            const result = await prisma.socialLoginChallenge.updateMany(args)
            claimed()
            return result
          },
        },
      }
      const observingWorker = new SocialIdentityRetentionWorker(
        observedDb as unknown as PrismaService,
        provider as unknown as OAuthProviderService,
      )
      let cleanup: Promise<void> | undefined
      try {
        await exchanging
        if (user) await prisma.user.update({ where: { id: user.id }, data: { deletedAt: now } })
        cleanup = observingWorker.sweep(now)
        await claimComplete
        release()
        const outcome = await login
        await cleanup
        expect(provider.revokeApple).not.toHaveBeenCalled()
        if (deleted) {
          expect(outcome.error).not.toBeNull()
          expect(await prisma.socialIdentity.count({ where: { userId: user!.id } })).toBe(1)
          expect(
            await prisma.socialLoginChallenge.findUnique({ where: { id: old.id } }),
          ).not.toBeNull()
        } else expect(outcome.result?.kind).toBe('session')
      } finally {
        release()
        await login
        await cleanup
      }
    },
    15_000,
  )

  it('retains cleanup after provider success followed by a transaction rollback', async () => {
    const identity = fixture('post-revoke-rollback')
    const now = new Date()
    const row = await journal(identity, now)
    const failingDb = new Proxy(prisma, {
      get(target, key) {
        if (key === '$transaction')
          return (fn: (tx: unknown) => Promise<unknown>) =>
            target.$transaction(async (tx) => {
              await fn(tx)
              throw new Error('injected failure before commit')
            })
        const value = Reflect.get(target, key)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const failingWorker = new SocialIdentityRetentionWorker(
      failingDb as unknown as PrismaService,
      provider as unknown as OAuthProviderService,
    )
    jest.spyOn(failingWorker['logger'], 'error').mockImplementation(() => undefined)
    await failingWorker.sweep(now)
    expect(provider.revokeApple).toHaveBeenCalledTimes(1)
    expect(await prisma.socialLoginChallenge.findUnique({ where: { id: row.id } })).not.toBeNull()
    await worker.sweep(new Date(now.getTime() + 60_000))
    expect(provider.revokeApple).toHaveBeenCalledTimes(2)
    expect(await prisma.socialLoginChallenge.findUnique({ where: { id: row.id } })).toBeNull()
  })

  it('defers an orphan while a newer sign-in still owns an unexpired journal', async () => {
    const identity = fixture('pending')
    const now = new Date()
    const old = await journal(identity, now)
    await journal({ ...identity, authenticatedAt: identity.authenticatedAt! + 10 }, now, {
      expiresAt: new Date(now.getTime() + 600_000),
    })
    await worker.sweep(now)
    expect(provider.revokeApple).not.toHaveBeenCalled()
    const retained = await prisma.socialLoginChallenge.findUniqueOrThrow({ where: { id: old.id } })
    expect(retained.cleanupNextAttemptAt.getTime()).toBe(now.getTime() + 60_000)
  })

  it('rolls back legacy link consumption rather than discarding an unknown-freshness credential', async () => {
    const identity = fixture('legacy-link')
    const user = await linked(identity, true)
    const ticket = randomUUID()
    const pending = await journal(identity, new Date(), {
      kind: 'link',
      tokenHash: socialTicketHash(ticket),
      email: user.email,
      userId: user.id,
      expiresAt: new Date(Date.now() + 600_000),
    })
    otp.verifyCode.mockResolvedValue({ user: { id: user.id }, token: 'unbound-must-not-escape' })
    await expect(service.link(ticket, '123456')).rejects.toThrow('Sign-in could not be verified')
    expect(
      await prisma.socialLoginChallenge.findUnique({ where: { id: pending.id } }),
    ).not.toBeNull()
    expect(
      (
        await prisma.socialIdentity.findUniqueOrThrow({
          where: { id: user.socialIdentities[0].id },
        })
      ).providerAuthenticatedAt,
    ).toBeNull()
  })

  it('processes an eligible tail after 100 retained legacy grants, even after worker restart', async () => {
    const now = new Date()
    const old = new Date(now.getTime() - 2000)
    for (let i = 0; i < 100; i++) {
      const identity = fixture(`queue-${i}`)
      await linked(identity, true)
      await journal(identity, now, { cleanupNextAttemptAt: old })
    }
    const tail = fixture('queue-tail')
    const tailRow = await journal(tail, now)
    await worker.sweep(now)
    expect(provider.revokeApple).not.toHaveBeenCalled()
    expect(
      await prisma.socialLoginChallenge.findUnique({ where: { id: tailRow.id } }),
    ).not.toBeNull()
    const restarted = new SocialIdentityRetentionWorker(
      db(),
      provider as unknown as OAuthProviderService,
    )
    await restarted.sweep(now)
    expect(provider.revokeApple).toHaveBeenCalledTimes(1)
    expect(provider.revokeApple).toHaveBeenCalledWith(tail.sealedRefreshToken)
    expect(await prisma.socialLoginChallenge.findUnique({ where: { id: tailRow.id } })).toBeNull()
  }, 20_000)

  it('allows only one concurrent cleanup worker to claim an eligible grant', async () => {
    const identity = fixture('replicas')
    const now = new Date()
    const row = await journal(identity, now)
    const replica = new SocialIdentityRetentionWorker(
      db(),
      provider as unknown as OAuthProviderService,
    )
    await Promise.all([worker.sweep(now), replica.sweep(now)])
    expect(provider.revokeApple).toHaveBeenCalledTimes(1)
    expect(await prisma.socialLoginChallenge.findUnique({ where: { id: row.id } })).toBeNull()
  })

  it('stops a contended acquisition before contacting Apple, rather than exhausting its transaction lease', async () => {
    const identity = fixture('lock-contention')
    const subjectHash = socialSubjectHash('apple', identity.subject)
    let release!: () => void
    let ready!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const acquired = new Promise<void>((resolve) => {
      ready = resolve
    })
    const lock = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'apple'}), hashtext(${subjectHash}))::text`
        ready()
        await held
      },
      { timeout: 10_000 },
    )
    try {
      await acquired
      await expect(signIn(identity)).rejects.toThrow()
      expect(provider.exchangeApple).not.toHaveBeenCalled()
      expect(await prisma.socialLoginChallenge.count({ where: { subjectHash } })).toBe(0)
    } finally {
      release()
      await lock
    }
  }, 10_000)

  it('keeps a failed provider revocation durable and retries only when due after restart', async () => {
    const identity = fixture('retry-after-restart')
    const now = new Date()
    const row = await journal(identity, now)
    provider.revokeApple.mockRejectedValueOnce(new Error('provider unavailable'))
    await worker.sweep(now)
    expect(await prisma.socialLoginChallenge.findUnique({ where: { id: row.id } })).not.toBeNull()
    const restarted = new SocialIdentityRetentionWorker(
      db(),
      provider as unknown as OAuthProviderService,
    )
    await restarted.sweep(now)
    expect(provider.revokeApple).toHaveBeenCalledTimes(1)
    await restarted.sweep(new Date(now.getTime() + 60_000))
    expect(provider.revokeApple).toHaveBeenCalledTimes(2)
    expect(await prisma.socialLoginChallenge.findUnique({ where: { id: row.id } })).toBeNull()
  })

  it('retains old revocation markers while their identity exists, then prunes only unused old markers', async () => {
    const now = new Date()
    const identity = fixture('marker-active')
    const user = await linked(identity)
    const unused = fixture('marker-unused')
    const recent = fixture('marker-recent')
    for (const item of [identity, unused, recent])
      await prisma.authIdentityTombstone.create({
        data: {
          provider: APPLE_REVOCATION_MARKER,
          subjectHash: socialSubjectHash('apple', item.subject),
          deletedUserId: 'not-an-account-deletion',
          reason: 'consent-revoked',
          createdAt: item === recent ? now : new Date(now.getTime() - 31 * 86_400_000),
        },
      })
    expect(await pruneUnusedAppleRevocations(db(), now)).toBe(1)
    expect(
      await prisma.authIdentityTombstone.count({ where: { subjectHash: { in: hashes } } }),
    ).toBe(2)
    await prisma.socialIdentity.deleteMany({ where: { userId: user.id } })
    expect(await pruneUnusedAppleRevocations(db(), now)).toBe(1)
    expect(
      await prisma.authIdentityTombstone.count({
        where: { subjectHash: socialSubjectHash('apple', recent.subject) },
      }),
    ).toBe(1)
  })
})
