import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { EventEmitter2 } from '@nestjs/event-emitter'
import type { PrismaService } from '../../prisma/prisma.service'
import type { OtpService } from '../otp/otp.service'
import { verifySessionToken } from '../otp/jwt.util'
import { APPLE_REVOCATION_MARKER, assertAppleSessionCurrent } from './apple-session'
import { AppleNotificationService } from './apple-notification.service'
import type { OAuthProviderService } from './oauth.provider'
import { SocialLoginService, socialSubjectHash } from './oauth.service'

const url = process.env.SOCIAL_TEST_DATABASE_URL
if (url) {
  const target = new URL(url)
  if (target.hostname !== '127.0.0.1' || !target.pathname.endsWith('_test')) {
    throw new Error('Apple revocation tests require an isolated localhost *_test database')
  }
}

;(url ? describe : describe.skip)('Apple revocation PostgreSQL integration', () => {
  const env = { ...process.env }
  const run = randomUUID()
  const email = `apple-revocation-${run}@example.invalid`
  const subject = `apple-subject-${run}`
  const proofTime = Math.floor(Date.now() / 1000) - 100
  let prisma: PrismaClient
  let login: SocialLoginService
  let notifications: AppleNotificationService
  let userId: string
  let oldToken: string
  const provider = {
    configured: () => true,
    verify: jest.fn(),
    exchangeApple: jest.fn(),
    verifyAppleNotification: jest.fn(),
  }
  const otp = { requestCode: jest.fn(), verifyCode: jest.fn() }

  async function signIn(authenticatedAt: number) {
    const identity = {
      provider: 'apple',
      subject,
      email,
      name: 'Apple QA',
      sealedRefreshToken: 'test-only-encrypted-fixture',
      authenticatedAt,
    }
    provider.verify.mockResolvedValue({ ...identity, sealedRefreshToken: null })
    provider.exchangeApple.mockResolvedValue(identity)
    const { nonce } = await login.appleNonce()
    return login.signIn('apple', {
      idToken: 'provider-fixture',
      authorizationCode: 'test-code',
      nonce,
    })
  }
  async function revoke(eventTime: number) {
    provider.verifyAppleNotification.mockResolvedValue({
      type: 'consent-revoked',
      subject,
      eventTime,
    })
    return notifications.receive('signed-notification-fixture')
  }
  beforeAll(async () => {
    if (!url) throw new Error('SOCIAL_TEST_DATABASE_URL required')
    process.env.AUTH_OTP_PEPPER = `pepper-${run}`
    process.env.AUTH_JWT_SECRET = `secret-${run}`
    prisma = new PrismaClient({ datasources: { db: { url } } })
    login = new SocialLoginService(
      prisma as unknown as PrismaService,
      provider as unknown as OAuthProviderService,
      otp as unknown as OtpService,
    )
    notifications = new AppleNotificationService(
      prisma as unknown as PrismaService,
      provider as unknown as OAuthProviderService,
      new EventEmitter2(),
    )
  })
  afterAll(async () => {
    if (prisma) {
      await prisma.socialLoginChallenge.deleteMany({
        where: { OR: [{ email }, { subjectHash: socialSubjectHash('apple', subject) }] },
      })
      await prisma.authIdentityTombstone.deleteMany({
        where: {
          provider: APPLE_REVOCATION_MARKER,
          subjectHash: socialSubjectHash('apple', subject),
        },
      })
      await prisma.user.deleteMany({ where: { email } })
      await prisma.$disconnect()
    }
    process.env = env
  })

  it('binds a first Apple login and rejects that session after revocation', async () => {
    const result = await signIn(proofTime)
    if (result.kind !== 'session') throw new Error('Expected new session')
    oldToken = result.token
    const claims = verifySessionToken(result.token)
    userId = claims.sub
    expect(claims.apple_identity).toBeTruthy()
    expect(claims.apple_auth_time).toBe(proofTime)
    await expect(assertAppleSessionCurrent(prisma, claims)).resolves.toBeUndefined()
    await revoke(proofTime + 10)
    await expect(assertAppleSessionCurrent(prisma, claims)).rejects.toThrow('Please sign in again')
    expect(await prisma.user.count({ where: { id: userId, deletedAt: null } })).toBe(1)
  })
  it('rejects stale authorization, but allows newer re-authorization without reviving the old session', async () => {
    await expect(signIn(proofTime)).rejects.toThrow('Please sign in again')
    const result = await signIn(proofTime + 20)
    if (result.kind !== 'session') throw new Error('Expected renewed session')
    expect(verifySessionToken(result.token).sub).toBe(userId)
    await revoke(proofTime + 5) // Out-of-order event must not rewind the marker.
    await expect(
      assertAppleSessionCurrent(prisma, verifySessionToken(result.token)),
    ).resolves.toBeUndefined()
    await expect(assertAppleSessionCurrent(prisma, verifySessionToken(oldToken))).rejects.toThrow(
      'Please sign in again',
    )
  })
  it('cannot bypass revocation through an email-confirmed pending link', async () => {
    await prisma.socialIdentity.deleteMany({ where: { userId, provider: 'apple' } })
    const pending = await signIn(proofTime + 30)
    if (pending.kind !== 'link_required') throw new Error('Expected email ownership check')
    otp.verifyCode.mockResolvedValue({
      user: { id: userId },
      token: 'must-not-escape-as-unbound-session',
    })
    await revoke(proofTime + 40)
    await expect(login.link(pending.ticket, '123456')).rejects.toMatchObject({
      response: { code: 'OAUTH_LINK_EXPIRED' },
    })
    expect(await prisma.socialIdentity.count({ where: { userId } })).toBe(0)
    const fresh = await signIn(proofTime + 50)
    if (fresh.kind !== 'link_required') throw new Error('Expected fresh email ownership check')
    const linked = await login.link(fresh.ticket, '123456')
    if (linked.kind !== 'session') throw new Error('Expected linked session')
    const claims = verifySessionToken(linked.token)
    expect(claims.apple_auth_time).toBe(proofTime + 50)
    await expect(assertAppleSessionCurrent(prisma, claims)).resolves.toBeUndefined()
    await expect(assertAppleSessionCurrent(prisma, verifySessionToken(oldToken))).rejects.toThrow(
      'Please sign in again',
    )
  })
  it('serializes revocation with sign-in and never leaves a stale proof usable', async () => {
    const results = await Promise.allSettled([signIn(proofTime + 60), revoke(proofTime + 70)])
    expect(results[1].status).toBe('fulfilled')
    const result = results[0]
    if (result.status === 'fulfilled') {
      if (result.value.kind !== 'session') throw new Error('Expected session')
      await expect(
        assertAppleSessionCurrent(prisma, verifySessionToken(result.value.token)),
      ).rejects.toThrow('Please sign in again')
    } else expect(result.reason.message).toBe('Please sign in again')
  })
})
